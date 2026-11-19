import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { logEvents } from "../events/log";
import { ACTIVE_COUNT, isMember, myVillaIds, tagVilla } from "../villa/membership";
import { recomputePenthouse } from "../villa/service";
import { afterJoin, logJoinEvents, safeAvatar } from "../villa/routes";
import { FRESH, MEMBER_COUNT, closeApplications, closeIfFull, cutoffOf } from "./service";
import { MAX_VILLAS_PER_USER, VILLA_CAPACITY, VILLA_LIMIT_MSG } from "../../shared/villa";
import {
  APPLY_BLOCKED_MSG, APPLY_MESSAGE_MAX, APPLY_ONE_AT_A_TIME_MSG, APPLY_TTL_MS, RECRUIT_INTRO_MAX, RECRUIT_NEED_PUBLIC_MSG,
  charLen, cleanSports, parseSports, type MyApplication, type ReceivedApplication, type RecruitPost,
} from "../../shared/recruit";

/**
 * 빈방 모집 · 입주 신청 [확정 — 기획자 결정, 2026-11-19]
 * - 모집 글: 방장만 쓰고, 도시 지도에 공개한 빌라만 켤 수 있다. 정원이 차면 꺼진다
 * - 신청: 로그인한 누구나 (빌라 3곳 제한 · 이미 입주민 · 입주 금지 · 한 번에 한 곳). 7일 지나면 만료
 * - 승인: 그 자리에서 바로 입주. 승인 문장 안에서 조건을 모두 다시 본다 (초대 링크 입주와 같은 입주 기록 · 알림 · 1등 계산)
 * - 신청한 사람의 정보는 그 빌라 방장만, 신청 상태는 신청한 사람만 본다
 */
export const recruit = new Hono<AppEnv>();

const NO_VILLA = "빌라를 찾을 수 없어요";
const OWNER_ONLY = "방장만 할 수 있어요";
const NOT_MEMBER = "이 빌라에 사는 입주민이 아니에요";
const FULL = "빌라가 꽉 찼어요";
const NOT_RECRUITING = "지금은 입주자를 모집하지 않는 빌라예요";
const NO_APPLICATION = "신청을 찾을 수 없어요";
const DONE = "이미 처리된 신청이에요";
const EXPIRED = "신청한 지 7일이 지나 만료된 신청이에요";

type Bindings = AppEnv["Bindings"];

const villaOf = (env: Bindings, id: string) =>
  env.DB.prepare(
    `SELECT v.name, v.owner_id AS ownerId, v.public, ${MEMBER_COUNT("v.id")} AS memberCount FROM villas v WHERE v.id = ? AND v.dissolved_at IS NULL`,
  )
    .bind(id)
    .first<{ name: string; ownerId: string; public: number; memberCount: number }>();

/** 방장인지 먼저 본다 (쓰는 문장이 한 번 더 조건으로 확인한다). 문제가 있으면 응답, 없으면 null */
async function ownerGate(c: Context<AppEnv>, id: string) {
  const v = await villaOf(c.env, id);
  if (!v) return jsonError(c, 404, NO_VILLA);
  if (v.ownerId !== c.get("userId")) return jsonError(c, 403, OWNER_ONLY);
  return null;
}

const pendingCount = async (env: Bindings, villaId: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM villa_applications a WHERE a.villa_id = ? AND ${FRESH("a", "?")}`)
    .bind(villaId, cutoffOf(now()))
    .first<{ n: number }>())!.n;

/** 이 빌라 모집 글 (입주민 누구나 본다. 방장에게는 받은 신청 수도) */
recruit.get("/api/villas/:id/recruit", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  if (!(await isMember(c.env, id, me))) return jsonError(c, 404, NOT_MEMBER);
  const v = await villaOf(c.env, id);
  if (!v) return jsonError(c, 404, NO_VILLA);
  const r = await c.env.DB.prepare("SELECT open, intro, sports, updated_at AS updatedAt FROM villa_recruits WHERE villa_id = ?")
    .bind(id)
    .first<{ open: number; intro: string; sports: string; updatedAt: number }>();
  const post: RecruitPost = {
    // 꽉 찼거나 지도에서 내렸으면 꺼진 것으로 보인다 (서버도 그때 끈다)
    open: !!r?.open && !!v.public && v.memberCount < VILLA_CAPACITY,
    intro: r?.intro ?? "",
    sports: parseSports(r?.sports),
    updatedAt: r?.updatedAt ?? null,
    public: !!v.public,
    memberCount: v.memberCount,
    ...(v.ownerId === me ? { pendingCount: await pendingCount(c.env, id) } : {}),
  };
  return c.json(post);
});

/** 방장이 모집 글을 쓰고 켜고 끈다. 끄면 기다리던 신청은 취소된다 */
recruit.put("/api/villas/:id/recruit", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (typeof b?.open !== "boolean") return jsonError(c, 400, "모집할지 골라 주세요");
  if (b.intro !== undefined && typeof b.intro !== "string") return jsonError(c, 400, "소개를 다시 써 주세요");
  const gate = await ownerGate(c, id);
  if (gate) return gate;
  const prev = await c.env.DB.prepare("SELECT intro, sports FROM villa_recruits WHERE villa_id = ?").bind(id).first<{ intro: string; sports: string }>();
  // 보내지 않은 값은 지금 글을 그대로 둔다 (켜고 끄기만 할 때)
  const intro = (b.intro ?? prev?.intro ?? "").replace(/\s+/g, " ").trim();
  if (charLen(intro) > RECRUIT_INTRO_MAX) return jsonError(c, 400, `소개는 ${RECRUIT_INTRO_MAX}자까지 쓸 수 있어요`);
  const sports = b.sports === undefined ? parseSports(prev?.sports) : cleanSports(b.sports);
  if (!sports) return jsonError(c, 400, "종목을 다시 골라 주세요");

  const t = now();
  // 방장 · 해체 · (켤 때) 공개 · 빈방을 쓰는 문장 안에서 다시 본다
  const res = await c.env.DB.prepare(
    `INSERT INTO villa_recruits (villa_id, open, intro, sports, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM villas WHERE id = ?1 AND owner_id = ?6 AND dissolved_at IS NULL AND (?2 = 0 OR public = 1))
       AND (?2 = 0 OR ${MEMBER_COUNT("?1")} < ?7)
     ON CONFLICT(villa_id) DO UPDATE SET open = excluded.open, intro = excluded.intro, sports = excluded.sports, updated_at = excluded.updated_at`,
  )
    .bind(id, b.open ? 1 : 0, intro, JSON.stringify(sports), t, me, VILLA_CAPACITY)
    .run();
  if (res.meta.changes !== 1) {
    const v = await villaOf(c.env, id);
    if (!v) return jsonError(c, 404, NO_VILLA);
    if (v.ownerId !== me) return jsonError(c, 403, OWNER_ONLY);
    if (!v.public) return jsonError(c, 409, RECRUIT_NEED_PUBLIC_MSG);
    return jsonError(c, 409, "빌라가 꽉 차서 지금은 모집할 수 없어요");
  }
  // 모집이 지금 꺼져 있을 때만 기다리던 신청을 취소한다 (그 사이 다시 켰으면 그대로)
  if (!b.open) await closeApplications(c.env, id, "recruit_off", " AND NOT EXISTS (SELECT 1 FROM villa_recruits WHERE villa_id = ? AND open = 1)", [id]);
  return c.json({ open: b.open, intro, sports, updatedAt: t });
});

/** 방장이 받은, 기다리는 신청 (7일 안 · 오래된 것부터) */
recruit.get("/api/villas/:id/applications", requireUser, async (c) => {
  const id = c.req.param("id");
  const gate = await ownerGate(c, id);
  if (gate) return gate;
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.user_id AS userId, u.nickname, u.avatar, u.sport, u.streak, a.message, a.created_at AS createdAt
     FROM villa_applications a JOIN users u ON u.id = a.user_id
     WHERE a.villa_id = ? AND ${FRESH("a", "?")} ORDER BY a.created_at ASC, a.rowid ASC`,
  )
    .bind(id, cutoffOf(now()))
    .all<Omit<ReceivedApplication, "avatar"> & { avatar: string }>();
  return c.json(results.map((r) => ({ ...r, avatar: safeAvatar(r.avatar) })) satisfies ReceivedApplication[]);
});

/** 내가 보낸, 아직 기다리는 신청 (한 번에 하나) */
export async function myApplication(env: Bindings, userId: string): Promise<MyApplication | null> {
  const r = await env.DB.prepare(
    `SELECT a.id, a.villa_id AS villaId, v.name AS villaName, a.message, a.created_at AS createdAt
     FROM villa_applications a JOIN villas v ON v.id = a.villa_id AND v.dissolved_at IS NULL
     WHERE a.user_id = ? AND ${FRESH("a", "?")}`,
  )
    .bind(userId, cutoffOf(now()))
    .first<Omit<MyApplication, "expiresAt">>();
  return r ? { ...r, expiresAt: r.createdAt + APPLY_TTL_MS } : null;
}

recruit.get("/api/me/application", requireUser, async (c) => c.json({ pending: await myApplication(c.env, c.get("userId")) }));

/** 입주 신청. 조건을 모두 한 문장 안에서 본다 (동시에 눌러도 한 곳에만 들어간다) */
recruit.post("/api/villas/:id/apply", requireUser, async (c) => {
  const id = c.req.param("id");
  const me = c.get("userId");
  const b = await c.req.json().catch(() => ({}));
  if (b?.message !== undefined && typeof b.message !== "string") return jsonError(c, 400, "남기는 말을 다시 써 주세요");
  const message = (b?.message ?? "").trim();
  if (charLen(message) > APPLY_MESSAGE_MAX) return jsonError(c, 400, `남기는 말은 ${APPLY_MESSAGE_MAX}자까지 쓸 수 있어요`);

  const t = now();
  const appId = crypto.randomUUID();
  let changes = 0;
  try {
    const [, ins] = await c.env.DB.batch([
      // 7일 지난 내 신청은 먼저 만료로 (한 사람 한 곳 색인이 막지 않게)
      c.env.DB.prepare("UPDATE villa_applications SET status = 'expired', reason = 'expired', decided_at = ? WHERE user_id = ? AND status = 'pending' AND created_at <= ?").bind(
        t, me, cutoffOf(t),
      ),
      c.env.DB.prepare(
        `INSERT INTO villa_applications (id, villa_id, user_id, message, status, created_at)
         SELECT ?1, ?2, ?3, ?4, 'pending', ?5
         WHERE EXISTS (SELECT 1 FROM villas v JOIN villa_recruits r ON r.villa_id = v.id
                       WHERE v.id = ?2 AND v.dissolved_at IS NULL AND v.public = 1 AND r.open = 1)
           AND ${MEMBER_COUNT("?2")} < ?6
           AND NOT EXISTS (SELECT 1 FROM memberships WHERE villa_id = ?2 AND user_id = ?3 AND left_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM villa_bans WHERE villa_id = ?2 AND user_id = ?3)
           AND ${ACTIVE_COUNT("?3")} < ?7
           AND NOT EXISTS (SELECT 1 FROM villa_applications WHERE user_id = ?3 AND status = 'pending')`,
      ).bind(appId, id, me, message, t, VILLA_CAPACITY, MAX_VILLAS_PER_USER),
    ]);
    changes = ins.meta.changes;
  } catch (e) {
    // 동시에 두 곳에 신청한 경우 (villa_applications_one_pending)
    if (!String((e as Error)?.message ?? e).includes("UNIQUE")) throw e;
  }
  if (changes !== 1) return applyRefusal(c, id, me);

  const [u, v] = await Promise.all([
    c.env.DB.prepare("SELECT nickname, avatar FROM users WHERE id = ?").bind(me).first<{ nickname: string; avatar: string }>(),
    villaOf(c.env, id),
  ]);
  // 방장에게 알림 (신청 한 번당 한 번). 빌라 이름은 방장이 여러 빌라에 살 때만 보인다
  if (v) {
    await logEvents(
      c.env,
      await tagVilla(c.env, id, [
        {
          userId: v.ownerId,
          type: "application_received",
          payload: { nickname: u?.nickname ?? "", avatar: safeAvatar(u?.avatar ?? "") },
          key: `apply:${appId}`,
        },
      ]),
    );
  }
  return c.json({ pending: await myApplication(c.env, me) }, 201);
});

/** 신청이 안 들어간 이유를 하나 골라 알려 준다 */
async function applyRefusal(c: Context<AppEnv>, id: string, me: string) {
  const v = await villaOf(c.env, id);
  if (!v) return jsonError(c, 404, NO_VILLA);
  if (await isMember(c.env, id, me)) return jsonError(c, 409, "이미 이 빌라에 살고 있어요");
  const banned = await c.env.DB.prepare("SELECT 1 AS x FROM villa_bans WHERE villa_id = ? AND user_id = ?").bind(id, me).first();
  if (banned) return jsonError(c, 403, APPLY_BLOCKED_MSG);
  const open = await c.env.DB.prepare("SELECT open FROM villa_recruits WHERE villa_id = ?").bind(id).first<{ open: number }>();
  if (!open?.open || !v.public) return jsonError(c, 409, NOT_RECRUITING);
  if (v.memberCount >= VILLA_CAPACITY) return jsonError(c, 409, FULL);
  if ((await myVillaIds(c.env, me)).length >= MAX_VILLAS_PER_USER) return jsonError(c, 409, VILLA_LIMIT_MSG);
  const mine = await myApplication(c.env, me);
  if (mine?.villaId === id) return jsonError(c, 409, "이미 이 빌라에 신청했어요. 방장의 답을 기다려 주세요");
  if (mine) return jsonError(c, 409, APPLY_ONE_AT_A_TIME_MSG);
  return jsonError(c, 409, "신청하지 못했어요. 다시 해 주세요");
}

/** 신청한 사람이 기다리는 신청을 취소한다 */
recruit.post("/api/applications/:appId/cancel", requireUser, async (c) => {
  const res = await c.env.DB.prepare(
    "UPDATE villa_applications SET status = 'cancelled', reason = 'withdrawn', decided_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'",
  )
    .bind(now(), c.req.param("appId"), c.get("userId"))
    .run();
  if (res.meta.changes !== 1) return jsonError(c, 409, "이미 끝난 신청이에요");
  return c.json({ ok: true });
});

type AppRow = { id: string; userId: string; status: string; createdAt: number };
const appOf = (env: Bindings, villaId: string, appId: string) =>
  env.DB.prepare("SELECT id, user_id AS userId, status, created_at AS createdAt FROM villa_applications WHERE id = ? AND villa_id = ?")
    .bind(appId, villaId)
    .first<AppRow>();

/** 기다리는 신청을 끝낸다 (아직 pending 일 때만). 바뀌었으면 true */
const settleApp = async (env: Bindings, appId: string, status: "rejected" | "cancelled" | "expired", reason: string) =>
  (
    await env.DB.prepare("UPDATE villa_applications SET status = ?, reason = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
      .bind(status, reason, now(), appId)
      .run()
  ).meta.changes === 1;

/**
 * 승인: 그 자리에서 입주. 입주 기록을 넣는 한 문장 안에서 다시 본다 —
 * 신청이 아직 기다리는 중 · 7일 안, 승인하는 사람이 해체 안 된 빌라의 방장, 빈방 있음, 입주 금지 아님, 아직 입주민 아님, 빌라 3곳 미만.
 * 입주 기록이 들어갔을 때만 신청을 승인으로 바꾼다 (같은 batch). 두 번 눌러도 입주는 한 번.
 */
recruit.post("/api/villas/:id/applications/:appId/approve", requireUser, async (c) => {
  const id = c.req.param("id");
  const appId = c.req.param("appId");
  const me = c.get("userId");
  const gate = await ownerGate(c, id);
  if (gate) return gate;
  const app = await appOf(c.env, id, appId);
  if (!app) return jsonError(c, 404, NO_APPLICATION);
  if (app.status !== "pending") return jsonError(c, 409, DONE);

  const t = now();
  const membershipId = crypto.randomUUID();
  let joined = 0;
  try {
    const [ins] = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at)
         SELECT ?1, a.user_id, a.villa_id, 1, ?4, ?4 FROM villa_applications a
         WHERE a.id = ?2 AND a.villa_id = ?3 AND ${FRESH("a", "?5")}
           AND EXISTS (SELECT 1 FROM villas WHERE id = ?3 AND owner_id = ?6 AND dissolved_at IS NULL)
           AND ${MEMBER_COUNT("?3")} < ?7
           AND NOT EXISTS (SELECT 1 FROM villa_bans b WHERE b.villa_id = ?3 AND b.user_id = a.user_id)
           AND NOT EXISTS (SELECT 1 FROM memberships x WHERE x.villa_id = ?3 AND x.user_id = a.user_id AND x.left_at IS NULL)
           AND ${ACTIVE_COUNT("a.user_id")} < ?8`,
      ).bind(membershipId, appId, id, t, cutoffOf(t), me, VILLA_CAPACITY, MAX_VILLAS_PER_USER),
      c.env.DB.prepare(
        "UPDATE villa_applications SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM memberships WHERE id = ?)",
      ).bind(t, appId, membershipId),
    ]);
    joined = ins.meta.changes;
  } catch (e) {
    // 같은 사람이 그 사이 같은 빌라에 입주한 경우 (one_active_membership). 아래에서 "이미 입주민"으로 끝낸다
    if (!String((e as Error)?.message ?? e).includes("UNIQUE")) throw e;
  }
  if (joined !== 1) return approveRefusal(c, id, appId, me);

  // 초대 링크 입주와 똑같이: welcome(신청 승인 표시) · friend_joined · 1등 다시 계산. 정원이 찼으면 모집 끄기
  await logJoinEvents(c.env, app.userId, id, membershipId, { via: "recruit" }).catch((e) => console.error("join events failed", e));
  await recomputePenthouse(c.env, id);
  await afterJoin(c.env, app.userId, id).catch((e) => console.error("recruit cleanup failed", e));
  return c.json({ ok: true, userId: app.userId });
});

/** 승인이 안 된 이유를 골라 알려 주고, 다시 할 수 없는 이유면 신청도 끝낸다 */
async function approveRefusal(c: Context<AppEnv>, id: string, appId: string, me: string) {
  const v = await villaOf(c.env, id);
  if (!v) return jsonError(c, 404, NO_VILLA);
  // 그 사이 방장이 바뀌었다: 신청은 그대로 두어 새 방장이 본다
  if (v.ownerId !== me) return jsonError(c, 403, OWNER_ONLY);
  const app = await appOf(c.env, id, appId);
  if (!app) return jsonError(c, 404, NO_APPLICATION);
  if (app.status !== "pending") return jsonError(c, 409, DONE);
  if (app.createdAt <= cutoffOf(now())) {
    await settleApp(c.env, appId, "expired", "expired");
    return jsonError(c, 409, EXPIRED);
  }
  if (await isMember(c.env, id, app.userId)) {
    await settleApp(c.env, appId, "cancelled", "joined");
    return jsonError(c, 409, "이미 이 빌라에 사는 사람이에요");
  }
  const banned = await c.env.DB.prepare("SELECT 1 AS x FROM villa_bans WHERE villa_id = ? AND user_id = ?").bind(id, app.userId).first();
  if (banned) {
    await settleApp(c.env, appId, "rejected", "banned");
    return jsonError(c, 409, "내보낸 사람이라 승인할 수 없어요. 먼저 다시 받기를 해 주세요");
  }
  if (v.memberCount >= VILLA_CAPACITY) {
    // 정원이 찼으니 모집을 끄고 기다리던 신청을 모두 취소한다 (이 신청 포함, 신청한 사람에게 알림)
    await closeIfFull(c.env, id);
    return jsonError(c, 409, "빌라가 꽉 차서 승인할 수 없어요");
  }
  if ((await myVillaIds(c.env, app.userId)).length >= MAX_VILLAS_PER_USER) {
    if (await settleApp(c.env, appId, "cancelled", "limit")) {
      await logEvents(c.env, [
        { userId: app.userId, type: "application_closed", payload: { villaId: id, villaName: v.name, reason: "limit" }, key: `apply_closed:${appId}` },
      ]);
    }
    return jsonError(c, 409, "신청한 사람이 이미 빌라 3곳에 살고 있어 승인할 수 없어요");
  }
  return jsonError(c, 409, "승인하지 못했어요. 다시 해 주세요");
}

/** 거절: 이유 없이. 신청한 사람에게 부드러운 알림 카드 */
recruit.post("/api/villas/:id/applications/:appId/reject", requireUser, async (c) => {
  const id = c.req.param("id");
  const appId = c.req.param("appId");
  const me = c.get("userId");
  const gate = await ownerGate(c, id);
  if (gate) return gate;
  const t = now();
  // 방장 확인과 바꾸기를 한 문장으로 (그 사이 방장이 바뀌면 예전 방장은 거절하지 못한다)
  const { results } = await c.env.DB.prepare(
    `UPDATE villa_applications SET status = 'rejected', reason = 'owner', decided_at = ?1
     WHERE id = ?2 AND villa_id = ?3 AND status = 'pending' AND created_at > ?4
       AND EXISTS (SELECT 1 FROM villas WHERE id = ?3 AND owner_id = ?5 AND dissolved_at IS NULL)
     RETURNING user_id AS userId`,
  )
    .bind(t, appId, id, cutoffOf(t), me)
    .all<{ userId: string }>();
  if (!results.length) {
    const v = await villaOf(c.env, id);
    if (!v) return jsonError(c, 404, NO_VILLA);
    if (v.ownerId !== me) return jsonError(c, 403, OWNER_ONLY);
    const app = await appOf(c.env, id, appId);
    if (!app) return jsonError(c, 404, NO_APPLICATION);
    if (app.status === "pending") {
      await settleApp(c.env, appId, "expired", "expired");
      return jsonError(c, 409, EXPIRED);
    }
    return jsonError(c, 409, DONE);
  }
  const v = await villaOf(c.env, id);
  await logEvents(c.env, [
    { userId: results[0].userId, type: "application_rejected", payload: { villaId: id, villaName: v?.name ?? "" }, key: `apply_rejected:${appId}` },
  ]);
  return c.json({ ok: true });
});

/** 내가 방장인 빌라들에 온, 기다리는 신청 수 (설정 배지) */
export async function receivedCount(env: Bindings, userId: string): Promise<number> {
  return (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM villa_applications a JOIN villas v ON v.id = a.villa_id AND v.dissolved_at IS NULL AND v.owner_id = ?
     WHERE ${FRESH("a", "?")}`,
  )
    .bind(userId, cutoffOf(now()))
    .first<{ n: number }>())!.n;
}
