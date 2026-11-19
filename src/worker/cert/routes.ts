import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { deletePhotoBlob, getPhotoBlob, putPhotoBlob } from "../storage";
import { CERTIFIED_PHOTO, certifiedInVilla } from "./certified";
import { recomputePenthouse } from "../villa/service";
import { myActive, myVillaIds, tagVilla } from "../villa/membership";
import { logEvents, type NewEvent } from "../events/log";
import { displayFloor, displayStreak } from "../../shared/rules/streak";
import { kstDay } from "../../shared/rules/day";
import { DUPLICATE_HAMMING, hamming } from "../../shared/rules/dhash";
import { photoPoints, routinePoints } from "../../shared/rules/points";

export const cert = new Hono<AppEnv>();

const MAX_BYTES = 300 * 1024;
const FORBIDDEN = "같은 빌라 입주민만 볼 수 있어요";

/**
 * 기록이 보이는 조건 [확정 — 기획자 결정, 2026-11-19]: 그 기록이 올라간 빌라 중 하나에 작성자와 보는 사람이 둘 다 지금 산다(해체 안 됨).
 * 인자는 SQL 식. 안쪽 별칭 sv(기록 ↔ 빌라) · svv(빌라) · sa(작성자 입주) · sb(보는 사람 입주)
 */
export const sharedVillaOf = (cert: string, author: string, viewer: string) => `EXISTS (SELECT 1 FROM cert_villas sv
  JOIN villas svv ON svv.id = sv.villa_id AND svv.dissolved_at IS NULL
  JOIN memberships sa ON sa.villa_id = sv.villa_id AND sa.user_id = ${author} AND sa.left_at IS NULL
  JOIN memberships sb ON sb.villa_id = sv.villa_id AND sb.user_id = ${viewer} AND sb.left_at IS NULL
  WHERE sv.cert_id = ${cert})`;

/** 본인이거나, 둘이 지금 함께 사는 (해체되지 않은) 빌라가 하나라도 있다. 게시판을 열 수 있는지(문 앞 확인)에 쓴다 */
export async function canView(env: Env, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM memberships a
     JOIN memberships b ON b.villa_id = a.villa_id AND b.left_at IS NULL
     JOIN villas v ON v.id = a.villa_id AND v.dissolved_at IS NULL
     WHERE a.user_id = ? AND a.left_at IS NULL AND b.user_id = ?`,
  )
    .bind(viewerId, ownerId)
    .first();
  return !!row;
}

/** 이 기록을 볼 수 있다: 작성자 본인이거나, 기록이 올라간 빌라에 둘 다 지금 산다 */
export async function canViewCert(env: Env, viewerId: string, cert: { id: string; user_id: string }): Promise<boolean> {
  if (viewerId === cert.user_id) return true;
  return !!(await env.DB.prepare(`SELECT ${sharedVillaOf("?1", "?2", "?3")} AS ok`).bind(cert.id, cert.user_id, viewerId).first<{ ok: number }>())?.ok;
}

/**
 * viewer 가 이 기록을 지우거나 댓글을 정리할 수 있는 방장인지: 기록이 올라간 (해체되지 않은) 빌라 중
 * viewer 가 방장인 빌라가 있고, 작성자와 viewer 가 둘 다 그 빌라에 지금 산다
 */
export async function isModeratorOf(env: Env, viewerId: string, cert: { id: string; user_id: string }): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM cert_villas cv
     JOIN villas v ON v.id = cv.villa_id AND v.dissolved_at IS NULL AND v.owner_id = ?1
     JOIN memberships a ON a.villa_id = cv.villa_id AND a.user_id = ?2 AND a.left_at IS NULL
     JOIN memberships o ON o.villa_id = cv.villa_id AND o.user_id = ?1 AND o.left_at IS NULL
     WHERE cv.cert_id = ?3`,
  )
    .bind(viewerId, cert.user_id, cert.id)
    .first();
  return !!row;
}

const PICK_NONE = "올릴 빌라를 하나 이상 골라 주세요";
const PICK_NOT_MINE = "내가 사는 빌라에만 올릴 수 있어요";

/**
 * 인증을 올릴 빌라를 정한다. raw 가 없으면(예전 화면) 사는 빌라 모두. 있으면 내가 사는 빌라 중에서만,
 * 빌라에 산다면 1곳 이상. 빌라가 없는 사람은 빈 목록(지금처럼 기록만 남는다)
 */
export async function pickVillas(env: Env, userId: string, raw: unknown): Promise<{ ids: string[] } | { status: number; message: string }> {
  const mine = await myVillaIds(env, userId);
  if (raw === undefined || raw === null) return { ids: mine };
  if (!Array.isArray(raw) || raw.length > 10 || !raw.every((x) => typeof x === "string")) return { status: 400, message: PICK_NONE };
  const ids = [...new Set(raw as string[])];
  if (ids.some((id) => !mine.includes(id))) return { status: 403, message: PICK_NOT_MINE };
  if (mine.length > 0 && ids.length === 0) return { status: 400, message: PICK_NONE };
  return { ids };
}

/** 고른 빌라에 기록을 올리는 문장. 기록(certs)을 넣기 전에 batch 에 넣는다 (먼저 넣어야 안전망 트리거가 모든 빌라에 올리지 않는다) */
function linkStatement(env: Env, certId: string, userId: string, villaIds: string[], t: number) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO cert_villas (cert_id, villa_id, created_at)
     SELECT ?1, m.villa_id, ?2 FROM ${myActive("?3")} AND m.villa_id IN (${villaIds.map((_, i) => `?${i + 4}`).join(",")})`,
  ).bind(certId, t, userId, ...villaIds);
}

// 사진 포인트: 그날 중복 아닌 사진 순번을 INSERT 안에서 세어 한 문장으로 결정한다 (경쟁 상태 방지)
// 지운 사진(deleted = 1)도 순번에 센다: 지우고 다시 올려 포인트를 또 받지 못하게
// (루틴 하루 1회 판정과 중복 사진 판정도 같은 이유로 지운 기록을 포함한다)
const PHOTO_INSERT = `
INSERT INTO certs (id, user_id, day, kind, r2_key, dhash, points, duplicate, created_at)
SELECT ?1, ?2, ?3, 'photo', ?4, ?5,
  CASE WHEN ?6 = 1 THEN 0 ELSE
    CASE (SELECT COUNT(*) FROM certs WHERE user_id = ?2 AND day = ?3 AND kind = 'photo' AND duplicate = 0)
      WHEN 0 THEN ${photoPoints(1)} WHEN 1 THEN ${photoPoints(2)} WHEN 2 THEN ${photoPoints(3)} ELSE 0 END
  END, ?6, ?7
WHERE ?8 = 0 OR EXISTS (SELECT 1 FROM cert_villas WHERE cert_id = ?1)`;

const ROUTINE_INSERT = `
INSERT INTO certs (id, user_id, day, kind, body, points, duplicate, created_at)
SELECT ?1, ?2, ?3, 'routine', ?4,
  CASE WHEN EXISTS (SELECT 1 FROM certs WHERE user_id = ?2 AND day = ?3 AND kind = 'routine')
    THEN ${routinePoints(true)} ELSE ${routinePoints(false)} END, 0, ?5
WHERE ?6 = 0 OR EXISTS (SELECT 1 FROM cert_villas WHERE cert_id = ?1)`;


const JPEG_MAGIC = [0xff, 0xd8, 0xff];

// 기록이 실제로 들어갔을 때만 (빌라를 골랐는데 그 사이 모두 나가 기록이 안 들어간 경우 아무것도 하지 않는다)
const ADD_POINTS = "UPDATE users SET points = points + (SELECT points FROM certs WHERE id = ?1) WHERE id = ?2 AND EXISTS (SELECT 1 FROM certs WHERE id = ?1)";

/**
 * 빌라 이야기: 기록 INSERT 는 빌라를 골랐다면(?8 / ?6 = 1) 고른 빌라 행이 하나라도 들어갔을 때만 일어난다.
 * 고른 빌라에서 그 사이 모두 나갔는데(다른 탭에서 나가기 · 내보내짐) 그냥 넣으면 0010 안전망 트리거가
 * 고르지 않은 다른 빌라 모두에 올려 버린다. 그래서 그때는 아무것도 넣지 않고 409 로 다시 고르게 한다.
 */
const PICK_GONE = "선택한 빌라에서 나가서 올리지 못했어요. 다시 골라 주세요";

/** 테스트용: 빌라를 고른 뒤 기록을 쓰기 직전에 부른다 (그 사이 빌라에서 나가는 경쟁을 재현) */
export const certTestHooks: { beforeWrite?: (userId: string) => Promise<void> } = {};

cert.post("/api/certs/photo", requireUser, async (c) => {
  const userId = c.get("userId");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const dhash = form?.get("dhash");
  if (!form || !file || typeof file === "string") return jsonError(c, 400, "사진을 골라 주세요");
  if (typeof dhash !== "string" || !/^[0-9a-f]{16}$/.test(dhash)) return jsonError(c, 400, "사진 정보가 올바르지 않아요");
  if (file.type !== "image/jpeg") return jsonError(c, 415, "JPEG 사진만 올릴 수 있어요");
  if (file.size > MAX_BYTES) return jsonError(c, 413, "사진이 너무 커요");
  const rawPick = form.get("villaIds");
  let parsedPick: unknown = undefined;
  if (typeof rawPick === "string") {
    try {
      parsedPick = JSON.parse(rawPick);
    } catch {
      return jsonError(c, 400, PICK_NONE);
    }
  }
  const pick = await pickVillas(c.env, userId, parsedPick);
  if ("status" in pick) return jsonError(c, pick.status, pick.message);

  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
  if (!JPEG_MAGIC.every((b, i) => head[i] === b)) return jsonError(c, 415, "JPEG 사진만 올릴 수 있어요");

  const prev = await c.env.DB.prepare("SELECT dhash FROM certs WHERE user_id = ? AND kind = 'photo' AND dhash IS NOT NULL")
    .bind(userId)
    .all<{ dhash: string }>();
  const duplicate = prev.results.some((r) => hamming(r.dhash, dhash) <= DUPLICATE_HAMMING) ? 1 : 0;

  const t = now();
  const day = kstDay(t);
  const id = crypto.randomUUID();
  const key = `photos/${userId}/${id}.jpg`;
  await putPhotoBlob(c.env, id, key, bytes, "image/jpeg");
  await certTestHooks.beforeWrite?.(userId);
  try {
    await c.env.DB.batch([
      ...(pick.ids.length ? [linkStatement(c.env, id, userId, pick.ids, t)] : []),
      c.env.DB.prepare(PHOTO_INSERT).bind(id, userId, day, key, dhash, duplicate, t, pick.ids.length ? 1 : 0),
      c.env.DB.prepare(ADD_POINTS).bind(id, userId),
    ]);
  } catch (e) {
    await deletePhotoBlob(c.env, { id, r2_key: key });
    throw e;
  }
  const row = await c.env.DB.prepare("SELECT points FROM certs WHERE id = ?").bind(id).first<{ points: number }>();
  if (!row) {
    // 고른 빌라에서 모두 나가 기록이 들어가지 않았다: 사진 파일만 지우고 알림 · 1등 계산 없이 끝낸다
    await deletePhotoBlob(c.env, { id, r2_key: key });
    return jsonError(c, 409, PICK_GONE);
  }
  const today = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM certs WHERE user_id = ? AND day = ? AND ${CERTIFIED_PHOTO} LIMIT 1`,
  )
    .bind(userId, day)
    .first();
  const posted = await postedVillas(c.env, id);
  const evs = await certEvents(c.env, userId, day, { points: row.points, duplicate: !!duplicate }, !!today, today ? posted : []).catch((e) => {
    console.error("cert events failed", e);
    return [];
  });
  await logEvents(c.env, evs);
  if (today) for (const v of posted) await recomputePenthouse(c.env, v);
  return c.json({ certId: id, points: row.points, duplicate: !!duplicate, certifiedToday: !!today, villaIds: posted });
});

/** 이 기록이 실제로 올라간 빌라 (해체되지 않은 빌라만) */
async function postedVillas(env: Env, certId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT cv.villa_id AS id FROM cert_villas cv JOIN villas v ON v.id = cv.villa_id AND v.dissolved_at IS NULL WHERE cv.cert_id = ?",
  )
    .bind(certId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * 사진 인증 뒤 알림.
 * - certified: 그날 첫 인증 토스트 (사용자당 하루 한 번, 포인트를 받는 사진에만)
 * - 빌라마다(이번에 이 빌라에 올라갔고 오늘 이 빌라 불이 켜졌을 때): 이 빌라 연속 기록이 7의 배수면 floor_up, 6이면 streak6.
 *   키에 빌라 id 를 넣어 같은 날 두 빌라에서 각각 축하한다
 * - 어느 빌라든 올린 날로 센 연속 기록이 7의 배수면 streak7 (같은 숫자의 floor_up 이 이번에 함께 생기면 겹치니 보내지 않는다)
 * 키를 날짜로 고정해 하루 한 번만 남는다 (같은 날 두 번째 사진 · 지웠다 다시 올린 사진에는 다시 생기지 않는다).
 */
async function certEvents(
  env: Env,
  userId: string,
  day: string,
  photo: { points: number; duplicate: boolean } | null,
  certifiedToday: boolean,
  villaIds: string[],
): Promise<NewEvent[]> {
  const evs: NewEvent[] = [];
  if (photo && !photo.duplicate) evs.push({ userId, type: "certified", payload: { points: photo.points }, key: `certified:${userId}:${day}` });
  if (!certifiedToday) return evs;
  const u = await env.DB.prepare("SELECT streak FROM users WHERE id = ?").bind(userId).first<{ streak: number }>();
  if (!u) return evs;
  const floorUps = new Set<number>();
  // 배포 당일: 예전 서버가 오늘 이미 층 축하(floor_up · streak6, 키 streak:{user}:{day})를 남겼다면 빌라별 축하를 다시 만들지 않는다
  const legacy = await env.DB.prepare("SELECT 1 AS x FROM events WHERE id = ? AND type IN ('floor_up', 'streak6')")
    .bind(`streak:${userId}:${day}`)
    .first();
  for (const villaId of villaIds) {
    const m = await env.DB.prepare(
      `SELECT m.floor, m.streak, ${certifiedInVilla("m.user_id", "?3", "m.villa_id")} AS lit
       FROM memberships m WHERE m.user_id = ?1 AND m.villa_id = ?2 AND m.left_at IS NULL`,
    )
      .bind(userId, villaId, day)
      .first<{ floor: number; streak: number; lit: number }>();
    if (!m || !m.lit || legacy) continue;
    const streak = displayStreak(m.streak, true);
    const key = `streak:${userId}:${day}:${villaId}`;
    if (streak % 7 === 0) {
      floorUps.add(streak);
      evs.push(...(await tagVilla(env, villaId, [{ userId, type: "floor_up", payload: { floor: displayFloor(m.floor, m.streak, true), streak }, key }])));
    } else if (streak % 7 === 6) {
      // "내일 인증하면 한 층 올라가요": 이 빌라에 올렸을 때만
      evs.push(...(await tagVilla(env, villaId, [{ userId, type: "streak6", payload: { streak }, key }])));
    }
  }
  const streak = displayStreak(u.streak, true);
  if (streak % 7 === 0 && !floorUps.has(streak)) evs.push({ userId, type: "streak7", payload: { streak }, key: `streak:${userId}:${day}` });
  return evs;
}

/**
 * 다른 빌라에도 올리기: 오늘(KST) 올린 내 기록(지우지 않은 사진 · 루틴)을 고른 빌라에 더 올린다.
 * 오늘 기록만 된다(어제 것은 못 올린다). 포인트는 더 주지 않는다. 빌라에서 내리기는 없다.
 */
cert.post("/api/certs/today/villas", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (!Array.isArray(b?.villaIds) || b.villaIds.length === 0) return jsonError(c, 400, PICK_NONE);
  const pick = await pickVillas(c.env, userId, b.villaIds);
  if ("status" in pick) return jsonError(c, pick.status, pick.message);
  const t = now();
  const day = kstDay(t);
  const has = await c.env.DB.prepare(`SELECT 1 AS ok FROM certs WHERE user_id = ? AND day = ? AND ${CERTIFIED_PHOTO} LIMIT 1`)
    .bind(userId, day)
    .first();
  if (!has) return jsonError(c, 409, "오늘 올린 인증 사진이 없어요. 먼저 인증해 주세요");
  // 이번에 새로 불이 켜지는 빌라 (이미 올린 빌라는 알림 · 1등 계산을 다시 하지 않는다)
  const before = await c.env.DB.prepare(
    `SELECT v.id, ${certifiedInVilla("?1", "?2", "v.id")} AS lit FROM villas v WHERE v.id IN (${pick.ids.map((_, i) => `?${i + 3}`).join(",")})`,
  )
    .bind(userId, day, ...pick.ids)
    .all<{ id: string; lit: number }>();
  const fresh = before.results.filter((r) => !r.lit).map((r) => r.id);
  await c.env.DB.batch(
    pick.ids.map((villaId) =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO cert_villas (cert_id, villa_id, created_at)
         SELECT c.id, ?1, ?2 FROM certs c WHERE c.user_id = ?3 AND c.day = ?4 AND c.deleted = 0
           AND EXISTS (SELECT 1 FROM ${myActive("?3")} AND m.villa_id = ?1)`,
      ).bind(villaId, t, userId, day),
    ),
  );
  const evs = await certEvents(c.env, userId, day, null, true, fresh).catch((e) => {
    console.error("cert events failed", e);
    return [];
  });
  await logEvents(c.env, evs);
  for (const v of fresh) await recomputePenthouse(c.env, v);
  return c.json({ ok: true, villaIds: pick.ids });
});

cert.post("/api/certs/routine", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (body.length < 1 || body.length > 1000) return jsonError(c, 400, "루틴은 1~1000자로 적어 주세요");
  const pick = await pickVillas(c.env, userId, b?.villaIds);
  if ("status" in pick) return jsonError(c, pick.status, pick.message);
  const t = now();
  const id = crypto.randomUUID();
  await certTestHooks.beforeWrite?.(userId);
  await c.env.DB.batch([
    ...(pick.ids.length ? [linkStatement(c.env, id, userId, pick.ids, t)] : []),
    c.env.DB.prepare(ROUTINE_INSERT).bind(id, userId, kstDay(t), body, t, pick.ids.length ? 1 : 0),
    c.env.DB.prepare(ADD_POINTS).bind(id, userId),
  ]);
  const row = await c.env.DB.prepare("SELECT points FROM certs WHERE id = ?").bind(id).first<{ points: number }>();
  if (!row) return jsonError(c, 409, PICK_GONE);
  return c.json({ certId: id, points: row.points });
});

cert.get("/api/users/:id/board", requireUser, async (c) => {
  const ownerId = c.req.param("id");
  const me = c.get("userId");
  if (!(await canView(c.env, me, ownerId))) return jsonError(c, 403, FORBIDDEN);
  const villaId = c.req.query("villa") ?? "";
  // 빌라 화면에서 열면 그 빌라에 올린 기록만. 그 빌라에 둘 다 살아야 한다(본인은 내가 사는 빌라면 된다)
  if (villaId) {
    const ok = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM ${myActive("?1")} AND m.villa_id = ?3 AND EXISTS (SELECT 1 FROM memberships o WHERE o.villa_id = ?3 AND o.user_id = ?2 AND o.left_at IS NULL)`,
    )
      .bind(me, ownerId, villaId)
      .first();
    if (!ok) return jsonError(c, 403, FORBIDDEN);
  }
  const before = Number(c.req.query("before"));
  const lim = Number(c.req.query("limit"));
  const limit = Number.isInteger(lim) && lim >= 1 ? Math.min(lim, 50) : 20;
  // 본인은 내 기록 전부, 다른 사람은 함께 사는 빌라에 올라간 기록만 (빌라를 고르면 그 빌라에 올린 것만)
  const scope = villaId
    ? "AND EXISTS (SELECT 1 FROM cert_villas fv WHERE fv.cert_id = certs.id AND fv.villa_id = ?5)"
    : `AND (?1 = ?4 OR ${sharedVillaOf("certs.id", "?1", "?4")})`;
  // 응원 · 댓글 수도 같은 쿼리에서 센다. 가려진 기록은 0
  const { results } = await c.env.DB.prepare(
    `SELECT id, kind, day, body, hidden, created_at AS createdAt,
       CASE WHEN hidden THEN 0 ELSE (SELECT COUNT(*) FROM cheers WHERE cert_id = certs.id) END AS cheerCount,
       CASE WHEN hidden THEN 0 ELSE EXISTS (SELECT 1 FROM cheers WHERE cert_id = certs.id AND user_id = ?4) END AS cheeredByMe,
       CASE WHEN hidden THEN 0 ELSE (SELECT COUNT(*) FROM comments WHERE cert_id = certs.id) END AS commentCount
     FROM certs
     WHERE user_id = ?1 AND duplicate = 0 AND deleted = 0 AND created_at < ?2 ${scope}
     ORDER BY created_at DESC, rowid DESC LIMIT ?3`,
  )
    .bind(ownerId, Number.isFinite(before) && c.req.query("before") ? before : Number.MAX_SAFE_INTEGER, limit, me, ...(villaId ? [villaId] : []))
    .all<{
      id: string; kind: string; day: string; body: string | null; hidden: number; createdAt: number;
      cheerCount: number; cheeredByMe: number; commentCount: number;
    }>();
  return c.json(
    results.map((r) => ({
      id: r.id,
      kind: r.kind,
      day: r.day,
      hidden: !!r.hidden,
      createdAt: r.createdAt,
      cheerCount: r.cheerCount,
      cheeredByMe: !!r.cheeredByMe,
      commentCount: r.commentCount,
      // 가려진 글은 내용을 내보내지 않는다
      ...(r.hidden ? {} : r.kind === "routine" ? { body: r.body } : { photoUrl: `/api/photos/${r.id}` }),
    })),
  );
});

cert.get("/api/photos/:certId", requireUser, async (c) => {
  const row = await c.env.DB.prepare("SELECT user_id, r2_key, hidden FROM certs WHERE id = ? AND kind = 'photo' AND deleted = 0")
    .bind(c.req.param("certId"))
    .first<{ user_id: string; r2_key: string | null; hidden: number }>();
  if (!row || !row.r2_key) return jsonError(c, 404, "사진을 찾을 수 없어요");
  if (!(await canViewCert(c.env, c.get("userId"), { id: c.req.param("certId"), user_id: row.user_id }))) return jsonError(c, 403, FORBIDDEN);
  if (row.hidden) return jsonError(c, 404, "사진을 찾을 수 없어요");
  const obj = await getPhotoBlob(c.env, { id: c.req.param("certId"), r2_key: row.r2_key });
  if (!obj) return jsonError(c, 404, "사진을 찾을 수 없어요");
  return new Response(obj.body, {
    headers: {
      "content-type": obj.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
