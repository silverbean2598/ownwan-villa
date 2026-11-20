import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { certifiedInVilla } from "../cert/certified";
import { myActive } from "../villa/membership";
import { kstDay, prevDay } from "../../shared/rules/day";
import type { Trophy } from "../../shared/price";
import { displayFloor } from "../../shared/rules/streak";
import { CITY_LIMIT, type CityMine, type CityResponse, type CityVilla } from "../../shared/city";
import type { VillaKind } from "../../shared/villa";
import { parseSports } from "../../shared/recruit";
import { myApplication } from "../recruit/routes";
import { closeIfHidden } from "../recruit/service";
import { BATTLE_WIN, IN_BATTLE, PRICE_AT, TROPHY, badgeSince, cancelGoneBattles, challengeCutoff, lastSettledDay } from "../price/service";

export const city = new Hono<AppEnv>();

/** 지도에 나오는 빌라: 공개 · 해체 안 됨 · 자리 있음. 자리 번호 순으로 앞에서부터 CITY_LIMIT 곳 */
const SHOWN = `SELECT id FROM villas WHERE public = 1 AND dissolved_at IS NULL AND map_slot IS NOT NULL ORDER BY map_slot LIMIT ${CITY_LIMIT}`;

/**
 * 비어 있는 가장 작은 자리 번호. 0번이 비었으면 0, 아니면 "바로 다음 번호가 빈 자리" 중 가장 작은 것.
 * UPDATE 문 안에 넣어 한 문장으로 고르고 쓴다 (D1 은 쓰기를 한 줄로 세워 실행하므로 두 빌라가 같은 번호를 고르지 않는다)
 */
const FREE_SLOT = `CASE WHEN NOT EXISTS (SELECT 1 FROM villas WHERE map_slot = 0) THEN 0 ELSE
  (SELECT MIN(a.map_slot) + 1 FROM villas a WHERE a.map_slot IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM villas b WHERE b.map_slot = a.map_slot + 1)) END`;

const isUnique = (e: unknown) => String((e as Error)?.message ?? e).includes("UNIQUE");

city.get("/api/city", requireUser, async (c) => {
  const userId = c.get("userId");
  const t = now();
  const today = kstDay(t);
  // 집값은 마지막으로 정산한 날 값 (전날과 비교)
  const priceDay = (await lastSettledDay(c.env)) ?? "";
  // 한 번에 묻는다: 내 빌라 · 지도 빌라 · 지도 빌라 입주민의 (층, 연속 기록, 오늘 인증) 만
  const [mineRes, villasRes, membersRes, bansRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT v.id AS villaId, v.name, v.public, v.owner_id = ?1 AS isOwner, ${IN_BATTLE("v.id", "?2")} AS inBattle,
         (SELECT COUNT(*) FROM memberships mc WHERE mc.villa_id = v.id AND mc.left_at IS NULL) AS memberCount
       FROM ${myActive("?1")} ORDER BY m.joined_at ASC, m.rowid ASC`,
    ).bind(userId, challengeCutoff(t)),
    c.env.DB.prepare(
      `SELECT v.id, v.name, v.map_slot AS slot, v.kind, v.capacity,
         (SELECT u.nickname FROM users u JOIN memberships pm ON pm.user_id = u.id
          WHERE u.id = v.penthouse_user_id AND pm.villa_id = v.id AND pm.left_at IS NULL) AS penthouseNickname,
         r.intro AS recruitIntro, r.sports AS recruitSports,
         ${PRICE_AT("v.id", "?1")} AS price, ${PRICE_AT("v.id", "?1")} - ${PRICE_AT("v.id", "?2")} AS priceChange,
         ${TROPHY("v.id")} AS trophy, ${BATTLE_WIN("v.id", "?3")} AS battleWin, ${IN_BATTLE("v.id", "?4")} AS inBattle
       FROM villas v LEFT JOIN villa_recruits r ON r.villa_id = v.id AND r.open = 1
       WHERE v.id IN (${SHOWN}) ORDER BY v.map_slot`,
    ).bind(priceDay, priceDay ? prevDay(priceDay) : "", badgeSince(t), challengeCutoff(t)),
    c.env.DB.prepare(
      // 빌라마다: 그 빌라에 오늘 올린 사진 인증이 있는 입주민만 불이 켜지고, 층도 그 빌라 기준
      `SELECT m.villa_id AS villaId, m.floor, m.streak, ${certifiedInVilla("m.user_id", "?1", "m.villa_id")} AS lit
       FROM memberships m
       WHERE m.left_at IS NULL AND m.villa_id IN (${SHOWN})`,
    ).bind(today),
    // 내가 입주 금지된 빌라 (그 빌라 모집 카드에서 신청 버튼을 숨긴다. 금지 사실 자체는 말하지 않는다)
    c.env.DB.prepare("SELECT villa_id AS villaId FROM villa_bans WHERE user_id = ?").bind(userId),
  ]);
  const blocked = new Set((bansRes.results as { villaId: string }[]).map((r) => r.villaId));

  const agg = new Map<string, { memberCount: number; litCount: number; topFloor: number }>();
  for (const r of membersRes.results as { villaId: string; floor: number; streak: number; lit: number }[]) {
    const a = agg.get(r.villaId) ?? { memberCount: 0, litCount: 0, topFloor: 1 };
    a.memberCount += 1;
    if (r.lit) a.litCount += 1;
    a.topFloor = Math.max(a.topFloor, displayFloor(r.floor, r.streak, !!r.lit));
    agg.set(r.villaId, a);
  }
  type Row = {
    id: string; name: string; slot: number; kind: VillaKind; capacity: number; penthouseNickname: string | null; recruitIntro: string | null; recruitSports: string | null;
    price: number | null; priceChange: number | null; trophy: number | null; battleWin: number; inBattle: number;
  };
  const villas: CityVilla[] = (villasRes.results as Row[]).map(({ recruitIntro, recruitSports, price, priceChange, trophy, battleWin, inBattle, ...v }) => {
    const a = agg.get(v.id) ?? { memberCount: 0, litCount: 0, topFloor: 1 };
    // 모집 글은 모집 중이고 빈방이 있을 때만 (빌라마다 정원: 빌라 20 · 아파트 50, 꽉 차면 숨긴다). 모집 글 · 빈방 수 말고는 더 보내지 않는다
    const recruiting = recruitIntro !== null && a.memberCount < v.capacity;
    return {
      ...v,
      ...a,
      // 집값 대결: 집값 · 전날 대비 · 리그 트로피 · 대결 승리 배지 · 대결 중 (숫자와 표시만)
      price,
      priceChange: price === null ? null : priceChange,
      ...(trophy ? { trophy: trophy as Trophy } : {}),
      ...(battleWin ? { battleWin: true } : {}),
      inBattle: !!inBattle,
      ...(recruiting
        ? { recruit: { intro: recruitIntro, sports: parseSports(recruitSports), vacancies: v.capacity - a.memberCount, ...(blocked.has(v.id) ? { blocked: true as const } : {}) } }
        : {}),
    };
  });
  const myVillas: CityMine[] = (mineRes.results as { villaId: string; name: string; public: number; isOwner: number; inBattle: number; memberCount: number }[]).map((m) => ({
    villaId: m.villaId,
    name: m.name,
    public: !!m.public,
    isOwner: !!m.isOwner,
    inBattle: !!m.inBattle,
    memberCount: m.memberCount,
  }));
  return c.json({ mine: myVillas[0] ?? null, myVillas, villas, myApplication: await myApplication(c.env, userId) } satisfies CityResponse);
});

/** 방장이 도시 지도 공개를 켜고 끈다. 켤 때 자리가 없으면 비어 있는 가장 작은 자리를 받는다 (끌 때는 자리를 지킨다) */
city.put("/api/villas/:id/public", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (typeof b?.public !== "boolean") return jsonError(c, 400, "공개할지 골라 주세요");
  const v = await c.env.DB.prepare("SELECT owner_id FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(id).first<{ owner_id: string }>();
  if (!v) return jsonError(c, 404, "빌라를 찾을 수 없어요");
  if (v.owner_id !== me) return jsonError(c, 403, "방장만 할 수 있어요");

  // 방장 확인 · 해체 확인을 쓰는 문장 안에서 한 번 더 (그 사이 방장이 바뀌거나 해체돼도 바뀌지 않게)
  const guard = "WHERE id = ? AND owner_id = ? AND dissolved_at IS NULL";
  // 진행 중인 대결이 있으면 비공개로 바꿀 수 없다 (지도에서 내려 대결을 무르지 못하게). 신청 중인 대결은 내리면 취소된다
  const noActive = `AND NOT EXISTS (SELECT 1 FROM battles WHERE status = 'active' AND (challenger_villa_id = villas.id OR opponent_villa_id = villas.id))`;
  const stmt = b.public
    ? c.env.DB.prepare(`UPDATE villas SET public = 1, map_slot = COALESCE(map_slot, ${FREE_SLOT}) ${guard}`).bind(id, me)
    : c.env.DB.prepare(`UPDATE villas SET public = 0 ${guard} ${noActive}`).bind(id, me);
  let changes = 0;
  // 같은 번호가 이미 쓰였다면(유일 색인) 다시 고른다
  for (let i = 0; ; i++) {
    try {
      changes = (await stmt.run()).meta.changes;
      break;
    } catch (e) {
      if (!isUnique(e) || i >= 4) throw e;
    }
  }
  if (changes !== 1) {
    if (!b.public) {
      const active = await c.env.DB.prepare(
        "SELECT 1 AS x FROM battles WHERE status = 'active' AND (challenger_villa_id = ?1 OR opponent_villa_id = ?1) LIMIT 1",
      )
        .bind(id)
        .first();
      if (active) return jsonError(c, 409, "대결이 끝난 뒤에 비공개로 바꿀 수 있어요");
    }
    return jsonError(c, 409, "방장이 바뀌었거나 빌라가 없어졌어요. 다시 열어 주세요");
  }
  // 지도에서 내리면 빈방 모집도 끄고 기다리던 신청을 취소한다 (지금도 내려가 있을 때만)
  if (!b.public) {
    await closeIfHidden(c.env, id);
    // 지도에서 내리면 신청 중 · 진행 중 대결도 취소한다 (보상 없음)
    await cancelGoneBattles(c.env, id).catch((e) => console.error("battle cleanup failed", e));
  }
  return c.json({ public: b.public });
});
