import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { deletePhotoBlob, getPhotoBlob, putPhotoBlob } from "../storage";
import { CERTIFIED_PHOTO } from "./certified";
import { recomputeUserPenthouse } from "../villa/service";
import { logEvents, type NewEvent } from "../events/log";
import { displayFloor, displayStreak } from "../../shared/rules/streak";
import { kstDay } from "../../shared/rules/day";
import { DUPLICATE_HAMMING, hamming } from "../../shared/rules/dhash";
import { photoPoints, routinePoints } from "../../shared/rules/points";

export const cert = new Hono<AppEnv>();

const MAX_BYTES = 300 * 1024;
const FORBIDDEN = "같은 빌라 입주민만 볼 수 있어요";

/** 본인이거나, 둘 다 같은 (해산되지 않은) 빌라의 현재 입주민 */
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

// 사진 포인트: 그날 중복 아닌 사진 순번을 INSERT 안에서 세어 한 문장으로 결정한다 (경쟁 상태 방지)
// 지운 사진(deleted = 1)도 순번에 센다: 지우고 다시 올려 포인트를 또 받지 못하게
// (루틴 하루 1회 판정과 중복 사진 판정도 같은 이유로 지운 기록을 포함한다)
const PHOTO_INSERT = `
INSERT INTO certs (id, user_id, day, kind, r2_key, dhash, points, duplicate, created_at)
SELECT ?1, ?2, ?3, 'photo', ?4, ?5,
  CASE WHEN ?6 = 1 THEN 0 ELSE
    CASE (SELECT COUNT(*) FROM certs WHERE user_id = ?2 AND day = ?3 AND kind = 'photo' AND duplicate = 0)
      WHEN 0 THEN ${photoPoints(1)} WHEN 1 THEN ${photoPoints(2)} WHEN 2 THEN ${photoPoints(3)} ELSE 0 END
  END, ?6, ?7`;

const ROUTINE_INSERT = `
INSERT INTO certs (id, user_id, day, kind, body, points, duplicate, created_at)
SELECT ?1, ?2, ?3, 'routine', ?4,
  CASE WHEN EXISTS (SELECT 1 FROM certs WHERE user_id = ?2 AND day = ?3 AND kind = 'routine')
    THEN ${routinePoints(true)} ELSE ${routinePoints(false)} END, 0, ?5`;


const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const ADD_POINTS = "UPDATE users SET points = points + (SELECT points FROM certs WHERE id = ?1) WHERE id = ?2";

cert.post("/api/certs/photo", requireUser, async (c) => {
  const userId = c.get("userId");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const dhash = form?.get("dhash");
  if (!form || !file || typeof file === "string") return jsonError(c, 400, "사진을 골라 주세요");
  if (typeof dhash !== "string" || !/^[0-9a-f]{16}$/.test(dhash)) return jsonError(c, 400, "사진 정보가 올바르지 않아요");
  if (file.type !== "image/jpeg") return jsonError(c, 415, "JPEG 사진만 올릴 수 있어요");
  if (file.size > MAX_BYTES) return jsonError(c, 413, "사진이 너무 커요");

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
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(PHOTO_INSERT).bind(id, userId, day, key, dhash, duplicate, t),
      c.env.DB.prepare(ADD_POINTS).bind(id, userId),
    ]);
  } catch (e) {
    await deletePhotoBlob(c.env, { id, r2_key: key });
    throw e;
  }
  const row = await c.env.DB.prepare("SELECT points FROM certs WHERE id = ?").bind(id).first<{ points: number }>();
  const today = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM certs WHERE user_id = ? AND day = ? AND ${CERTIFIED_PHOTO} LIMIT 1`,
  )
    .bind(userId, day)
    .first();
  const evs = await certEvents(c.env, userId, day, row!.points, !!duplicate, !!today).catch((e) => {
    console.error("cert events failed", e);
    return [];
  });
  await logEvents(c.env, evs);
  if (today) await recomputeUserPenthouse(c.env, userId);
  return c.json({ certId: id, points: row!.points, duplicate: !!duplicate, certifiedToday: !!today });
});

/**
 * 사진 인증 뒤 알림: 그날 첫 인증(certified), 연속 6일째(streak6), 7의 배수(빌라에 살면 floor_up 하나, 아니면 streak7).
 * 키를 날짜로 고정해 하루 한 번만 남는다 (같은 날 두 번째 사진 · 지웠다 다시 올린 사진에는 다시 생기지 않는다).
 */
async function certEvents(env: Env, userId: string, day: string, points: number, duplicate: boolean, certifiedToday: boolean): Promise<NewEvent[]> {
  const evs: NewEvent[] = [];
  if (!duplicate) evs.push({ userId, type: "certified", payload: { points }, key: `certified:${userId}:${day}` });
  if (!certifiedToday) return evs;
  const u = await env.DB.prepare(
    `SELECT u.streak,
       (SELECT m.floor FROM memberships m JOIN villas v ON v.id = m.villa_id
         WHERE m.user_id = u.id AND m.left_at IS NULL AND v.dissolved_at IS NULL) AS floor
     FROM users u WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{ streak: number; floor: number | null }>();
  if (!u) return evs;
  const streak = displayStreak(u.streak, true);
  const key = `streak:${userId}:${day}`;
  if (streak % 7 === 0) {
    evs.push(
      u.floor !== null
        ? { userId, type: "floor_up", payload: { floor: displayFloor(u.floor, u.streak, true), streak }, key }
        : { userId, type: "streak7", payload: { streak }, key },
    );
  } else if (streak % 7 === 6) {
    evs.push({ userId, type: "streak6", payload: { streak }, key });
  }
  return evs;
}

cert.post("/api/certs/routine", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (body.length < 1 || body.length > 1000) return jsonError(c, 400, "루틴은 1~1000자로 적어 주세요");
  const t = now();
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(ROUTINE_INSERT).bind(id, userId, kstDay(t), body, t),
    c.env.DB.prepare(ADD_POINTS).bind(id, userId),
  ]);
  const row = await c.env.DB.prepare("SELECT points FROM certs WHERE id = ?").bind(id).first<{ points: number }>();
  return c.json({ certId: id, points: row!.points });
});

cert.get("/api/users/:id/board", requireUser, async (c) => {
  const ownerId = c.req.param("id");
  if (!(await canView(c.env, c.get("userId"), ownerId))) return jsonError(c, 403, FORBIDDEN);
  const before = Number(c.req.query("before"));
  const lim = Number(c.req.query("limit"));
  const limit = Number.isInteger(lim) && lim >= 1 ? Math.min(lim, 50) : 20;
  const { results } = await c.env.DB.prepare(
    `SELECT id, kind, day, body, hidden, created_at AS createdAt FROM certs
     WHERE user_id = ? AND duplicate = 0 AND deleted = 0 AND created_at < ?
     ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  )
    .bind(ownerId, Number.isFinite(before) && c.req.query("before") ? before : Number.MAX_SAFE_INTEGER, limit)
    .all<{ id: string; kind: string; day: string; body: string | null; hidden: number; createdAt: number }>();
  return c.json(
    results.map((r) => ({
      id: r.id,
      kind: r.kind,
      day: r.day,
      hidden: !!r.hidden,
      createdAt: r.createdAt,
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
  if (!(await canView(c.env, c.get("userId"), row.user_id))) return jsonError(c, 403, FORBIDDEN);
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
