import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { deletePhotoBlob, deletePhotoBlobs, getPhotoBlob, putPhotoBlob } from "../storage";
import { isMember, myActive } from "../villa/membership";
import { pickVillas } from "../cert/routes";
import { logEvents } from "../events/log";
import { safeAvatar } from "../villa/routes";
import { COMMENT_MAX, COMMENTS_PER_DAY } from "../cheer/routes";
import { kstDay, prevDay } from "../../shared/rules/day";
import { DUPLICATE_HAMMING, hamming } from "../../shared/rules/dhash";
import { MEAL_DAILY_CAP, MEAL_POINTS } from "../../shared/rules/points";
import { isMealType, MEAL_DAYS, MEAL_MEMO_MAX, type MealType } from "../../shared/meals";

/**
 * 식당(식단 공유) [확정 — 기획자 결정, 2026-11-24]
 * 오운완 인증과 따로: 방 불 · 연속 기록 · 층 · 집값 · 배지와 상관없다. 포인트만 준다(한 끼 5P, 하루 15P까지).
 * 보이는 조건은 인증과 같다: 식단이 올라간 아파트 중 하나에 작성자와 보는 사람이 둘 다 지금 산다.
 */
export const meals = new Hono<AppEnv>();

const MAX_BYTES = 300 * 1024;
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const FORBIDDEN = "같은 아파트 입주민만 볼 수 있어요";
const NOT_FOUND = "식단을 찾을 수 없어요";
const NOT_MINE = "내가 올린 식단만 고칠 수 있어요";
const BAD_TYPE = "끼니를 골라 주세요";
const BAD_MEMO = `메모는 ${MEAL_MEMO_MAX}자까지 쓸 수 있어요`;
const PICK_NONE = "올릴 아파트를 하나 이상 골라 주세요";
const NO_VILLA = "아파트에 입주하면 식단을 올릴 수 있어요";
const PICK_GONE = "선택한 아파트에서 나가서 올리지 못했어요. 다시 골라 주세요";
const BAD_DAY = "볼 수 없는 날이에요";
const BAD_COMMENT = "댓글은 1~100자로 써 주세요";
const TOO_MANY = "오늘은 댓글을 너무 많이 썼어요";

/** 식단이 보이는 조건 (SQL). 별칭 mv(식단 ↔ 아파트) · mvv(아파트) · ma(작성자 입주) · mb(보는 사람 입주) */
const sharedVillaOf = (meal: string, author: string, viewer: string) => `EXISTS (SELECT 1 FROM meal_villas mv
  JOIN villas mvv ON mvv.id = mv.villa_id AND mvv.dissolved_at IS NULL
  JOIN memberships ma ON ma.villa_id = mv.villa_id AND ma.user_id = ${author} AND ma.left_at IS NULL
  JOIN memberships mb ON mb.villa_id = mv.villa_id AND mb.user_id = ${viewer} AND mb.left_at IS NULL
  WHERE mv.meal_id = ${meal})`;

type MealRow = {
  id: string; user_id: string; day: string; meal_type: MealType; r2_key: string | null; memo: string | null;
  points: number; duplicate: number; created_at: number; updated_at: number;
};

async function findMeal(env: Env, id: string): Promise<MealRow | null> {
  return env.DB.prepare(
    "SELECT id, user_id, day, meal_type, r2_key, memo, points, duplicate, created_at, updated_at FROM meals WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first<MealRow>();
}

/** 이 식단을 볼 수 있다: 작성자 본인이거나, 식단이 올라간 아파트에 둘 다 지금 산다 */
export async function canViewMeal(env: Env, viewerId: string, meal: { id: string; user_id: string }): Promise<boolean> {
  if (viewerId === meal.user_id) return true;
  return !!(await env.DB.prepare(`SELECT ${sharedVillaOf("?1", "?2", "?3")} AS ok`).bind(meal.id, meal.user_id, viewerId).first<{ ok: number }>())?.ok;
}

/** 볼 수 있는 식단 찾기: 없음 404 · 볼 수 없음 403 */
async function visibleMeal(env: Env, viewerId: string, id: string): Promise<{ meal: MealRow } | { status: number; message: string }> {
  const meal = await findMeal(env, id);
  if (!meal) return { status: 404, message: NOT_FOUND };
  if (!(await canViewMeal(env, viewerId, meal))) return { status: 403, message: FORBIDDEN };
  return { meal };
}

/** 사진 저장소 참조: 식단은 저장 키를 그대로 사진 id 로 쓴다 (사진을 바꿔도 예전 사진만 골라 지울 수 있게) */
const blobRef = (key: string) => ({ id: key, r2_key: key });
const photoUrl = (m: { id: string; updated_at: number }) => `/api/meals/${m.id}/photo?v=${m.updated_at}`;

/** 메모: 앞뒤 공백을 뗀다. 비면 null. 너무 길면 undefined(잘못됨) */
function parseMemo(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return undefined;
  const memo = raw.trim();
  if (Array.from(memo).length > MEAL_MEMO_MAX) return undefined;
  return memo || null;
}

/** 폼의 사진 · dHash 확인 */
async function readPhoto(form: FormData): Promise<{ bytes: ArrayBuffer; dhash: string } | { status: number; message: string }> {
  const file = form.get("file");
  const dhash = form.get("dhash");
  if (!file || typeof file === "string") return { status: 400, message: "사진을 골라 주세요" };
  if (typeof dhash !== "string" || !/^[0-9a-f]{16}$/.test(dhash)) return { status: 400, message: "사진 정보가 올바르지 않아요" };
  if (file.type !== "image/jpeg") return { status: 415, message: "JPEG 사진만 올릴 수 있어요" };
  if (file.size > MAX_BYTES) return { status: 413, message: "사진이 너무 커요" };
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
  if (!JPEG_MAGIC.every((b, i) => head[i] === b)) return { status: 415, message: "JPEG 사진만 올릴 수 있어요" };
  return { bytes, dhash };
}

/**
 * 중복 사진: 내가 전에 올린 식단(지우지 않은 것) · 인증 사진(인증 규칙처럼 지운 것도 포함)과 dHash 해밍거리가 가까우면 같은 사진.
 * 중복이어도 올라가지만 포인트는 0
 */
async function isDuplicate(env: Env, userId: string, dhash: string, exceptMealId = ""): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `SELECT dhash FROM meals WHERE user_id = ?1 AND deleted_at IS NULL AND dhash IS NOT NULL AND id != ?2
     UNION ALL SELECT dhash FROM certs WHERE user_id = ?1 AND kind = 'photo' AND dhash IS NOT NULL`,
  )
    .bind(userId, exceptMealId)
    .all<{ dhash: string }>();
  return results.some((r) => hamming(r.dhash, dhash) <= DUPLICATE_HAMMING);
}

// 식단 포인트(shared/rules/points.ts mealPoints 와 같은 규칙): 그날 식단으로 받고 되돌리지 않은 포인트를 INSERT 안에서 세어
// 한 문장으로 정한다 (동시에 올려도 상한을 넘지 않게). 고른 아파트 행이 하나라도 들어갔을 때만 넣는다
const MEAL_INSERT = `
INSERT INTO meals (id, user_id, day, meal_type, r2_key, dhash, memo, points, duplicate, created_at, updated_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7,
  CASE WHEN ?8 = 1 THEN 0 ELSE
    MAX(0, MIN(${MEAL_POINTS}, ${MEAL_DAILY_CAP} - COALESCE((SELECT SUM(points - refunded) FROM meals WHERE user_id = ?2 AND day = ?3), 0)))
  END, ?8, ?9, ?9
WHERE EXISTS (SELECT 1 FROM meal_villas WHERE meal_id = ?1)`;

const ADD_POINTS = "UPDATE users SET points = points + (SELECT points FROM meals WHERE id = ?1) WHERE id = ?2 AND EXISTS (SELECT 1 FROM meals WHERE id = ?1)";

/** 테스트용: 아파트를 고른 뒤 식단을 쓰기 직전에 부른다 */
export const mealTestHooks: { beforeWrite?: (userId: string) => Promise<void> } = {};

meals.post("/api/meals", requireUser, async (c) => {
  const userId = c.get("userId");
  const form = await c.req.formData().catch(() => null);
  if (!form) return jsonError(c, 400, "사진을 골라 주세요");
  const mealType = form.get("mealType");
  if (!isMealType(mealType)) return jsonError(c, 400, BAD_TYPE);
  const memo = parseMemo(form.get("memo"));
  if (memo === undefined) return jsonError(c, 400, BAD_MEMO);
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
  if (!pick.ids.length) return jsonError(c, 400, NO_VILLA);
  const photo = await readPhoto(form);
  if ("status" in photo) return jsonError(c, photo.status, photo.message);

  const duplicate = (await isDuplicate(c.env, userId, photo.dhash)) ? 1 : 0;
  const t = now();
  const day = kstDay(t);
  const id = crypto.randomUUID();
  const key = `meals/${userId}/${id}-${t}.jpg`;
  await putPhotoBlob(c.env, key, key, photo.bytes, "image/jpeg");
  await mealTestHooks.beforeWrite?.(userId);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO meal_villas (meal_id, villa_id, created_at)
         SELECT ?1, m.villa_id, ?2 FROM ${myActive("?3")} AND m.villa_id IN (${pick.ids.map((_, i) => `?${i + 4}`).join(",")})`,
      ).bind(id, t, userId, ...pick.ids),
      c.env.DB.prepare(MEAL_INSERT).bind(id, userId, day, mealType, key, photo.dhash, memo, duplicate, t),
      c.env.DB.prepare(ADD_POINTS).bind(id, userId),
    ]);
  } catch (e) {
    await deletePhotoBlob(c.env, blobRef(key));
    throw e;
  }
  const row = await c.env.DB.prepare("SELECT points FROM meals WHERE id = ?").bind(id).first<{ points: number }>();
  if (!row) {
    // 고른 아파트에서 모두 나가 식단이 들어가지 않았다 (남은 meal_villas 행도 없다: 아파트 행이 없어서 실패한 것)
    await deletePhotoBlob(c.env, blobRef(key));
    return jsonError(c, 409, PICK_GONE);
  }
  const { results } = await c.env.DB.prepare("SELECT villa_id AS id FROM meal_villas WHERE meal_id = ?").bind(id).all<{ id: string }>();
  return c.json({ mealId: id, points: row.points, duplicate: !!duplicate, villaIds: results.map((r) => r.id) });
});

/** 그 아파트 · 그날(KST)의 식단, 최신순. 오늘부터 6일 전까지(7일)만 */
meals.get("/api/meals", requireUser, async (c) => {
  const me = c.get("userId");
  const villaId = c.req.query("villa") ?? "";
  if (!villaId || !(await isMember(c.env, villaId, me))) return jsonError(c, 403, FORBIDDEN);
  const today = kstDay(now());
  let oldest = today;
  for (let i = 1; i < MEAL_DAYS; i++) oldest = prevDay(oldest);
  const day = c.req.query("day") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || day < oldest) return jsonError(c, 400, BAD_DAY);
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.user_id, u.nickname, u.avatar, m.meal_type, m.memo, m.created_at, m.updated_at,
       (SELECT COUNT(*) FROM meal_cheers WHERE meal_id = m.id) AS cheerCount,
       EXISTS (SELECT 1 FROM meal_cheers WHERE meal_id = m.id AND user_id = ?3) AS cheeredByMe,
       (SELECT COUNT(*) FROM meal_comments WHERE meal_id = m.id) AS commentCount
     FROM meal_villas mv JOIN meals m ON m.id = mv.meal_id JOIN users u ON u.id = m.user_id
     WHERE mv.villa_id = ?1 AND m.day = ?2 AND m.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM memberships a WHERE a.villa_id = ?1 AND a.user_id = m.user_id AND a.left_at IS NULL)
     ORDER BY m.created_at DESC, m.rowid DESC LIMIT 300`,
  )
    .bind(villaId, day, me)
    .all<{
      id: string; user_id: string; nickname: string; avatar: string; meal_type: MealType; memo: string | null;
      created_at: number; updated_at: number; cheerCount: number; cheeredByMe: number; commentCount: number;
    }>();
  // 오늘(KST) 식단으로 더 받을 수 있는 포인트 (올리기 화면 안내용)
  const earned = await c.env.DB.prepare("SELECT COALESCE(SUM(points - refunded), 0) AS n FROM meals WHERE user_id = ? AND day = ?")
    .bind(me, today)
    .first<{ n: number }>();
  return c.json({
    day,
    today,
    pointsLeftToday: Math.max(0, MEAL_DAILY_CAP - (earned?.n ?? 0)),
    meals: results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      nickname: r.nickname,
      avatar: safeAvatar(r.avatar),
      mealType: r.meal_type,
      memo: r.memo,
      photoUrl: photoUrl(r),
      createdAt: r.created_at,
      edited: r.updated_at !== r.created_at,
      mine: r.user_id === me,
      cheerCount: r.cheerCount,
      cheeredByMe: !!r.cheeredByMe,
      commentCount: r.commentCount,
    })),
  });
});

/** 식단 하나 (고치기 화면) */
meals.get("/api/meals/:id", requireUser, async (c) => {
  const me = c.get("userId");
  const found = await visibleMeal(c.env, me, c.req.param("id"));
  if ("status" in found) return jsonError(c, found.status, found.message);
  const m = found.meal;
  return c.json({ id: m.id, userId: m.user_id, day: m.day, mealType: m.meal_type, memo: m.memo, photoUrl: photoUrl(m), createdAt: m.created_at, mine: m.user_id === me });
});

/**
 * 식단 고치기: 작성자 본인만. 끼니 · 사진 · 메모만 바꿀 수 있다(올린 아파트 · 날짜 · 포인트는 그대로).
 * multipart: mealType?, memo?(빈 값이면 지움), file? + dhash?
 * 순서: 없음 · 볼 수 없음 404 → 작성자가 아님 403 → 값 확인 400
 */
meals.patch("/api/meals/:id", requireUser, async (c) => {
  const userId = c.get("userId");
  const meal = await findMeal(c.env, c.req.param("id"));
  if (!meal || !(await canViewMeal(c.env, userId, meal))) return jsonError(c, 404, NOT_FOUND);
  if (meal.user_id !== userId) return jsonError(c, 403, NOT_MINE);
  const form = await c.req.formData().catch(() => null);
  if (!form) return jsonError(c, 400, "고칠 내용을 보내 주세요");
  const rawType = form.get("mealType");
  if (rawType !== null && !isMealType(rawType)) return jsonError(c, 400, BAD_TYPE);
  const mealType = (rawType as MealType | null) ?? meal.meal_type;
  const rawMemo = form.get("memo");
  const memo = rawMemo === null ? meal.memo : parseMemo(rawMemo);
  if (memo === undefined) return jsonError(c, 400, BAD_MEMO);
  let key = meal.r2_key;
  let dhash: string | null = null;
  if (form.get("file") !== null) {
    const photo = await readPhoto(form);
    if ("status" in photo) return jsonError(c, photo.status, photo.message);
    key = `meals/${userId}/${meal.id}-${now()}.jpg`;
    dhash = photo.dhash;
    await putPhotoBlob(c.env, key, key, photo.bytes, "image/jpeg");
  }
  const t = Math.max(now(), meal.updated_at + 1);
  const r = await c.env.DB.prepare(
    `UPDATE meals SET meal_type = ?1, memo = ?2, r2_key = ?3, dhash = COALESCE(?4, dhash), updated_at = ?5
     WHERE id = ?6 AND user_id = ?7 AND deleted_at IS NULL`,
  )
    .bind(mealType, memo, key, dhash, t, meal.id, userId)
    .run();
  if (!r.meta.changes) {
    if (key && key !== meal.r2_key) await deletePhotoBlob(c.env, blobRef(key));
    return jsonError(c, 404, NOT_FOUND);
  }
  // 사진을 바꿨으면 예전 사진 파일을 지운다
  if (meal.r2_key && key !== meal.r2_key) await deletePhotoBlob(c.env, blobRef(meal.r2_key));
  return c.json({ id: meal.id, mealType, memo, photoUrl: photoUrl({ id: meal.id, updated_at: t }) });
});

/** 식단 · 그 식단에 달린 응원 · 댓글 알림 정리 문장 */
function cleanupForMeal(env: Env, mealId: string): D1PreparedStatement[] {
  return [
    env.DB.prepare("DELETE FROM events WHERE id IN (SELECT 'commented:' || id FROM meal_comments WHERE meal_id = ?)").bind(mealId),
    env.DB.prepare("DELETE FROM events WHERE substr(id, 1, length(?1) + 9) = 'cheered:' || ?1 || ':'").bind(mealId),
    env.DB.prepare("DELETE FROM meal_cheers WHERE meal_id = ?").bind(mealId),
    env.DB.prepare("DELETE FROM meal_comments WHERE meal_id = ?").bind(mealId),
  ];
}

/**
 * 식단 지우기: 작성자 본인만. 행은 남기고(deleted_at) 사진 · 메모 · 응원 · 댓글은 지운다.
 * 받은 포인트는 되돌린다(빼낸다). 이미 써서 모자라면 남은 만큼만 빼고, 못 뺀 만큼은 그날 받은 포인트로 계속 센다
 * (지우고 다시 올려 포인트를 늘리지 못하게)
 */
meals.delete("/api/meals/:id", requireUser, async (c) => {
  const userId = c.get("userId");
  const meal = await findMeal(c.env, c.req.param("id"));
  if (!meal || !(await canViewMeal(c.env, userId, meal))) return jsonError(c, 404, NOT_FOUND);
  if (meal.user_id !== userId) return jsonError(c, 403, "내가 올린 식단만 지울 수 있어요");
  const [, , , , del] = await c.env.DB.batch([
    ...cleanupForMeal(c.env, meal.id),
    c.env.DB.prepare(
      `UPDATE meals SET deleted_at = ?1, memo = NULL,
         refunded = MIN(points, COALESCE((SELECT points FROM users WHERE id = ?3), 0))
       WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL`,
    ).bind(now(), meal.id, userId),
    // 바로 앞 문장이 실제로 지웠을 때만 (두 번 눌러도 한 번만 뺀다)
    c.env.DB.prepare("UPDATE users SET points = points - (SELECT refunded FROM meals WHERE id = ?1) WHERE id = ?2 AND changes() = 1").bind(meal.id, userId),
  ]);
  if (!del.meta.changes) return jsonError(c, 404, NOT_FOUND);
  if (meal.r2_key) await deletePhotoBlob(c.env, blobRef(meal.r2_key));
  const row = await c.env.DB.prepare("SELECT refunded FROM meals WHERE id = ?").bind(meal.id).first<{ refunded: number }>();
  return c.json({ ok: true, refunded: row?.refunded ?? 0 });
});

meals.get("/api/meals/:id/photo", requireUser, async (c) => {
  const found = await visibleMeal(c.env, c.get("userId"), c.req.param("id"));
  if ("status" in found) return jsonError(c, found.status, found.status === 404 ? "사진을 찾을 수 없어요" : found.message);
  if (!found.meal.r2_key) return jsonError(c, 404, "사진을 찾을 수 없어요");
  const obj = await getPhotoBlob(c.env, blobRef(found.meal.r2_key));
  if (!obj) return jsonError(c, 404, "사진을 찾을 수 없어요");
  return new Response(obj.body, {
    headers: { "content-type": obj.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
});

// ── 응원 · 댓글 (인증 응원 · 댓글과 같은 규칙) ──

const VISIBLE = "EXISTS (SELECT 1 FROM meals WHERE id = ?1 AND deleted_at IS NULL)";

/** 알림을 누르면 열 아파트: 식단이 올라간 아파트 중 작성자와 보낸 사람이 함께 사는 곳 */
async function sharedVillaFor(env: Env, mealId: string, authorId: string, viewerId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT mv.villa_id AS id FROM meal_villas mv
     JOIN memberships ma ON ma.villa_id = mv.villa_id AND ma.user_id = ?2 AND ma.left_at IS NULL
     JOIN memberships mb ON mb.villa_id = mv.villa_id AND mb.user_id = ?3 AND mb.left_at IS NULL
     WHERE mv.meal_id = ?1 LIMIT 1`,
  )
    .bind(mealId, authorId, viewerId)
    .first<{ id: string }>();
  return row?.id ?? "";
}

meals.post("/api/meals/:id/cheer", requireUser, async (c) => {
  const userId = c.get("userId");
  const found = await visibleMeal(c.env, userId, c.req.param("id"));
  if ("status" in found) return jsonError(c, found.status, found.status === 403 ? "같은 아파트 입주민만 응원할 수 있어요" : found.message);
  const { meal } = found;
  if (meal.user_id === userId) return jsonError(c, 400, "내 식단에는 응원할 수 없어요");
  const [, , res] = await c.env.DB.batch<{ cheered: number; count: number }>([
    c.env.DB.prepare("DELETE FROM meal_cheers WHERE meal_id = ?1 AND user_id = ?2").bind(meal.id, userId),
    c.env.DB.prepare(`INSERT INTO meal_cheers (meal_id, user_id, created_at) SELECT ?1, ?2, ?3 WHERE changes() = 0 AND ${VISIBLE}`).bind(meal.id, userId, now()),
    c.env.DB.prepare(
      `SELECT EXISTS (SELECT 1 FROM meal_cheers WHERE meal_id = ?1 AND user_id = ?2) AS cheered,
         (SELECT COUNT(*) FROM meal_cheers WHERE meal_id = ?1) AS count`,
    ).bind(meal.id, userId),
  ]);
  const { cheered, count } = res.results[0];
  if (cheered) {
    const me = await c.env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(userId).first<{ nickname: string }>();
    const villaId = await sharedVillaFor(c.env, meal.id, meal.user_id, userId);
    // (식단, 응원한 사람)마다 딱 한 번: 껐다 켜도 다시 알리지 않는다
    await logEvents(c.env, [
      {
        userId: meal.user_id,
        type: "cheered",
        payload: { nickname: me?.nickname ?? "", mealId: meal.id, day: meal.day, villaId },
        key: `cheered:${meal.id}:${userId}`,
      },
    ]);
  }
  return c.json({ cheered: !!cheered, count });
});

type CommentRow = { id: string; userId: string; nickname: string; avatar: string; body: string; createdAt: number };
const toComment = (r: CommentRow, canDelete: boolean) => ({ ...r, avatar: safeAvatar(r.avatar), canDelete });

meals.get("/api/meals/:id/comments", requireUser, async (c) => {
  const userId = c.get("userId");
  const found = await visibleMeal(c.env, userId, c.req.param("id"));
  if ("status" in found) return jsonError(c, found.status, found.message);
  const { meal } = found;
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.user_id AS userId, u.nickname, u.avatar, m.body, m.created_at AS createdAt
     FROM meal_comments m JOIN users u ON u.id = m.user_id
     WHERE m.meal_id = ? ORDER BY m.created_at ASC, m.rowid ASC`,
  )
    .bind(meal.id)
    .all<CommentRow>();
  return c.json(results.map((r) => toComment(r, meal.user_id === userId || r.userId === userId)));
});

meals.post("/api/meals/:id/comments", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (body.length < 1 || body.length > COMMENT_MAX) return jsonError(c, 400, BAD_COMMENT);
  const found = await visibleMeal(c.env, userId, c.req.param("id"));
  if ("status" in found) return jsonError(c, found.status, found.message);
  const { meal } = found;
  const t = now();
  const dayStart = Date.parse(`${kstDay(t)}T00:00:00+09:00`);
  const id = crypto.randomUUID();
  // 하루 댓글 수는 인증 댓글과 함께 comment_log 로 센다
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO meal_comments (id, meal_id, user_id, body, created_at)
       SELECT ?2, ?1, ?3, ?4, ?5 WHERE ${VISIBLE}
         AND (SELECT COUNT(*) FROM comment_log WHERE user_id = ?3 AND created_at >= ?6) < ?7`,
    ).bind(meal.id, id, userId, body, t, dayStart, COMMENTS_PER_DAY),
    c.env.DB.prepare("INSERT INTO comment_log (user_id, created_at) SELECT ?1, ?2 WHERE changes() = 1").bind(userId, t),
  ]);
  if (!r.meta.changes) {
    const again = await visibleMeal(c.env, userId, meal.id);
    return "status" in again ? jsonError(c, again.status, again.message) : jsonError(c, 429, TOO_MANY);
  }
  const me = (await c.env.DB.prepare("SELECT nickname, avatar FROM users WHERE id = ?").bind(userId).first<{ nickname: string; avatar: string }>())!;
  if (meal.user_id !== userId) {
    const villaId = await sharedVillaFor(c.env, meal.id, meal.user_id, userId);
    await logEvents(c.env, [
      { userId: meal.user_id, type: "commented", payload: { nickname: me.nickname, body, mealId: meal.id, day: meal.day, villaId }, key: `commented:${id}` },
    ]);
  }
  return c.json(toComment({ id, userId, nickname: me.nickname, avatar: me.avatar, body, createdAt: t }, true));
});

meals.delete("/api/meal-comments/:id", requireUser, async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT m.id, m.user_id AS authorId, t.user_id AS ownerId FROM meal_comments m JOIN meals t ON t.id = m.meal_id WHERE m.id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; authorId: string; ownerId: string }>();
  if (!row) return jsonError(c, 404, "댓글을 찾을 수 없어요");
  if (row.authorId !== userId && row.ownerId !== userId) return jsonError(c, 403, "지울 수 있는 권한이 없어요");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM events WHERE id = 'commented:' || ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM meal_comments WHERE id = ?").bind(row.id),
  ]);
  return c.json({ ok: true });
});

/** 탈퇴: 내 식단 사진 파일을 지운다 (DB 정리 전에) */
export async function deleteMealPhotosOf(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare("SELECT r2_key FROM meals WHERE user_id = ? AND r2_key IS NOT NULL AND deleted_at IS NULL")
    .bind(userId)
    .all<{ r2_key: string }>();
  await deletePhotoBlobs(env, results.map((r) => blobRef(r.r2_key)));
}

/** 탈퇴: 내가 남긴 식단 응원 · 댓글과 내 식단(에 달린 것 포함). 알림 정리는 cheerCleanupForUser 와 events 삭제가 함께 맡는다 */
export function mealCleanupForUser(env: Env, userId: string): D1PreparedStatement[] {
  const mine = "user_id = ?1 OR meal_id IN (SELECT id FROM meals WHERE user_id = ?1)";
  return [
    env.DB.prepare("DELETE FROM events WHERE id IN (SELECT 'commented:' || id FROM meal_comments WHERE user_id = ?1)").bind(userId),
    env.DB.prepare(`DELETE FROM meal_cheers WHERE ${mine}`).bind(userId),
    env.DB.prepare(`DELETE FROM meal_comments WHERE ${mine}`).bind(userId),
    env.DB.prepare("DELETE FROM meal_villas WHERE meal_id IN (SELECT id FROM meals WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM meals WHERE user_id = ?").bind(userId),
  ];
}
