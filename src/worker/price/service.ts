import type { Env } from "../env";
import { now } from "../clock";
import { eventStatement, logEvents, type NewEvent } from "../events/log";
import { tagVilla } from "../villa/membership";
import { prevDay } from "../../shared/rules/day";
import {
  BATTLE_BADGE_MS, BATTLE_POINTS, CHALLENGE_TTL_MS, MIN_MEMBERS_FOR_COMPETITION, battleWinner, dayStartMs, isSunday, leaguePoints, rankLeague, weekOf, type LeagueEntry,
} from "../../shared/rules/price";
import type { BattleSide, BattleView } from "../../shared/price";

/**
 * 집값 대결 [확정 — 기획자 결정, 2026-11-20]
 * - 집값은 자정 정산(cron/settle.ts)이 그날 값을 villa_prices 에 남긴다
 * - 여기서는 저장된 집값으로 주간 리그 · 1:1 대결을 끝내고 보상을 준다. 모든 쓰기는 "지금 상태일 때만" 조건이 붙어
 *   두 번 돌아도 · 동시에 돌아도 한 번만 바뀌고, 포인트는 보상 장부(price_rewards)에 새 줄이 들어갔을 때만 더한다
 */

/** 신청 중 · 진행 중 (아파트마다 하나) */
export const OPEN = "('pending','active')";

/** 그 아파트 지금 입주민 수 (SQL 식) */
export const MEMBERS = (villa: string) => `(SELECT COUNT(*) FROM memberships mc WHERE mc.villa_id = ${villa} AND mc.left_at IS NULL)`;

/** 마지막으로 정산한 날 (KST). 없으면 null */
export async function lastSettledDay(env: Env): Promise<string | null> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_settled_day'").first<{ value: string }>();
  return r ? r.value.slice(0, 10) : null;
}

/** 그 아파트 그날 집값 (SQL 식) */
export const PRICE_AT = (villa: string, day: string) => `(SELECT price FROM villa_prices WHERE villa_id = ${villa} AND day = ${day})`;

/** 가장 최근 주간 리그 1~3위면 순위 (SQL 식) */
export const TROPHY = (villa: string) =>
  `(SELECT lr.rank FROM league_results lr WHERE lr.villa_id = ${villa} AND lr.rank <= 3
    AND lr.week = (SELECT MAX(week) FROM league_results))`;

/** since(ms) 뒤에 끝난 대결에서 이겼다 (SQL 식) */
export const BATTLE_WIN = (villa: string, since: string) =>
  `EXISTS (SELECT 1 FROM battles bw WHERE bw.winner_villa_id = ${villa} AND bw.status = 'finished' AND bw.finished_at > ${since})`;

/** 지금 대결 중이거나 48시간 안의 신청이 있다 (SQL 식, cutoff = now - 48h) */
export const IN_BATTLE = (villa: string, cutoff: string) =>
  `EXISTS (SELECT 1 FROM battles bo WHERE bo.status IN ${OPEN} AND (bo.status = 'active' OR bo.created_at > ${cutoff})
    AND (bo.challenger_villa_id = ${villa} OR bo.opponent_villa_id = ${villa}))`;

export const challengeCutoff = (t: number) => t - CHALLENGE_TTL_MS;
export const badgeSince = (t: number) => t - BATTLE_BADGE_MS;

/** 지금 사는 입주민 (알림 · 보상 대상). before 를 주면 그 시각 전에 입주한 사람만 */
async function activeMembers(env: Env, villaId: string, before?: number): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT user_id AS userId FROM memberships WHERE villa_id = ? AND left_at IS NULL${before !== undefined ? " AND joined_at < ?" : ""}`,
  )
    .bind(...(before !== undefined ? [villaId, before] : [villaId]))
    .all<{ userId: string }>();
  return results.map((r) => r.userId);
}

const villaName = async (env: Env, id: string) =>
  (await env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(id).first<{ name: string }>())?.name ?? "";

/** 보상 한 사람 = 장부 한 줄 + (장부 줄이 새로 들어갔을 때만) 포인트. guard: 장부 줄을 넣을 조건(SQL, 뒤의 값은 args) */
function rewardStatements(env: Env, ref: string, villaId: string, users: string[], points: number, t: number, guard = "", args: unknown[] = []) {
  return users.flatMap((u) => [
    env.DB.prepare(
      `INSERT OR IGNORE INTO price_rewards (ref, user_id, villa_id, points, created_at) SELECT ?, ?, ?, ?, ?${guard ? ` WHERE ${guard}` : ""}`,
    ).bind(ref, u, villaId, points, t, ...args),
    env.DB.prepare("UPDATE users SET points = points + ? WHERE id = ? AND changes() = 1").bind(points, u),
  ]);
}

// ── 주간 리그 ──

/**
 * 일요일(day) 집값으로 그 주 리그를 매긴다: 공개 · 해체 안 된 아파트 중 그 주(월~일)에 인증이 하루라도 있는 아파트.
 * 1 · 2 · 3위 아파트에서 그 주가 시작되기 전에 입주해 지금도 사는 입주민에게 100 · 60 · 30P.
 * 순위 줄 · 보상 장부 · 포인트를 한 batch 로 쓰고, 그 주 순위가 이미 있으면 아무것도 하지 않는다.
 */
export async function settleLeague(env: Env, day: string): Promise<{ settled: boolean }> {
  if (!isSunday(day)) return { settled: false };
  const week = weekOf(day);
  const done = await env.DB.prepare("SELECT 1 AS x FROM league_results WHERE week = ? LIMIT 1").bind(week).first();
  if (done) return { settled: false };
  const { results } = await env.DB.prepare(
    `SELECT p.villa_id AS villaId, p.price, p.cert_days AS certDays, ${MEMBERS("v.id")} AS memberCount, v.created_at AS createdAt, v.name
     FROM villa_prices p JOIN villas v ON v.id = p.villa_id AND v.dissolved_at IS NULL AND v.public = 1
     WHERE p.day = ?`,
  )
    .bind(day)
    .all<LeagueEntry & { name: string }>();
  const ranked = rankLeague(results);
  if (!ranked.length) return { settled: false };

  const t = now();
  const weekStart = dayStartMs(week);
  const notDone = "NOT EXISTS (SELECT 1 FROM league_results WHERE week = ?)";
  const podium = ranked.filter((r) => r.rank <= 3);
  const eligible = new Map<string, string[]>();
  for (const r of podium) eligible.set(r.villaId, await activeMembers(env, r.villaId, weekStart));

  // 축하 카드: 1~3위 아파트 입주민 모두 (포인트는 받은 사람에게만 적힌다). 보상과 같은 batch 에 넣어 카드만 빠지는 일이 없게
  const cards: (NewEvent & { key: string })[] = [];
  for (const r of podium) {
    const got = new Set(eligible.get(r.villaId));
    const all = await activeMembers(env, r.villaId);
    const evs = all.map((u) => ({
      userId: u,
      type: "league_rank" as const,
      payload: { rank: r.rank, week, price: r.price, points: got.has(u) ? leaguePoints(r.rank) : 0 },
      key: `league:${week}:${r.villaId}:${u}`,
    }));
    cards.push(...((await tagVilla(env, r.villaId, evs)) as typeof evs));
  }

  const stmts: D1PreparedStatement[] = [];
  for (const r of podium) {
    stmts.push(...rewardStatements(env, `league:${week}:${r.villaId}`, r.villaId, eligible.get(r.villaId)!, leaguePoints(r.rank), t, notDone, [week]));
  }
  for (const e of cards) stmts.push(eventStatement(env, e, t, notDone, [week]));
  // 순위 줄은 맨 뒤에 (앞의 보상 · 알림 문장들이 "아직 순위가 없을 때만" 조건을 보므로)
  const first = stmts.length;
  for (const r of ranked) {
    stmts.push(
      env.DB.prepare("INSERT OR IGNORE INTO league_results (week, villa_id, rank, price, created_at) VALUES (?, ?, ?, ?, ?)").bind(week, r.villaId, r.rank, r.price, t),
    );
  }
  const res = await env.DB.batch(stmts);
  return { settled: res.slice(first).some((x) => x.meta.changes > 0) };
}

// ── 1:1 대결 ──

type BattleRow = {
  id: string; challengerVillaId: string; opponentVillaId: string; challengerUserId: string; status: string; reason: string | null;
  createdAt: number; respondedAt: number | null; startDay: string | null; endDay: string | null;
  challengerBase: number | null; opponentBase: number | null; challengerEnd: number | null; opponentEnd: number | null;
  winnerVillaId: string | null; finishedAt: number | null;
};

export const BATTLE_COLS = `b.id, b.challenger_villa_id AS challengerVillaId, b.opponent_villa_id AS opponentVillaId,
  b.challenger_user_id AS challengerUserId, b.status, b.reason, b.created_at AS createdAt, b.responded_at AS respondedAt,
  b.start_day AS startDay, b.end_day AS endDay, b.challenger_base AS challengerBase, b.opponent_base AS opponentBase,
  b.challenger_end AS challengerEnd, b.opponent_end AS opponentEnd, b.winner_villa_id AS winnerVillaId, b.finished_at AS finishedAt`;

/** 48시간 지난 신청을 만료로 바꾸고 신청한 아파트 방장에게 알린다. villaIds 를 주면 그 아파트가 낀 신청만 */
export async function expireChallenges(env: Env, villaIds?: string[]): Promise<number> {
  const t = now();
  const only = villaIds?.length
    ? ` AND (challenger_villa_id IN (${villaIds.map(() => "?").join(",")}) OR opponent_villa_id IN (${villaIds.map(() => "?").join(",")}))`
    : "";
  const { results } = await env.DB.prepare(
    `UPDATE battles SET status = 'expired', reason = 'expired', responded_at = ?
     WHERE status = 'pending' AND created_at <= ?${only}
     RETURNING id, challenger_villa_id AS challengerVillaId, opponent_villa_id AS opponentVillaId`,
  )
    .bind(t, challengeCutoff(t), ...(villaIds ?? []), ...(villaIds ?? []))
    .all<{ id: string; challengerVillaId: string; opponentVillaId: string }>();
  for (const r of results) {
    const owner = await env.DB.prepare("SELECT owner_id AS id FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(r.challengerVillaId).first<{ id: string }>();
    if (!owner) continue;
    await logEvents(
      env,
      await tagVilla(env, r.challengerVillaId, [
        { userId: owner.id, type: "battle_expired", payload: { opponentName: await villaName(env, r.opponentVillaId) }, key: `battle_expired:${r.id}` },
      ]),
    );
  }
  return results.length;
}

/**
 * 해체됐거나 지도에서 내려간 아파트가 낀 대결(신청 중 · 진행 중)을 취소한다. villaId 를 주면 그 아파트만 (공개 끔 · 해체 바로 뒤).
 * 진행 중이던 대결이면 남은 아파트 입주민에게 알린다. 보상은 없다
 */
export async function cancelGoneBattles(env: Env, villaId?: string): Promise<number> {
  const gone = (col: string) => `EXISTS (SELECT 1 FROM villas gv WHERE gv.id = battles.${col} AND (gv.dissolved_at IS NOT NULL OR gv.public = 0))`;
  const { results: open } = await env.DB.prepare(
    `SELECT id, status, challenger_villa_id AS c, opponent_villa_id AS o,
       (SELECT CASE WHEN dissolved_at IS NOT NULL THEN 'dissolved' WHEN public = 0 THEN 'private' END FROM villas WHERE id = challenger_villa_id) AS cGone,
       (SELECT CASE WHEN dissolved_at IS NOT NULL THEN 'dissolved' WHEN public = 0 THEN 'private' END FROM villas WHERE id = opponent_villa_id) AS oGone
     FROM battles WHERE status IN ${OPEN} AND (${gone("challenger_villa_id")} OR ${gone("opponent_villa_id")})
       ${villaId ? "AND (challenger_villa_id = ?1 OR opponent_villa_id = ?1)" : ""}`,
  )
    .bind(...(villaId ? [villaId] : []))
    .all<{ id: string; status: string; c: string; o: string; cGone: string | null; oGone: string | null }>();
  const t = now();
  let n = 0;
  for (const b of open) {
    const reason = b.cGone === "dissolved" || b.oGone === "dissolved" ? "dissolved" : "private";
    const res = await env.DB.prepare(
      `UPDATE battles SET status = 'cancelled', reason = ?, finished_at = ? WHERE id = ? AND status = ?
         AND (${gone("challenger_villa_id")} OR ${gone("opponent_villa_id")})`,
    )
      .bind(reason, t, b.id, b.status)
      .run();
    if (res.meta.changes !== 1) continue;
    n++;
    // 남은(해체 안 된) 아파트 쪽에 알린다: 진행 중이었으면 입주민 모두, 신청 중이었으면 방장만
    for (const [mine, other] of [[b.c, b.o], [b.o, b.c]] as const) {
      const v = await env.DB.prepare("SELECT owner_id AS ownerId FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(mine).first<{ ownerId: string }>();
      if (!v) continue;
      const users = b.status === "active" ? await activeMembers(env, mine) : [v.ownerId];
      const opponentName = await villaName(env, other);
      await logEvents(
        env,
        await tagVilla(
          env,
          mine,
          users.map((u) => ({ userId: u, type: "battle_cancelled" as const, payload: { opponentName, reason }, key: `battle_cancelled:${b.id}:${u}` })),
        ),
      );
    }
  }
  return n;
}

/**
 * 마지막 날(end_day)까지 정산된 진행 중 대결을 끝낸다: 오른 값(마지막 날 − 첫날 전날)이 큰 아파트가 이긴다. 같으면 무승부(보상 없음).
 * 이긴 아파트에서 첫날 전에 입주해 지금도 사는 입주민에게 50P. 상태 바꾸기 · 보상 장부 · 포인트를 한 batch 로.
 */
export async function finishBattles(env: Env, lastDay: string): Promise<number> {
  const { results } = await env.DB.prepare(`SELECT ${BATTLE_COLS} FROM battles b WHERE b.status = 'active' AND b.end_day <= ?`)
    .bind(lastDay)
    .all<BattleRow>();
  let n = 0;
  // 대결 하나가 실패해도 나머지는 끝낸다 (실패한 대결은 다음 날 다시)
  for (const b of results) {
    try {
      if (await finishOne(env, b)) n++;
    } catch (e) {
      console.warn(`battle ${b.id} finish failed`, e);
    }
  }
  return n;
}

/** 진행 중 대결을 이유와 함께 취소하고 두 아파트 입주민에게 알린다 (보상 없음) */
async function cancelActive(env: Env, b: BattleRow, reason: string, t: number): Promise<void> {
  const res = await env.DB.prepare("UPDATE battles SET status = 'cancelled', reason = ?, finished_at = ? WHERE id = ? AND status = 'active'")
    .bind(reason, t, b.id)
    .run();
  if (res.meta.changes === 1) await logEvents(env, await resultEvents(env, b, null, reason));
}

async function finishOne(env: Env, b: BattleRow): Promise<boolean> {
  const t = now();
  const baseDay = prevDay(b.startDay!);
  const prices = await env.DB.prepare(
    `SELECT ${PRICE_AT("?1", "?3")} AS cBase, ${PRICE_AT("?2", "?3")} AS oBase, ${PRICE_AT("?1", "?4")} AS cEnd, ${PRICE_AT("?2", "?4")} AS oEnd,
       ${MEMBERS("?1")} AS cMembers, ${MEMBERS("?2")} AS oMembers`,
  )
    .bind(b.challengerVillaId, b.opponentVillaId, baseDay, b.endDay)
    .first<{ cBase: number | null; oBase: number | null; cEnd: number | null; oEnd: number | null; cMembers: number; oMembers: number }>();
  // 끝날 때 어느 쪽이든 입주민이 3명보다 적으면 판정하지 않고 취소한다
  if (prices && (prices.cMembers < MIN_MEMBERS_FOR_COMPETITION || prices.oMembers < MIN_MEMBERS_FOR_COMPETITION)) {
    await cancelActive(env, b, "members", t);
    return false;
  }
  if (!prices || prices.cBase === null || prices.oBase === null || prices.cEnd === null || prices.oEnd === null) {
    // 집값이 빠진 날이 있으면(정산을 놓친 날 등) 판정하지 않고 취소한다
    await cancelActive(env, b, "no_price", t);
    return false;
  }
  const w = battleWinner({ base: prices.cBase, end: prices.cEnd }, { base: prices.oBase, end: prices.oEnd });
  const winner = w === "a" ? b.challengerVillaId : w === "b" ? b.opponentVillaId : null;
  const eligible = winner ? await activeMembers(env, winner, dayStartMs(b.startDay!)) : [];
  const done = { ...b, challengerBase: prices.cBase, opponentBase: prices.oBase, challengerEnd: prices.cEnd, opponentEnd: prices.oEnd };
  // 결과 카드도 같은 batch 에 (끝낸 그 실행이 보상 · 카드를 함께 쓴다. 카드만 빠지는 일이 없게)
  const cards = await resultEvents(env, done, winner, null, new Set(eligible));
  const finishedNow = "EXISTS (SELECT 1 FROM battles WHERE id = ? AND status = 'finished' AND finished_at = ?)";
  const [upd] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE battles SET status = 'finished', challenger_base = ?, opponent_base = ?, challenger_end = ?, opponent_end = ?,
         winner_villa_id = ?, finished_at = ? WHERE id = ? AND status = 'active'`,
    ).bind(prices.cBase, prices.oBase, prices.cEnd, prices.oEnd, winner, t, b.id),
    ...(winner ? rewardStatements(env, `battle:${b.id}`, winner, eligible, BATTLE_POINTS, t, finishedNow, [b.id, t]) : []),
    ...cards.map((e) => eventStatement(env, e, t, finishedNow, [b.id, t])),
  ]);
  return upd.meta.changes === 1;
}

/** 대결 결과 카드(또는 cancelled 면 취소 알림): 두 아파트(해체 안 된 쪽) 입주민 모두. 키는 고정 */
async function resultEvents(
  env: Env, b: BattleRow, winner: string | null, cancelled: string | null, rewarded = new Set<string>(),
): Promise<(NewEvent & { key: string })[]> {
  const names = { [b.challengerVillaId]: await villaName(env, b.challengerVillaId), [b.opponentVillaId]: await villaName(env, b.opponentVillaId) };
  const out: (NewEvent & { key: string })[] = [];
  for (const [mine, other, base, end, oBase, oEnd] of [
    [b.challengerVillaId, b.opponentVillaId, b.challengerBase, b.challengerEnd, b.opponentBase, b.opponentEnd],
    [b.opponentVillaId, b.challengerVillaId, b.opponentBase, b.opponentEnd, b.challengerBase, b.challengerEnd],
  ] as const) {
    const live = await env.DB.prepare("SELECT 1 AS x FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(mine).first();
    if (!live) continue;
    const users = await activeMembers(env, mine);
    const evs: (NewEvent & { key: string })[] = users.map((u) =>
      cancelled
        ? { userId: u, type: "battle_cancelled", payload: { opponentName: names[other], reason: cancelled }, key: `battle_cancelled:${b.id}:${u}` }
        : {
            userId: u,
            type: "battle_result",
            payload: {
              battleId: b.id,
              result: winner === null ? "draw" : winner === mine ? "won" : "lost",
              opponentName: names[other],
              myDelta: (end ?? 0) - (base ?? 0),
              theirDelta: (oEnd ?? 0) - (oBase ?? 0),
              points: rewarded.has(u) ? BATTLE_POINTS : 0,
            },
            key: `battle_result:${b.id}:${u}`,
          },
    );
    out.push(...((await tagVilla(env, mine, evs)) as typeof evs));
  }
  return out;
}

/**
 * 크론 (매일 정산 뒤): 48시간 지난 신청 만료 → 해체 · 비공개 아파트 대결 취소 → 끝난 대결 판정 → 최근 2주 일요일 리그.
 * 리그는 그 주 순위가 아직 없을 때만 매기므로, 앞서 실패한 날이 있어도 다음 날 다시 이어 한다
 */
export async function runCompetitions(env: Env): Promise<void> {
  // 단계마다 따로: 한 단계가 실패해도 나머지는 돈다 (실패한 단계는 다음 날 크론이 다시)
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`competitions: ${name} failed`, e);
    }
  };
  await step("expire", () => expireChallenges(env));
  await step("cancel", () => cancelGoneBattles(env));
  const last = await lastSettledDay(env);
  if (!last) return;
  await step("finish", () => finishBattles(env, last));
  let d = last;
  for (let i = 0; i < 14; i++, d = prevDay(d)) {
    const day = d;
    if (isSunday(day)) await step(`league ${day}`, () => settleLeague(env, day));
  }
}

// ── 화면용: 우리 아파트에서 본 대결 ──

/** 대결 행 하나를 우리 아파트(villaId) 쪽에서 본 모양으로. 진행 중이면 지금까지 오른 값을 저장된 집값으로 계산한다 */
export async function battleView(env: Env, b: BattleRow, villaId: string, today: string, last: string | null): Promise<BattleView> {
  const side = b.challengerVillaId === villaId ? "challenger" : "opponent";
  const meId = side === "challenger" ? b.challengerVillaId : b.opponentVillaId;
  const themId = side === "challenger" ? b.opponentVillaId : b.challengerVillaId;
  const [meName, themName] = await Promise.all([villaName(env, meId), villaName(env, themId)]);
  const view: BattleView = {
    id: b.id,
    status: b.status as BattleView["status"],
    reason: b.reason,
    side,
    me: { villaId: meId, name: meName, base: null, now: null, delta: null },
    them: { villaId: themId, name: themName, base: null, now: null, delta: null },
    createdAt: b.createdAt,
  };
  if (b.status === "pending") view.expiresAt = b.createdAt + CHALLENGE_TTL_MS;
  if (b.startDay && b.endDay) {
    view.startDay = b.startDay;
    view.endDay = b.endDay;
  }
  const fill = (s: BattleSide, base: number | null, end: number | null) => {
    s.base = base;
    s.now = end;
    s.delta = base !== null && end !== null ? end - base : null;
  };
  if (b.status === "active" && b.startDay && b.endDay) {
    const started = !!last && last >= b.startDay;
    // 지금 값 = 마지막으로 정산한 날 집값 (첫날이 아직 정산 전이면 기준값 그대로)
    const at = started ? (last! < b.endDay ? last! : b.endDay) : prevDay(b.startDay);
    const p = await env.DB.prepare(
      `SELECT ${PRICE_AT("?1", "?3")} AS mBase, ${PRICE_AT("?2", "?3")} AS tBase, ${PRICE_AT("?1", "?4")} AS mNow, ${PRICE_AT("?2", "?4")} AS tNow`,
    )
      .bind(meId, themId, prevDay(b.startDay), at)
      .first<{ mBase: number | null; tBase: number | null; mNow: number | null; tNow: number | null }>();
    fill(view.me, p?.mBase ?? null, p?.mNow ?? null);
    fill(view.them, p?.tBase ?? null, p?.tNow ?? null);
    view.started = started;
    const end = Date.parse(`${b.endDay}T00:00:00Z`);
    const from = Date.parse(`${today < b.startDay ? b.startDay : today}T00:00:00Z`);
    view.daysLeft = Math.max(0, Math.round((end - from) / 86_400_000) + 1);
  }
  if (b.status === "finished") {
    const mine = side === "challenger";
    fill(view.me, mine ? b.challengerBase : b.opponentBase, mine ? b.challengerEnd : b.opponentEnd);
    fill(view.them, mine ? b.opponentBase : b.challengerBase, mine ? b.opponentEnd : b.challengerEnd);
    view.result = b.winnerVillaId === null ? "draw" : b.winnerVillaId === villaId ? "won" : "lost";
    view.finishedAt = b.finishedAt;
  }
  return view;
}

/** 우리 아파트의 지금 대결(신청 중 · 진행 중) 하나. 48시간 지난 신청은 없는 것으로 본다 */
export async function currentBattleRow(env: Env, villaId: string): Promise<BattleRow | null> {
  return env.DB.prepare(
    `SELECT ${BATTLE_COLS} FROM battles b WHERE b.status IN ${OPEN} AND (b.status = 'active' OR b.created_at > ?2)
       AND (b.challenger_villa_id = ?1 OR b.opponent_villa_id = ?1) ORDER BY b.created_at DESC LIMIT 1`,
  )
    .bind(villaId, challengeCutoff(now()))
    .first<BattleRow>();
}

export async function recentBattleRows(env: Env, villaId: string, limit = 5): Promise<BattleRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${BATTLE_COLS} FROM battles b WHERE (b.challenger_villa_id = ?1 OR b.opponent_villa_id = ?1)
       AND (b.status NOT IN ${OPEN} OR (b.status = 'pending' AND b.created_at <= ?2))
     ORDER BY COALESCE(b.finished_at, b.responded_at, b.created_at) DESC LIMIT ?3`,
  )
    .bind(villaId, challengeCutoff(now()), limit)
    .all<BattleRow>();
  // 아직 크론이 만료로 바꾸지 않은 48시간 지난 신청은 만료로 보인다
  return results.map((r) => (r.status === "pending" ? { ...r, status: "expired", reason: "expired" } : r));
}

export type { BattleRow };
