import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { hashPassword } from "../auth/password";
import { createSession, setSessionCookie } from "../auth/session";
import { hashToken, newRecoveryCode } from "./codes";

export const recovery = new Hono<AppEnv>();

const HOLD_MS = 24 * 60 * 60 * 1000;
const BAD_CODE = "아이디 또는 복구 코드가 맞지 않아요";
const BAD_TICKET = "요청 번호가 맞지 않거나 아직 승인되지 않았어요";
const SHORT_PW = "비밀번호는 8자 이상이어야 해요";

// 요청자가 방장이 아니면 방장, 방장이면 남은 입주민 중 joined_at이 가장 이른 사람. 없으면 null.
export async function approverFor(env: Env, userId: string): Promise<string | null> {
  const villa = await env.DB.prepare(
    `SELECT v.id, v.owner_id FROM memberships m JOIN villas v ON v.id = m.villa_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND v.dissolved_at IS NULL`,
  )
    .bind(userId)
    .first<{ id: string; owner_id: string }>();
  if (!villa) return null;
  if (villa.owner_id !== userId) return villa.owner_id;
  const next = await env.DB.prepare(
    "SELECT user_id FROM memberships WHERE villa_id = ? AND left_at IS NULL AND user_id != ? ORDER BY joined_at ASC LIMIT 1",
  )
    .bind(villa.id, userId)
    .first<{ user_id: string }>();
  return next?.user_id ?? null;
}

// 비밀번호 교체 + 복구 코드 교체 + 기존 세션 종료 + 새 세션 발급. 새 복구 코드를 돌려준다.
async function resetAccess(c: Parameters<typeof setSessionCookie>[0], env: Env, userId: string, newPassword: string) {
  const recoveryCode = newRecoveryCode();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, recovery_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?",
    ).bind(await hashPassword(newPassword), await hashToken(recoveryCode), userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
  setSessionCookie(c, await createSession(env, userId));
  return recoveryCode;
}

recovery.post("/api/recover/code", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = typeof b?.username === "string" ? b.username : "";
  const code = typeof b?.code === "string" ? b.code : "";
  const newPassword = typeof b?.newPassword === "string" ? b.newPassword : "";
  const user = await c.env.DB.prepare("SELECT id, recovery_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; recovery_hash: string }>();
  if (!user || !code || user.recovery_hash !== (await hashToken(code))) return jsonError(c, 400, BAD_CODE);
  if (newPassword.length < 8) return jsonError(c, 400, SHORT_PW);
  return c.json({ recoveryCode: await resetAccess(c, c.env, user.id, newPassword) });
});

recovery.post("/api/recovery-code/reissue", requireUser, async (c) => {
  const recoveryCode = newRecoveryCode();
  await c.env.DB.prepare("UPDATE users SET recovery_hash = ? WHERE id = ?")
    .bind(await hashToken(recoveryCode), c.get("userId"))
    .run();
  return c.json({ recoveryCode });
});

recovery.post("/api/recover/request", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = typeof b?.username === "string" ? b.username : "";
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  if (!user) return jsonError(c, 400, "아이디를 확인해 주세요");
  const inVilla = await c.env.DB.prepare("SELECT 1 AS x FROM memberships WHERE user_id = ? AND left_at IS NULL")
    .bind(user.id)
    .first();
  if (!inVilla) return jsonError(c, 400, "빌라에 살고 있어야 방장 확인을 쓸 수 있어요");
  const approver = await approverFor(c.env, user.id);
  if (!approver) return jsonError(c, 409, "확인해 줄 입주민이 없어요. 복구 코드로만 되찾을 수 있어요");

  const ticket = newRecoveryCode();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE recovery_requests SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending','approved')",
    ).bind(user.id),
    c.env.DB.prepare(
      "INSERT INTO recovery_requests (id, user_id, approver_id, ticket_hash, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    ).bind(crypto.randomUUID(), user.id, approver, await hashToken(ticket), now()),
  ]);
  return c.json({ ticket }, 201);
});

recovery.get("/api/recover/pending", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, u.nickname, r.created_at AS createdAt FROM recovery_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.approver_id = ? AND r.status = 'pending' ORDER BY r.created_at ASC`,
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

recovery.post("/api/recover/:id/approve", requireUser, async (c) => {
  const req = await c.env.DB.prepare("SELECT approver_id, status FROM recovery_requests WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ approver_id: string; status: string }>();
  if (!req) return jsonError(c, 404, "요청을 찾을 수 없어요");
  if (req.approver_id !== c.get("userId")) return jsonError(c, 403, "내가 확인할 요청이 아니에요");
  const res = await c.env.DB.prepare(
    "UPDATE recovery_requests SET status = 'approved', approved_at = ? WHERE id = ? AND status = 'pending'",
  )
    .bind(now(), c.req.param("id"))
    .run();
  if (!res.meta.changes) return jsonError(c, 409, "이미 처리됐거나 취소된 요청이에요");
  return c.json({ ok: true });
});

recovery.post("/api/recover/complete", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = typeof b?.username === "string" ? b.username : "";
  const ticket = typeof b?.ticket === "string" ? b.ticket : "";
  const newPassword = typeof b?.newPassword === "string" ? b.newPassword : "";
  const req = ticket
    ? await c.env.DB.prepare(
        `SELECT r.id, r.user_id, r.approved_at FROM recovery_requests r JOIN users u ON u.id = r.user_id
         WHERE u.username = ? AND r.ticket_hash = ? AND r.status = 'approved'`,
      )
        .bind(username, await hashToken(ticket))
        .first<{ id: string; user_id: string; approved_at: number }>()
    : null;
  if (!req) return jsonError(c, 400, BAD_TICKET);
  if (newPassword.length < 8) return jsonError(c, 400, SHORT_PW);
  if (now() < req.approved_at + HOLD_MS) return jsonError(c, 425, "승인 후 24시간이 지나야 바꿀 수 있어요");
  // 같은 요청 번호로 두 번 쓸 수 없도록 먼저 선점한다
  const claimed = await c.env.DB.prepare("UPDATE recovery_requests SET status = 'done' WHERE id = ? AND status = 'approved'")
    .bind(req.id)
    .run();
  if (!claimed.meta.changes) return jsonError(c, 400, BAD_TICKET);
  return c.json({ recoveryCode: await resetAccess(c, c.env, req.user_id, newPassword) });
});
