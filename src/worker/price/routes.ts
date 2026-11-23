import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { logEvents } from "../events/log";
import { isMember, myActive, tagVilla } from "../villa/membership";
import { kstDay, prevDay } from "../../shared/rules/day";
import { battleDays } from "../../shared/rules/price";
import type { RankingMine, RankingResponse, RankingRow, Trophy, VillaBattles, VillaPrice } from "../../shared/price";
import type { VillaKind } from "../../shared/villa";
import { MIN_MEMBERS_FOR_COMPETITION, MIN_MEMBERS_MSG } from "../../shared/rules/price";
import {
  BATTLE_WIN, IN_BATTLE, MEMBERS, OPEN, PRICE_AT, TROPHY, badgeSince, battleView, challengeCutoff, currentBattleRow, expireChallenges,
  lastSettledDay, recentBattleRows,
} from "./service";

/**
 * 집값 대결 [확정 — 기획자 결정, 2026-11-20]
 * - 순위 · 집값: 공개 아파트는 누구나(로그인), 비공개 아파트 집값은 그 아파트 입주민만. 입주민 목록은 보내지 않는다
 * - 1:1 대결: 신청 · 받기 · 거절 · 신청 취소는 방장만. 바꾸는 문장 안에서 방장 · 공개 · 상태 · 한 번에 하나를 다시 본다
 */
export const price = new Hono<AppEnv>();

type Bindings = AppEnv["Bindings"];
const NO_VILLA = "아파트를 찾을 수 없어요";
const OWNER_ONLY = "대결은 방장만 신청하고 받을 수 있어요";
const NO_BATTLE = "대결을 찾을 수 없어요";
const DONE = "이미 처리된 대결 신청이에요";
const EXPIRED = "신청한 지 48시간이 지나 만료됐어요";
const NEED_PUBLIC = "도시 지도에 공개한 아파트만 대결할 수 있어요";
const RANK_LIMIT = 200;

const isUnique = (e: unknown) => String((e as Error)?.message ?? e).includes("UNIQUE");

/** 집값 순위: 공개 · 해체 안 된 아파트, 마지막으로 정산한 날 집값 높은 순 (집계 전 아파트는 맨 뒤) */
price.get("/api/ranking", requireUser, async (c) => {
  const me = c.get("userId");
  const t = now();
  const day = await lastSettledDay(c.env);
  const [rows, mine, week] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT v.id, v.name, v.kind,
         (SELECT COUNT(*) FROM memberships m WHERE m.villa_id = v.id AND m.left_at IS NULL) AS memberCount,
         p.price, p.price - ${PRICE_AT("v.id", "?2")} AS change, p.cert_days AS certDays,
         ${TROPHY("v.id")} AS trophy, ${BATTLE_WIN("v.id", "?3")} AS battleWin, ${IN_BATTLE("v.id", "?4")} AS inBattle
       FROM villas v LEFT JOIN villa_prices p ON p.villa_id = v.id AND p.day = ?1
       WHERE v.public = 1 AND v.dissolved_at IS NULL
       ORDER BY p.price IS NULL, p.price DESC, p.cert_days DESC, memberCount DESC, v.created_at ASC LIMIT ${RANK_LIMIT}`,
    ).bind(day ?? "", day ? prevDay(day) : "", badgeSince(t), challengeCutoff(t)),
    c.env.DB.prepare(
      `SELECT v.id AS villaId, v.name, v.owner_id = ?1 AS isOwner, v.public, ${IN_BATTLE("v.id", "?2")} AS inBattle, ${MEMBERS("v.id")} AS memberCount
       FROM ${myActive("?1")} ORDER BY m.joined_at ASC, m.rowid ASC`,
    ).bind(me, challengeCutoff(t)),
    c.env.DB.prepare("SELECT MAX(week) AS week FROM league_results"),
  ]);
  type Row = { id: string; name: string; kind: VillaKind; memberCount: number; price: number | null; change: number | null; trophy: number | null; battleWin: number; inBattle: number };
  let rank = 0;
  const villas: RankingRow[] = (rows.results as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.price === null ? null : ++rank,
    price: r.price,
    change: r.price === null ? null : r.change,
    memberCount: r.memberCount,
    kind: r.kind,
    ...(r.trophy ? { trophy: r.trophy as Trophy } : {}),
    ...(r.battleWin ? { battleWin: true } : {}),
    inBattle: !!r.inBattle,
  }));
  const my: RankingMine[] = (mine.results as { villaId: string; name: string; isOwner: number; public: number; inBattle: number; memberCount: number }[]).map((m) => ({
    villaId: m.villaId,
    name: m.name,
    isOwner: !!m.isOwner,
    public: !!m.public,
    inBattle: !!m.inBattle,
    memberCount: m.memberCount,
  }));
  return c.json({ day, villas, mine: my, leagueWeek: (week.results[0] as { week: string | null } | undefined)?.week ?? null } satisfies RankingResponse);
});

/** 아파트 집값 · 최근 14일 기록. 그 아파트 입주민이거나 공개 아파트일 때만 */
price.get("/api/villas/:id/price", requireUser, async (c) => {
  const id = c.req.param("id");
  const v = await c.env.DB.prepare("SELECT public FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(id).first<{ public: number }>();
  if (!v || (!v.public && !(await isMember(c.env, id, c.get("userId"))))) return jsonError(c, 404, NO_VILLA);
  return c.json(await villaPrice(c.env, id));
});

export async function villaPrice(env: Bindings, villaId: string): Promise<VillaPrice> {
  const day = await lastSettledDay(env);
  const { results } = await env.DB.prepare("SELECT day, price FROM villa_prices WHERE villa_id = ? ORDER BY day DESC LIMIT 14")
    .bind(villaId)
    .all<{ day: string; price: number }>();
  const history = results.reverse();
  const cur = history.find((h) => h.day === day) ?? null;
  const prev = day ? history.find((h) => h.day === prevDay(day)) ?? null : null;
  return { day, price: cur?.price ?? null, change: cur && prev ? cur.price - prev.price : null, history };
}

/** 우리 아파트 대결: 지금 대결(신청 중 · 진행 중) + 최근 끝난 대결 5개. 입주민만 (방장이 아니면 보기만) */
price.get("/api/villas/:id/battles", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  if (!(await isMember(c.env, id, me))) return jsonError(c, 404, "이 아파트에 사는 입주민이 아니에요");
  return c.json(await villaBattles(c.env, id, me));
});

export async function villaBattles(env: Bindings, villaId: string, userId: string): Promise<VillaBattles> {
  const v = await env.DB.prepare(`SELECT owner_id AS ownerId, public, ${MEMBERS("id")} AS memberCount FROM villas WHERE id = ?`)
    .bind(villaId)
    .first<{ ownerId: string; public: number; memberCount: number }>();
  const today = kstDay(now());
  const last = await lastSettledDay(env);
  const cur = await currentBattleRow(env, villaId);
  const recent = await recentBattleRows(env, villaId);
  return {
    isOwner: v?.ownerId === userId,
    public: !!v?.public,
    current: cur ? await battleView(env, cur, villaId, today, last) : null,
    recent: await Promise.all(recent.map((r) => battleView(env, r, villaId, today, last))),
    memberCount: v?.memberCount ?? 0,
  };
}

const ownedVilla = (env: Bindings, id: string) =>
  env.DB.prepare("SELECT name, owner_id AS ownerId, public FROM villas WHERE id = ? AND dissolved_at IS NULL")
    .bind(id)
    .first<{ name: string; ownerId: string; public: number }>();

/** 대결 신청: 우리 아파트(:id, 내가 방장) → 상대 아파트. 공개 · 방장 · 서로 대결 없음을 한 문장 안에서 본다 */
price.post("/api/villas/:id/battles", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const target = typeof b?.opponentVillaId === "string" ? b.opponentVillaId : "";
  if (!target) return jsonError(c, 400, "대결할 아파트를 골라 주세요");
  const mine = await ownedVilla(c.env, id);
  if (!mine) return jsonError(c, 404, NO_VILLA);
  if (mine.ownerId !== me) return jsonError(c, 403, OWNER_ONLY);

  // 48시간 지난 신청은 먼저 만료로 (신청한 방장에게 알림. 한 번에 하나 규칙 · 색인이 막지 않게)
  await expireChallenges(c.env, [id, target]);
  const t = now();
  const battleId = crypto.randomUUID();
  let changes = 0;
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO battles (id, challenger_villa_id, opponent_villa_id, challenger_user_id, status, created_at)
       SELECT ?1, ?2, ?3, ?4, 'pending', ?5
       WHERE ?2 != ?3
         AND EXISTS (SELECT 1 FROM villas WHERE id = ?2 AND owner_id = ?4 AND dissolved_at IS NULL AND public = 1)
         AND EXISTS (SELECT 1 FROM villas WHERE id = ?3 AND owner_id != ?4 AND dissolved_at IS NULL AND public = 1)
         AND ${MEMBERS("?2")} >= ?6 AND ${MEMBERS("?3")} >= ?6
         AND NOT EXISTS (SELECT 1 FROM battles WHERE status IN ${OPEN} AND (challenger_villa_id IN (?2, ?3) OR opponent_villa_id IN (?2, ?3)))`,
    )
      .bind(battleId, id, target, me, t, MIN_MEMBERS_FOR_COMPETITION)
      .run();
    changes = res.meta.changes;
  } catch (e) {
    // 같은 아파트가 동시에 두 곳에 신청한 경우 (battles_open_* 색인). 아래에서 이유를 고른다
    if (!isUnique(e)) throw e;
  }
  if (changes !== 1) return challengeRefusal(c, id, target, me, mine.public);

  const other = await ownedVilla(c.env, target);
  if (other) {
    await logEvents(
      c.env,
      await tagVilla(c.env, target, [
        { userId: other.ownerId, type: "battle_challenged", payload: { battleId, fromName: mine.name }, key: `battle_challenged:${battleId}` },
      ]),
    );
  }
  return c.json(await villaBattles(c.env, id, me), 201);
});

async function challengeRefusal(c: Context<AppEnv>, id: string, target: string, me: string, myPublic: number) {
  if (id === target) return jsonError(c, 400, "우리 아파트와는 대결할 수 없어요");
  const other = await ownedVilla(c.env, target);
  if (!other || !other.public) return jsonError(c, 404, "상대 아파트를 찾을 수 없어요. 지도에 공개된 아파트만 대결할 수 있어요");
  if (!myPublic) return jsonError(c, 409, NEED_PUBLIC);
  if (other.ownerId === me) return jsonError(c, 409, "내가 방장인 아파트끼리는 대결할 수 없어요");
  const counts = await c.env.DB.prepare(`SELECT ${MEMBERS("?1")} AS a, ${MEMBERS("?2")} AS b`).bind(id, target).first<{ a: number; b: number }>();
  if ((counts?.a ?? 0) < MIN_MEMBERS_FOR_COMPETITION) return jsonError(c, 409, MIN_MEMBERS_MSG);
  if ((counts?.b ?? 0) < MIN_MEMBERS_FOR_COMPETITION) return jsonError(c, 409, `입주민이 ${MIN_MEMBERS_FOR_COMPETITION}명 이상인 아파트와만 대결할 수 있어요`);
  if (await currentBattleRow(c.env, id)) return jsonError(c, 409, "우리 아파트는 이미 대결 중이거나 신청이 오가는 중이에요. 대결은 한 번에 하나만 해요");
  if (await currentBattleRow(c.env, target)) return jsonError(c, 409, "상대 아파트가 지금 다른 대결 중이에요");
  return jsonError(c, 409, "신청하지 못했어요. 다시 해 주세요");
}

type Row = { id: string; c: string; o: string; status: string; createdAt: number };
const battleOf = (env: Bindings, id: string) =>
  env.DB.prepare("SELECT id, challenger_villa_id AS c, opponent_villa_id AS o, status, created_at AS createdAt FROM battles WHERE id = ?")
    .bind(id)
    .first<Row>();

/** 대결을 바꿀 수 없을 때 이유 (방장 · 상태 · 만료) */
async function actionRefusal(c: Context<AppEnv>, bid: string, villaCol: "c" | "o") {
  const b = await battleOf(c.env, bid);
  if (!b) return jsonError(c, 404, NO_BATTLE);
  const v = await ownedVilla(c.env, b[villaCol]);
  if (!v || v.ownerId !== c.get("userId")) return jsonError(c, 403, OWNER_ONLY);
  if (b.status !== "pending") return jsonError(c, 409, DONE);
  if (b.createdAt <= challengeCutoff(now())) {
    await expireChallenges(c.env, [b.c]);
    return jsonError(c, 409, EXPIRED);
  }
  const other = await ownedVilla(c.env, b[villaCol === "c" ? "o" : "c"]);
  if (!v.public || !other?.public) return jsonError(c, 409, NEED_PUBLIC);
  const counts = await c.env.DB.prepare(`SELECT ${MEMBERS("?1")} AS mine, ${MEMBERS("?2")} AS theirs`).bind(b[villaCol], b[villaCol === "c" ? "o" : "c"]).first<{ mine: number; theirs: number }>();
  if ((counts?.mine ?? 0) < MIN_MEMBERS_FOR_COMPETITION) return jsonError(c, 409, MIN_MEMBERS_MSG);
  if ((counts?.theirs ?? 0) < MIN_MEMBERS_FOR_COMPETITION) return jsonError(c, 409, `상대 아파트 입주민이 ${MIN_MEMBERS_FOR_COMPETITION}명보다 적어 지금은 받을 수 없어요`);
  return jsonError(c, 409, "처리하지 못했어요. 다시 해 주세요");
}

/** 받기: 상대 아파트 방장만. 받은 다음 날부터 7일 */
price.post("/api/battles/:bid/accept", requireUser, async (c) => {
  const bid = c.req.param("bid");
  const t = now();
  const { start, end } = battleDays(kstDay(t));
  const { results } = await c.env.DB.prepare(
    `UPDATE battles SET status = 'active', responded_at = ?1, start_day = ?2, end_day = ?3
     WHERE id = ?4 AND status = 'pending' AND created_at > ?5
       AND EXISTS (SELECT 1 FROM villas WHERE id = battles.opponent_villa_id AND owner_id = ?6 AND dissolved_at IS NULL AND public = 1)
       AND EXISTS (SELECT 1 FROM villas WHERE id = battles.challenger_villa_id AND dissolved_at IS NULL AND public = 1)
       AND ${MEMBERS("battles.opponent_villa_id")} >= ?7 AND ${MEMBERS("battles.challenger_villa_id")} >= ?7
     RETURNING challenger_villa_id AS c, opponent_villa_id AS o`,
  )
    .bind(t, start, end, bid, challengeCutoff(t), c.get("userId"), MIN_MEMBERS_FOR_COMPETITION)
    .all<{ c: string; o: string }>();
  if (!results.length) return actionRefusal(c, bid, "o");
  const { c: cv, o: ov } = results[0];
  // 두 아파트 입주민 모두에게: 내일부터 7일
  for (const [mine, other] of [[cv, ov], [ov, cv]]) {
    const name = (await ownedVilla(c.env, other))?.name ?? "";
    const { results: users } = await c.env.DB.prepare("SELECT user_id AS u FROM memberships WHERE villa_id = ? AND left_at IS NULL").bind(mine).all<{ u: string }>();
    await logEvents(
      c.env,
      await tagVilla(
        c.env,
        mine,
        users.map((r) => ({ userId: r.u, type: "battle_started" as const, payload: { opponentName: name, startDay: start, endDay: end }, key: `battle_started:${bid}:${r.u}` })),
      ),
    );
  }
  return c.json(await villaBattles(c.env, ov, c.get("userId")));
});

/** 거절: 상대 아파트 방장만. 신청한 아파트 방장에게 알림 */
price.post("/api/battles/:bid/decline", requireUser, async (c) => {
  const bid = c.req.param("bid");
  const t = now();
  const { results } = await c.env.DB.prepare(
    `UPDATE battles SET status = 'declined', reason = 'declined', responded_at = ?1
     WHERE id = ?2 AND status = 'pending' AND created_at > ?3
       AND EXISTS (SELECT 1 FROM villas WHERE id = battles.opponent_villa_id AND owner_id = ?4 AND dissolved_at IS NULL)
     RETURNING challenger_villa_id AS c, opponent_villa_id AS o`,
  )
    .bind(t, bid, challengeCutoff(t), c.get("userId"))
    .all<{ c: string; o: string }>();
  if (!results.length) {
    return actionRefusal(c, bid, "o");
  }
  const { c: cv, o: ov } = results[0];
  const challenger = await ownedVilla(c.env, cv);
  const name = (await ownedVilla(c.env, ov))?.name ?? "";
  if (challenger) {
    await logEvents(
      c.env,
      await tagVilla(c.env, cv, [{ userId: challenger.ownerId, type: "battle_declined", payload: { opponentName: name }, key: `battle_declined:${bid}` }]),
    );
  }
  return c.json(await villaBattles(c.env, ov, c.get("userId")));
});

/** 신청 취소: 신청한 아파트 방장만, 상대가 받기 전에만 */
price.post("/api/battles/:bid/cancel", requireUser, async (c) => {
  const bid = c.req.param("bid");
  const t = now();
  const { results } = await c.env.DB.prepare(
    `UPDATE battles SET status = 'cancelled', reason = 'withdrawn', responded_at = ?1
     WHERE id = ?2 AND status = 'pending'
       AND EXISTS (SELECT 1 FROM villas WHERE id = battles.challenger_villa_id AND owner_id = ?3 AND dissolved_at IS NULL)
     RETURNING challenger_villa_id AS c`,
  )
    .bind(t, bid, c.get("userId"))
    .all<{ c: string }>();
  if (!results.length) {
    const b = await battleOf(c.env, bid);
    if (!b) return jsonError(c, 404, NO_BATTLE);
    const v = await ownedVilla(c.env, b.c);
    if (!v || v.ownerId !== c.get("userId")) return jsonError(c, 403, OWNER_ONLY);
    return jsonError(c, 409, b.status === "active" ? "이미 시작된 대결은 취소할 수 없어요" : DONE);
  }
  return c.json(await villaBattles(c.env, results[0].c, c.get("userId")));
});
