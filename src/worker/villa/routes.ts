import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { sessionUserId } from "../auth/session";
import { DEFAULT_AVATAR, parseAvatar } from "../../shared/avatar";
import { kstDay } from "../../shared/rules/day";
import { displayFloor } from "../../shared/rules/streak";
import {
  MAX_MEMBERS, NameMismatchError, NotInVillaError, NotMemberError, NotOwnerError, VillaGoneError,
  dissolveVilla, kickMember, leaveVilla, newInviteToken, recomputePenthouse, transferOwner,
} from "./service";
import { CERTIFIED_PHOTO, certifiedInVilla } from "../cert/certified";
import { logEvents } from "../events/log";
import { ACTIVE_COUNT, myActive, isMember, myVillaIds, tagVilla } from "./membership";
import { MAX_VILLAS_PER_USER, VILLA_LIMIT_MSG, type MyVilla } from "../../shared/villa";

export const villa = new Hono<AppEnv>();

export function safeAvatar(raw: string) {
  try {
    return parseAvatar(JSON.parse(raw)) ?? DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

const BAD_NAME = "빌라 이름은 1~20자로 지어 주세요";
const EXPIRED = "초대 링크가 만료됐어요";
const BANNED = "이 빌라에는 다시 입주할 수 없어요";
const NO_VILLA = "빌라를 찾을 수 없어요";
const OWNER_ONLY = "방장만 할 수 있어요";
const NOT_MEMBER = "이 빌라에 사는 입주민이 아니에요";

function cleanName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= 1 && s.length <= 20 ? s : null;
}
const isUnique = (e: unknown) => String((e as Error)?.message ?? e).includes("UNIQUE");

villa.post("/api/villas", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const name = cleanName(b?.name);
  if (!name) return jsonError(c, 400, BAD_NAME);
  const id = crypto.randomUUID();
  const inviteToken = newInviteToken();
  const t = now();
  const membershipId = crypto.randomUUID();
  // 한 batch(트랜잭션): 사는 빌라가 3곳보다 적을 때만 입주 기록을 넣고, 넣었을 때만 빌라를 짓는다 (동시에 만들어도 넘치지 않게)
  const [, made] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at)
       SELECT ?1, ?2, ?3, 1, ?4, ?4 WHERE ${ACTIVE_COUNT("?2")} < ?5`,
    ).bind(membershipId, userId, id, t, MAX_VILLAS_PER_USER),
    c.env.DB.prepare(
      "INSERT INTO villas (id, name, owner_id, invite_token, penthouse_user_id, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1",
    ).bind(id, name, userId, inviteToken, userId, t),
  ]);
  if (made.meta.changes !== 1) return jsonError(c, 409, VILLA_LIMIT_MSG);
  await logEvents(c.env, await tagVilla(c.env, id, [{ userId, type: "welcome", payload: { villaName: name }, key: `welcome:${membershipId}` }]));
  return c.json({ id, inviteToken }, 201);
});

/** 내가 사는 빌라 목록 (입주한 순서). 빌라 바꾸기 · 인증할 빌라 고르기 · 설정에서 쓴다 */
villa.get("/api/me/villas", requireUser, async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.name, v.owner_id AS ownerId, v.public, m.joined_at AS joinedAt,
       (SELECT COUNT(*) FROM memberships o WHERE o.villa_id = v.id AND o.left_at IS NULL) AS memberCount,
       ${certifiedInVilla("m.user_id", "?2", "m.villa_id")} AS certifiedToday
     FROM ${myActive("?1")} ORDER BY m.joined_at ASC, m.rowid ASC`,
  )
    .bind(userId, kstDay(now()))
    .all<Omit<MyVilla, "public" | "certifiedToday"> & { public: number; certifiedToday: number }>();
  return c.json(results.map((r) => ({ ...r, public: !!r.public, certifiedToday: !!r.certifiedToday })) satisfies MyVilla[]);
});

/**
 * 빌라 화면 한 채: 입주민 · 층 · 불 · 놓은 가구. 이 빌라 입주민만 본다.
 * 입주민마다 streak(이 빌라 층을 정하는 연속 기록), certifiedToday(오늘 이 빌라에 올림 = 이 빌라에서 불 켜짐),
 * userStreak · certifiedAnywhere(어느 빌라든 올린 날로 센 연속 기록 · 오늘 인증)를 함께 보낸다.
 */
async function villaDetail(env: AppEnv["Bindings"], villaId: string, userId: string) {
  const v = await env.DB.prepare(
    `SELECT v.id, v.name, v.owner_id AS ownerId, v.penthouse_user_id AS penthouseUserId, v.invite_token AS inviteToken, v.public
     FROM ${myActive("?1")} AND m.villa_id = ?2`,
  )
    .bind(userId, villaId)
    .first<{ id: string; name: string; ownerId: string; penthouseUserId: string | null; inviteToken: string; public: number }>();
  if (!v) return null;
  const day = kstDay(now());
  const { results } = await env.DB.prepare(
    `SELECT u.id AS userId, u.nickname, u.sport, u.avatar, m.floor, m.streak, u.streak AS userStreak,
       ${certifiedInVilla("u.id", "?1", "m.villa_id")} AS certifiedToday,
       EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.day = ?1 AND ${CERTIFIED_PHOTO}) AS certifiedAnywhere
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.villa_id = ?2 AND m.left_at IS NULL ORDER BY m.joined_at ASC, m.rowid ASC`,
  )
    .bind(day, v.id)
    .all<{
      userId: string; nickname: string; sport: string | null; avatar: string; floor: number; streak: number; userStreak: number;
      certifiedToday: number; certifiedAnywhere: number;
    }>();
  const pl = await env.DB.prepare(
    `SELECT p.user_id AS userId, p.slot, p.item_id AS itemId FROM placements p
     JOIN memberships m ON m.user_id = p.user_id AND m.left_at IS NULL WHERE m.villa_id = ?`,
  )
    .bind(v.id)
    .all<{ userId: string; slot: string; itemId: string }>();
  const members = results.map((r) => {
    const floor = displayFloor(r.floor, r.streak, !!r.certifiedToday);
    return {
      ...r,
      floor,
      floorUpToday: floor > r.floor,
      avatar: safeAvatar(r.avatar),
      certifiedToday: !!r.certifiedToday,
      certifiedAnywhere: !!r.certifiedAnywhere,
      placements: pl.results.filter((p) => p.userId === r.userId).map((p) => ({ slot: p.slot, itemId: p.itemId })),
    };
  });
  // 초대 링크는 방장만 받는다
  const { inviteToken, ...rest } = v;
  return { ...rest, public: !!v.public, ...(v.ownerId === userId ? { inviteToken } : {}), members };
}

/** 예전 화면(배포 전에 열어 둔 탭)용: 가장 먼저 입주한 빌라 한 채. 새 화면은 /api/me/villas + /api/villas/:id 를 쓴다 */
villa.get("/api/villas/mine", requireUser, async (c) => {
  const userId = c.get("userId");
  const [first] = await myVillaIds(c.env, userId);
  return c.json(first ? await villaDetail(c.env, first, userId) : null);
});

villa.get("/api/villas/:id", requireUser, async (c) => {
  const d = await villaDetail(c.env, c.req.param("id"), c.get("userId"));
  if (!d) return jsonError(c, 404, NOT_MEMBER);
  return c.json(d);
});

/** 한 빌라에서 나가기. 다른 빌라 · 연속 기록 · 포인트 · 가구는 그대로 */
villa.post("/api/villas/:id/leave", requireUser, async (c) => {
  try {
    await leaveVilla(c.env, c.get("userId"), c.req.param("id"));
  } catch (e) {
    if (e instanceof NotInVillaError) return jsonError(c, 409, "이 빌라에 살고 있지 않아요");
    throw e;
  }
  return c.json({ ok: true });
});

/** 예전 화면용 나가기: villaId 를 주거나, 빌라가 1곳뿐이면 그 빌라에서 나간다 */
villa.post("/api/villas/leave", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  let villaId = typeof b?.villaId === "string" ? b.villaId : "";
  if (!villaId) {
    const ids = await myVillaIds(c.env, userId);
    if (ids.length === 0) return jsonError(c, 409, "살고 있는 빌라가 없어요");
    if (ids.length > 1) return jsonError(c, 400, "어느 빌라에서 나갈지 골라 주세요");
    villaId = ids[0];
  }
  try {
    await leaveVilla(c.env, userId, villaId);
  } catch (e) {
    if (e instanceof NotInVillaError) return jsonError(c, 409, "살고 있는 빌라가 없어요");
    throw e;
  }
  return c.json({ ok: true });
});

async function ownedVilla(c: { env: AppEnv["Bindings"] }, id: string) {
  return c.env.DB.prepare("SELECT owner_id FROM villas WHERE id = ? AND dissolved_at IS NULL")
    .bind(id)
    .first<{ owner_id: string }>();
}

villa.patch("/api/villas/:id", requireUser, async (c) => {
  const v = await ownedVilla(c, c.req.param("id"));
  if (!v) return jsonError(c, 404, "빌라를 찾을 수 없어요");
  if (v.owner_id !== c.get("userId")) return jsonError(c, 403, "방장만 할 수 있어요");
  const b = await c.req.json().catch(() => null);
  const name = cleanName(b?.name);
  if (!name) return jsonError(c, 400, BAD_NAME);
  await c.env.DB.prepare("UPDATE villas SET name = ? WHERE id = ?").bind(name, c.req.param("id")).run();
  return c.json({ ok: true });
});

villa.post("/api/villas/:id/invite/rotate", requireUser, async (c) => {
  const v = await ownedVilla(c, c.req.param("id"));
  if (!v) return jsonError(c, 404, "빌라를 찾을 수 없어요");
  if (v.owner_id !== c.get("userId")) return jsonError(c, 403, "방장만 할 수 있어요");
  const inviteToken = newInviteToken();
  await c.env.DB.prepare("UPDATE villas SET invite_token = ? WHERE id = ?").bind(inviteToken, c.req.param("id")).run();
  return c.json({ inviteToken });
});

const isBanned = async (env: AppEnv["Bindings"], villaId: string, userId: string) =>
  !!(await env.DB.prepare("SELECT 1 AS x FROM villa_bans WHERE villa_id = ? AND user_id = ?").bind(villaId, userId).first());

villa.get("/api/invite/:token", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT v.id, v.name AS villaName,
       (SELECT COUNT(*) FROM memberships m WHERE m.villa_id = v.id AND m.left_at IS NULL) AS memberCount
     FROM villas v WHERE v.invite_token = ? AND v.dissolved_at IS NULL`,
  )
    .bind(c.req.param("token"))
    .first<{ id: string; villaName: string; memberCount: number }>();
  if (!row) return jsonError(c, 404, EXPIRED);
  const { id, ...preview } = row;
  // 로그인한 사람에게는 이미 이 빌라 입주민인지 / 빌라 3곳이 다 찼는지도 알려 준다
  const userId = await sessionUserId(c);
  if (!userId) return c.json(preview);
  if (await isBanned(c.env, id, userId)) return jsonError(c, 403, BANNED);
  const mine = await myVillaIds(c.env, userId);
  const alreadyMember = mine.includes(id);
  return c.json({
    ...preview,
    alreadyMember,
    // 이미 입주민일 때만 빌라 id 를 알려 준다 (바로 그 빌라 화면으로 보내려고)
    ...(alreadyMember ? { villaId: id } : {}),
    myVillaCount: mine.length,
    atLimit: !alreadyMember && mine.length >= MAX_VILLAS_PER_USER,
    // 예전 화면용: 이제 다른 빌라에 살아도 입주할 수 있다
    inOtherVilla: false,
  });
});

villa.post("/api/invite/:token/join", requireUser, async (c) => {
  const userId = c.get("userId");
  const v = await c.env.DB.prepare("SELECT id FROM villas WHERE invite_token = ? AND dissolved_at IS NULL")
    .bind(c.req.param("token"))
    .first<{ id: string }>();
  if (!v) return jsonError(c, 404, EXPIRED);
  // 이미 이 빌라 입주민이면 아무것도 바꾸지 않고 성공 (온보딩 중 나갔다가 링크를 다시 연 경우)
  if (await isMember(c.env, v.id, userId)) return c.json({ ok: true, alreadyMember: true, villaId: v.id });
  const t = now();
  const membershipId = crypto.randomUUID();
  let changes = 0;
  try {
    // 정원 · 해체 · 입주 금지 · 내 빌라 3곳 제한을 한 문장 안에서 본다 (동시에 입주해도 넘치지 않게)
    const res = await c.env.DB.prepare(
      `INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at)
       SELECT ?1, ?2, ?3, 1, ?4, ?4 WHERE (SELECT COUNT(*) FROM memberships WHERE villa_id = ?3 AND left_at IS NULL) < ?5
         AND EXISTS (SELECT 1 FROM villas WHERE id = ?3 AND dissolved_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM villa_bans WHERE villa_id = ?3 AND user_id = ?2)
         AND ${ACTIVE_COUNT("?2")} < ?6`,
    )
      .bind(membershipId, userId, v.id, t, MAX_MEMBERS, MAX_VILLAS_PER_USER)
      .run();
    changes = res.meta.changes;
  } catch (e) {
    // 같은 빌라에 동시에 두 번 입주를 누른 경우 (one_active_membership)
    if (isUnique(e)) return c.json({ ok: true, alreadyMember: true, villaId: v.id });
    throw e;
  }
  if (changes === 0) {
    if (await isBanned(c.env, v.id, userId)) return jsonError(c, 403, BANNED);
    const alive = await c.env.DB.prepare("SELECT 1 AS x FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(v.id).first();
    if (!alive) return jsonError(c, 404, EXPIRED);
    if ((await myVillaIds(c.env, userId)).length >= MAX_VILLAS_PER_USER) return jsonError(c, 409, VILLA_LIMIT_MSG);
    return jsonError(c, 409, "빌라가 꽉 찼어요");
  }
  await logJoinEvents(c.env, userId, v.id, membershipId).catch((e) => console.error("join events failed", e));
  await recomputePenthouse(c.env, v.id);
  return c.json({ ok: true, villaId: v.id });
});

/** 방장 일의 실패를 응답으로 */
function ownerError(c: Context<AppEnv>, e: unknown) {
  if (e instanceof VillaGoneError) return jsonError(c, 404, NO_VILLA);
  if (e instanceof NotOwnerError) return jsonError(c, 403, OWNER_ONLY);
  if (e instanceof NotMemberError) return jsonError(c, 404, NOT_MEMBER);
  if (e instanceof NameMismatchError) return jsonError(c, 400, "빌라 이름이 맞지 않아요");
  throw e;
}

/** 방장인지 먼저 본다 (실제 쓰기는 service 가 한 번 더 조건으로 확인한다). 문제가 있으면 응답, 없으면 null */
async function ownerGate(c: Context<AppEnv>, id: string, userId: string) {
  const v = await ownedVilla(c, id);
  if (!v) return jsonError(c, 404, NO_VILLA);
  if (v.owner_id !== userId) return jsonError(c, 403, OWNER_ONLY);
  return null;
}

villa.post("/api/villas/:id/members/:userId/kick", requireUser, async (c) => {
  const me = c.get("userId");
  const id = c.req.param("id");
  const target = c.req.param("userId");
  const gate = await ownerGate(c, id, me);
  if (gate) return gate;
  if (target === me) return jsonError(c, 400, "나를 내보낼 수는 없어요");
  try {
    await kickMember(c.env, id, me, target);
  } catch (e) {
    return ownerError(c, e);
  }
  return c.json({ ok: true });
});

villa.get("/api/villas/:id/bans", requireUser, async (c) => {
  const id = c.req.param("id");
  const gate = await ownerGate(c, id, c.get("userId"));
  if (gate) return gate;
  const { results } = await c.env.DB.prepare(
    `SELECT b.user_id AS userId, u.nickname, b.created_at AS createdAt FROM villa_bans b
     JOIN users u ON u.id = b.user_id WHERE b.villa_id = ? ORDER BY b.created_at DESC`,
  )
    .bind(id)
    .all<{ userId: string; nickname: string; createdAt: number }>();
  return c.json(results);
});

villa.delete("/api/villas/:id/bans/:userId", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  const gate = await ownerGate(c, id, me);
  if (gate) return gate;
  // 방장 확인과 지우기를 한 문장으로 (그 사이 방장이 바뀌어도 예전 방장이 풀어 주지 못하게)
  await c.env.DB.prepare(
    "DELETE FROM villa_bans WHERE villa_id = ?1 AND user_id = ?2 AND EXISTS (SELECT 1 FROM villas WHERE id = ?1 AND owner_id = ?3 AND dissolved_at IS NULL)",
  )
    .bind(id, c.req.param("userId"), me)
    .run();
  return c.json({ ok: true });
});

villa.post("/api/villas/:id/transfer", requireUser, async (c) => {
  const me = c.get("userId");
  const id = c.req.param("id");
  const gate = await ownerGate(c, id, me);
  if (gate) return gate;
  const b = await c.req.json().catch(() => null);
  const target = typeof b?.userId === "string" ? b.userId : "";
  if (!target) return jsonError(c, 400, "방장을 넘길 입주민을 골라 주세요");
  if (target === me) return jsonError(c, 400, "이미 방장이에요");
  try {
    await transferOwner(c.env, id, me, target);
  } catch (e) {
    return ownerError(c, e);
  }
  return c.json({ ok: true });
});

villa.post("/api/villas/:id/dissolve", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  const confirmName = typeof b?.confirmName === "string" ? b.confirmName : "";
  try {
    await dissolveVilla(c.env, c.req.param("id"), c.get("userId"), confirmName);
  } catch (e) {
    return ownerError(c, e);
  }
  return c.json({ ok: true });
});

/** 입주 알림: 들어온 사람에게 welcome, 원래 살던 입주민 모두에게 friend_joined (입주 한 번당 한 번) */
async function logJoinEvents(env: AppEnv["Bindings"], userId: string, villaId: string, membershipId: string) {
  const [villaRow, me, others] = await env.DB.batch([
    env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(villaId),
    env.DB.prepare("SELECT nickname, avatar FROM users WHERE id = ?").bind(userId),
    env.DB.prepare("SELECT user_id AS userId FROM memberships WHERE villa_id = ? AND left_at IS NULL AND user_id != ?").bind(villaId, userId),
  ]);
  const name = (villaRow.results[0] as { name: string } | undefined)?.name ?? "";
  const u = me.results[0] as { nickname: string; avatar: string } | undefined;
  await logEvents(
    env,
    await tagVilla(env, villaId, [
      { userId, type: "welcome", payload: { villaName: name }, key: `welcome:${membershipId}` },
      ...(others.results as { userId: string }[]).map((o) => ({
        userId: o.userId,
        type: "friend_joined" as const,
        payload: { nickname: u?.nickname ?? "", avatar: safeAvatar(u?.avatar ?? "") },
        key: `friend_joined:${membershipId}:${o.userId}`,
      })),
    ]),
  );
}
