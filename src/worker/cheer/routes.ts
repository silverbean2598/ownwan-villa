import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { canViewCert, isModeratorOf } from "../cert/routes";
import { logEvents } from "../events/log";
import { safeAvatar } from "../villa/routes";
import { kstDay } from "../../shared/rules/day";

export const cheer = new Hono<AppEnv>();

export const COMMENT_MAX = 100;
export const COMMENTS_PER_DAY = 20;
const NOT_FOUND = "기록을 찾을 수 없어요";
const BAD_BODY = "댓글은 1~100자로 써 주세요";
const TOO_MANY = "오늘은 댓글을 너무 많이 썼어요";

/** 댓글 알림 이벤트 id. 댓글을 지우면 아직 남은 알림도 함께 지운다 */
const COMMENT_EVENT = "'commented:' || id";

/** 응원 · 댓글을 달 수 있는 기록: 있고, 지워지지 않았고, 게시판에 보이는(중복 아님) 기록, 같은 빌라 입주민, 가려지지 않음 */
type CertRef = { id: string; ownerId: string; hidden: number };
type Found = { cert: CertRef; error?: undefined } | { cert?: undefined; error: { status: number; message: string } };

async function findCert(env: Env, viewerId: string, certId: string): Promise<Found> {
  const cert = await env.DB.prepare("SELECT id, user_id AS ownerId, hidden FROM certs WHERE id = ? AND deleted = 0 AND duplicate = 0")
    .bind(certId)
    .first<CertRef>();
  const fail = (status: number, message: string): Found => ({ error: { status, message } });
  if (!cert) return fail(404, NOT_FOUND);
  if (!(await canViewCert(env, viewerId, { id: cert.id, user_id: cert.ownerId }))) return fail(403, "같은 빌라 입주민만 응원할 수 있어요");
  if (cert.hidden) return fail(404, NOT_FOUND);
  return { cert };
}

const VISIBLE = "EXISTS (SELECT 1 FROM certs WHERE id = ?1 AND deleted = 0 AND hidden = 0)";

cheer.post("/api/certs/:id/cheer", requireUser, async (c) => {
  const userId = c.get("userId");
  const found = await findCert(c.env, userId, c.req.param("id"));
  if (found.error) return jsonError(c, found.error.status, found.error.message);
  const { cert } = found;
  if (cert.ownerId === userId) return jsonError(c, 400, "내 기록에는 응원할 수 없어요");
  // 한 묶음 안에서 토글: 지운 게 없으면(changes() = 0) 넣는다. 연달아 눌러도 행이 겹치지 않는다
  const [, , res] = await c.env.DB.batch<{ cheered: number; count: number }>([
    c.env.DB.prepare("DELETE FROM cheers WHERE cert_id = ?1 AND user_id = ?2").bind(cert.id, userId),
    c.env.DB.prepare(
      `INSERT INTO cheers (cert_id, user_id, created_at) SELECT ?1, ?2, ?3 WHERE changes() = 0 AND ${VISIBLE}`,
    ).bind(cert.id, userId, now()),
    c.env.DB.prepare(
      `SELECT EXISTS (SELECT 1 FROM cheers WHERE cert_id = ?1 AND user_id = ?2) AS cheered,
         (SELECT COUNT(*) FROM cheers WHERE cert_id = ?1) AS count`,
    ).bind(cert.id, userId),
  ]);
  const { cheered, count } = res.results[0];
  if (cheered) {
    const me = await c.env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(userId).first<{ nickname: string }>();
    // (기록, 응원한 사람)마다 딱 한 번: 껐다 켜도 다시 알리지 않는다
    await logEvents(c.env, [
      { userId: cert.ownerId, type: "cheered", payload: { nickname: me?.nickname ?? "", certId: cert.id }, key: `cheered:${cert.id}:${userId}` },
    ]);
  }
  return c.json({ cheered: !!cheered, count });
});

type CommentRow = { id: string; userId: string; nickname: string; avatar: string; body: string; createdAt: number };
const toComment = (r: CommentRow, canDelete: boolean) => ({ ...r, avatar: safeAvatar(r.avatar), canDelete });

cheer.get("/api/certs/:id/comments", requireUser, async (c) => {
  const userId = c.get("userId");
  const found = await findCert(c.env, userId, c.req.param("id"));
  if (found.error) return jsonError(c, found.error.status, found.error.message);
  const { cert } = found;
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.user_id AS userId, u.nickname, u.avatar, m.body, m.created_at AS createdAt
     FROM comments m JOIN users u ON u.id = m.user_id
     WHERE m.cert_id = ? ORDER BY m.created_at ASC, m.rowid ASC`,
  )
    .bind(cert.id)
    .all<CommentRow>();
  const moderator = cert.ownerId === userId || (await isModeratorOf(c.env, userId, { id: cert.id, user_id: cert.ownerId }));
  return c.json(results.map((r) => toComment(r, moderator || r.userId === userId)));
});

cheer.post("/api/certs/:id/comments", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (body.length < 1 || body.length > COMMENT_MAX) return jsonError(c, 400, BAD_BODY);
  const found = await findCert(c.env, userId, c.req.param("id"));
  if (found.error) return jsonError(c, found.error.status, found.error.message);
  const { cert } = found;
  const t = now();
  const dayStart = Date.parse(`${kstDay(t)}T00:00:00+09:00`);
  const id = crypto.randomUUID();
  // 하루 개수 제한과 기록이 아직 보이는지를 INSERT 안에서 함께 판정한다 (동시에 써도 넘치지 않게).
  // 개수는 comment_log 에서 센다: 지운 댓글도 세어 지우고 다시 쓰기로 제한 · 알림을 늘리지 못한다.
  // 같은 batch(트랜잭션)에서 댓글이 실제로 들어갔을 때만(changes() = 1) 기록을 남긴다
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comments (id, cert_id, user_id, body, created_at)
       SELECT ?2, ?1, ?3, ?4, ?5 WHERE ${VISIBLE}
         AND (SELECT COUNT(*) FROM comment_log WHERE user_id = ?3 AND created_at >= ?6) < ?7`,
    ).bind(cert.id, id, userId, body, t, dayStart, COMMENTS_PER_DAY),
    c.env.DB.prepare("INSERT INTO comment_log (user_id, created_at) SELECT ?1, ?2 WHERE changes() = 1").bind(userId, t),
  ]);
  if (!r.meta.changes) {
    const again = await findCert(c.env, userId, cert.id);
    return again.error ? jsonError(c, again.error.status, again.error.message) : jsonError(c, 429, TOO_MANY);
  }
  const me = (await c.env.DB.prepare("SELECT nickname, avatar FROM users WHERE id = ?").bind(userId).first<{ nickname: string; avatar: string }>())!;
  if (cert.ownerId !== userId) {
    await logEvents(c.env, [
      { userId: cert.ownerId, type: "commented", payload: { nickname: me.nickname, body, certId: cert.id }, key: `commented:${id}` },
    ]);
  }
  return c.json(toComment({ id, userId, nickname: me.nickname, avatar: me.avatar, body, createdAt: t }, true));
});

cheer.delete("/api/comments/:id", requireUser, async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT m.id, m.user_id AS authorId, t.user_id AS ownerId, t.id AS certId FROM comments m JOIN certs t ON t.id = m.cert_id WHERE m.id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; authorId: string; ownerId: string; certId: string }>();
  if (!row) return jsonError(c, 404, "댓글을 찾을 수 없어요");
  const allowed = row.authorId === userId || row.ownerId === userId || (await isModeratorOf(c.env, userId, { id: row.certId, user_id: row.ownerId }));
  if (!allowed) return jsonError(c, 403, "지울 수 있는 권한이 없어요");
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM events WHERE id IN (SELECT ${COMMENT_EVENT} FROM comments WHERE id = ?)`).bind(row.id),
    c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(row.id),
  ]);
  return c.json({ ok: true });
});

/** 기록을 지울 때 함께 지울 응원 · 댓글 (기록 삭제 batch 에 넣는다) */
export function cheerCleanupForCert(env: Env, certId: string): D1PreparedStatement[] {
  return [
    env.DB.prepare(`DELETE FROM events WHERE id IN (SELECT ${COMMENT_EVENT} FROM comments WHERE cert_id = ?)`).bind(certId),
    env.DB.prepare(`DELETE FROM events WHERE substr(id, 1, length(?1) + 9) = 'cheered:' || ?1 || ':'`).bind(certId),
    env.DB.prepare("DELETE FROM cheers WHERE cert_id = ?").bind(certId),
    env.DB.prepare("DELETE FROM comments WHERE cert_id = ?").bind(certId),
  ];
}

/** 탈퇴: 내가 남긴 응원 · 댓글(어디에 있든)과 내 기록에 달린 것. certs 를 지우기 전에 batch 에 넣는다 */
export function cheerCleanupForUser(env: Env, userId: string): D1PreparedStatement[] {
  const mine = "user_id = ?1 OR cert_id IN (SELECT id FROM certs WHERE user_id = ?1)";
  return [
    env.DB.prepare(`DELETE FROM events WHERE id IN (SELECT ${COMMENT_EVENT} FROM comments WHERE user_id = ?1)`).bind(userId),
    env.DB.prepare(`DELETE FROM events WHERE id LIKE 'cheered:%' AND substr(id, -length(?1) - 1) = ':' || ?1`).bind(userId),
    env.DB.prepare(`DELETE FROM cheers WHERE ${mine}`).bind(userId),
    env.DB.prepare("DELETE FROM comment_log WHERE user_id = ?").bind(userId),
    env.DB.prepare(`DELETE FROM comments WHERE ${mine}`).bind(userId),
  ];
}
