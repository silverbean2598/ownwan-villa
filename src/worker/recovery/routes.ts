import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { PASSWORD_LENGTH_MSG, hashPassword, isValidPasswordLength } from "../auth/password";
import { normalizeUsername } from "../auth/username";
import { createSession, setSessionCookie } from "../auth/session";
import { hashToken, newRecoveryCode } from "./codes";
import { KAKAO_ONLY_MSG, isPasswordless } from "../auth/identity";

export const recovery = new Hono<AppEnv>();

const HOLD_MS = 24 * 60 * 60 * 1000;
const BAD_CODE = "아이디 또는 복구 코드가 맞지 않아요";
const BAD_TICKET = "요청 번호가 맞지 않거나 아직 승인되지 않았어요";
const RETRY_MS = 60 * 60 * 1000;
const CANCEL_OPEN = "UPDATE recovery_requests SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending','approved')";

/**
 * 방장 확인을 해 줄 사람과 그 빌라 [확정 — 기획자 결정, 2026-11-19 범위 안에서 정한 규칙]:
 * 빌라 여러 곳에 살면 **가장 먼저 입주한(가장 오래 산) 빌라** 한 곳에서만 확인한다 (확인해 줄 수 있는 사람을 한 명으로 둔다).
 * 그 빌라에서 요청자가 방장이 아니면 방장, 방장이면 남은 입주민 중 가장 먼저 입주한 사람. 없으면 null.
 */
export async function approvalFor(env: Env, userId: string): Promise<{ approverId: string; villaId: string } | null> {
  const villa = await env.DB.prepare(
    `SELECT v.id, v.owner_id FROM memberships m JOIN villas v ON v.id = m.villa_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND v.dissolved_at IS NULL ORDER BY m.joined_at ASC, m.rowid ASC LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string; owner_id: string }>();
  if (!villa) return null;
  if (villa.owner_id !== userId) return { approverId: villa.owner_id, villaId: villa.id };
  const next = await env.DB.prepare(
    "SELECT user_id FROM memberships WHERE villa_id = ? AND left_at IS NULL AND user_id != ? ORDER BY joined_at ASC, rowid ASC LIMIT 1",
  )
    .bind(villa.id, userId)
    .first<{ user_id: string }>();
  return next ? { approverId: next.user_id, villaId: villa.id } : null;
}

export async function approverFor(env: Env, userId: string): Promise<string | null> {
  return (await approvalFor(env, userId))?.approverId ?? null;
}

// 비밀번호 교체 + 복구 코드 교체 + 기존 세션 종료 + 새 세션 발급. 새 복구 코드를 돌려준다.
async function resetAccess(c: Parameters<typeof setSessionCookie>[0], env: Env, userId: string, newPassword: string) {
  const recoveryCode = newRecoveryCode();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, recovery_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?",
    ).bind(await hashPassword(newPassword), await hashToken(recoveryCode), userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare(CANCEL_OPEN).bind(userId),
  ]);
  setSessionCookie(c, await createSession(env, userId));
  return recoveryCode;
}

recovery.post("/api/recover/code", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = normalizeUsername(b?.username);
  const code = typeof b?.code === "string" ? b.code : "";
  const newPassword = typeof b?.newPassword === "string" ? b.newPassword : "";
  const user = await c.env.DB.prepare("SELECT id, recovery_hash, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; recovery_hash: string; password_hash: string }>();
  if (user && isPasswordless(user.password_hash)) return jsonError(c, 400, KAKAO_ONLY_MSG);
  if (!user || !code || user.recovery_hash !== (await hashToken(code))) return jsonError(c, 400, BAD_CODE);
  if (!isValidPasswordLength(newPassword)) return jsonError(c, 400, PASSWORD_LENGTH_MSG);
  return c.json({ recoveryCode: await resetAccess(c, c.env, user.id, newPassword) });
});

recovery.post("/api/recovery-code/reissue", requireUser, async (c) => {
  const recoveryCode = newRecoveryCode();
  const userId = c.get("userId");
  const u = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  if (isPasswordless(u?.password_hash)) return jsonError(c, 400, "카카오로 가입한 계정은 복구 코드가 없어요. 카카오로 로그인하면 돼요");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET recovery_hash = ? WHERE id = ?").bind(await hashToken(recoveryCode), userId),
    c.env.DB.prepare(CANCEL_OPEN).bind(userId),
  ]);
  return c.json({ recoveryCode });
});

recovery.post("/api/recover/request", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = normalizeUsername(b?.username);
  const user = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE username = ?").bind(username).first<{ id: string; password_hash: string }>();
  if (!user) return jsonError(c, 400, "아이디를 확인해 주세요");
  if (isPasswordless(user.password_hash)) return jsonError(c, 400, KAKAO_ONLY_MSG);
  const inVilla = await c.env.DB.prepare("SELECT 1 AS x FROM memberships WHERE user_id = ? AND left_at IS NULL")
    .bind(user.id)
    .first();
  if (!inVilla) return jsonError(c, 400, "빌라에 살고 있어야 방장 확인을 쓸 수 있어요");
  const approver = await approverFor(c.env, user.id);
  if (!approver) return jsonError(c, 409, "확인해 줄 입주민이 없어요. 복구 코드로만 되찾을 수 있어요");

  const open = await c.env.DB.prepare(
    "SELECT status, created_at FROM recovery_requests WHERE user_id = ? AND status IN ('pending','approved')",
  )
    .bind(user.id)
    .all<{ status: string; created_at: number }>();
  if (open.results.some((r) => r.status === "approved"))
    return jsonError(c, 409, "이미 승인된 요청이 있어요. 요청 번호로 비밀번호를 바꿔 주세요");
  if (open.results.some((r) => r.created_at > now() - RETRY_MS))
    return jsonError(c, 429, "방금 요청했어요. 1시간 뒤에 다시 요청해 주세요");

  const ticket = newRecoveryCode();
  await c.env.DB.batch([
    c.env.DB.prepare(CANCEL_OPEN).bind(user.id),
    c.env.DB.prepare(
      "INSERT INTO recovery_requests (id, user_id, approver_id, ticket_hash, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    ).bind(crypto.randomUUID(), user.id, approver, await hashToken(ticket), now()),
  ]);
  return c.json({ ticket }, 201);
});

// 저장된 approver_id가 아니라 지금 기준의 승인자로 판단한다 (방장이 나가면 승인자가 바뀐다)
export async function pendingApprovals(env: Env, me: string) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.user_id AS userId, u.nickname, r.created_at AS createdAt FROM recovery_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending' AND r.user_id != ?1
       AND EXISTS (SELECT 1 FROM memberships m JOIN memberships mm ON mm.villa_id = m.villa_id AND mm.user_id = ?1 AND mm.left_at IS NULL
                   WHERE m.user_id = r.user_id AND m.left_at IS NULL)
     ORDER BY r.created_at ASC`,
  )
    .bind(me)
    .all<{ id: string; userId: string; nickname: string; createdAt: number }>();
  const mine = [];
  for (const r of results) if ((await approverFor(env, r.userId)) === me) mine.push({ id: r.id, nickname: r.nickname, createdAt: r.createdAt });
  return mine;
}

recovery.get("/api/recover/pending", requireUser, async (c) => c.json(await pendingApprovals(c.env, c.get("userId"))));

recovery.post("/api/recover/:id/approve", requireUser, async (c) => {
  const me = c.get("userId");
  const req = await c.env.DB.prepare("SELECT user_id, status FROM recovery_requests WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ user_id: string; status: string }>();
  if (!req) return jsonError(c, 404, "요청을 찾을 수 없어요");
  const who = await approvalFor(c.env, req.user_id);
  if (who?.approverId !== me) return jsonError(c, 403, "내가 확인할 요청이 아니에요");
  // 승인 시점에 확인한 빌라(요청자가 가장 먼저 입주한 빌라)를 함께 적는다: 완료할 때 그 빌라에 아직 살아야 한다
  const res = await c.env.DB.prepare(
    `UPDATE recovery_requests SET status = 'approved', approved_at = ?1, approver_id = ?2, villa_id = ?3
     WHERE id = ?4 AND status = 'pending'`,
  )
    .bind(now(), me, who.villaId, c.req.param("id"))
    .run();
  if (!res.meta.changes) return jsonError(c, 409, "이미 처리됐거나 취소된 요청이에요");
  return c.json({ ok: true });
});

recovery.post("/api/recover/complete", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = normalizeUsername(b?.username);
  const ticket = typeof b?.ticket === "string" ? b.ticket : "";
  const newPassword = typeof b?.newPassword === "string" ? b.newPassword : "";
  const req = ticket
    ? await c.env.DB.prepare(
        `SELECT r.id, r.user_id, r.approved_at, r.villa_id, u.password_hash FROM recovery_requests r JOIN users u ON u.id = r.user_id
         WHERE u.username = ? AND r.ticket_hash = ? AND r.status = 'approved'`,
      )
        .bind(username, await hashToken(ticket))
        .first<{ id: string; user_id: string; approved_at: number; villa_id: string | null; password_hash: string }>()
    : null;
  if (!req) return jsonError(c, 400, BAD_TICKET);
  // 카카오 전용 계정은 복구로 비밀번호 계정이 되지 않는다
  if (isPasswordless(req.password_hash)) return jsonError(c, 400, KAKAO_ONLY_MSG);
  if (!isValidPasswordLength(newPassword)) return jsonError(c, 400, PASSWORD_LENGTH_MSG);
  // 승인받을 때와 같은 (해산되지 않은) 빌라에 지금도 살아야 한다
  const stillIn = await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships m JOIN villas v ON v.id = m.villa_id AND v.dissolved_at IS NULL
     WHERE m.user_id = ? AND m.villa_id = ? AND m.left_at IS NULL`,
  )
    .bind(req.user_id, req.villa_id)
    .first();
  if (!stillIn) {
    await c.env.DB.prepare("UPDATE recovery_requests SET status = 'cancelled' WHERE id = ?").bind(req.id).run();
    return jsonError(c, 400, "확인해 준 빌라에서 나가서 요청이 취소됐어요. 다시 요청해 주세요");
  }
  if (now() < req.approved_at + HOLD_MS) return jsonError(c, 425, "승인 후 24시간이 지나야 바꿀 수 있어요");
  // 같은 요청 번호로 두 번 쓸 수 없도록 먼저 선점한다
  const claimed = await c.env.DB.prepare("UPDATE recovery_requests SET status = 'done' WHERE id = ? AND status = 'approved'")
    .bind(req.id)
    .run();
  if (!claimed.meta.changes) return jsonError(c, 400, BAD_TICKET);
  return c.json({ recoveryCode: await resetAccess(c, c.env, req.user_id, newPassword) });
});
