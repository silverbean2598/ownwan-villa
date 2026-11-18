import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError } from "../http";
import { hashToken, newRecoveryCode } from "../recovery/codes";
import { DEFAULT_AVATAR, parseAvatar } from "../../shared/avatar";
import { hashPassword, verifyPassword } from "./password";
import { createSession, endSession, requireUser, setSessionCookie } from "./session";

export const auth = new Hono<AppEnv>();

const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const BAD_LOGIN = "아이디 또는 비밀번호가 맞지 않아요";

auth.post("/api/signup", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = typeof b?.username === "string" ? b.username : "";
  const password = typeof b?.password === "string" ? b.password : "";
  const nickname = typeof b?.nickname === "string" ? b.nickname.trim() : "";
  if (!/^[a-z0-9]{4,16}$/.test(username)) return jsonError(c, 400, "아이디는 영문 소문자와 숫자 4~16자로 입력해 주세요");
  if (password.length < 8) return jsonError(c, 400, "비밀번호는 8자 이상이어야 해요");
  if (nickname.length < 2 || nickname.length > 10) return jsonError(c, 400, "닉네임은 2~10자로 입력해 주세요");
  if (b?.over14 !== true) return jsonError(c, 400, "만 14세 이상만 가입할 수 있어요");
  if (b?.agree !== true) return jsonError(c, 400, "이용약관과 개인정보 처리방침에 동의해 주세요");

  const id = crypto.randomUUID();
  const recoveryCode = newRecoveryCode();
  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, nickname, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, username, nickname, await hashPassword(password), await hashToken(recoveryCode), now())
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return jsonError(c, 409, "이미 쓰고 있는 아이디예요");
    throw e;
  }
  setSessionCookie(c, await createSession(c.env, id));
  return c.json({ recoveryCode }, 201);
});

auth.post("/api/login", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = typeof b?.username === "string" ? b.username : "";
  const password = typeof b?.password === "string" ? b.password : "";
  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, failed_logins, locked_until FROM users WHERE username = ?",
  )
    .bind(username)
    .first<{ id: string; password_hash: string; failed_logins: number; locked_until: number | null }>();
  if (!user) return jsonError(c, 401, BAD_LOGIN);

  const t = now();
  if (user.locked_until && user.locked_until > t) return jsonError(c, 423, "로그인을 5번 실패해서 15분 동안 잠겼어요");

  if (!(await verifyPassword(password, user.password_hash))) {
    // 동시 요청에도 횟수가 유실되지 않도록 SQL 한 문장으로 원자적으로 갱신한다.
    // 잠금이 풀린 뒤의 첫 실패는 1로 새로 센다.
    const expired = "(locked_until IS NOT NULL AND locked_until <= ?)";
    const count = `CASE WHEN ${expired} THEN 1 ELSE failed_logins + 1 END`;
    await c.env.DB.prepare(
      `UPDATE users SET failed_logins = ${count},
         locked_until = CASE WHEN ${count} >= ? THEN ? WHEN ${expired} THEN NULL ELSE locked_until END
       WHERE id = ?`,
    )
      .bind(t, t, MAX_FAILS, t + LOCK_MS, t, user.id)
      .run();
    return jsonError(c, 401, BAD_LOGIN);
  }
  await c.env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
  // 비밀번호를 기억해냈으니 진행 중인 방장 확인 요청은 취소한다
  await c.env.DB.prepare(
    "UPDATE recovery_requests SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending','approved')",
  )
    .bind(user.id)
    .run();
  setSessionCookie(c, await createSession(c.env, user.id));
  return c.json({ ok: true });
});

auth.post("/api/logout", async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

auth.get("/api/me", requireUser, async (c) => {
  const u = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.nickname, u.sport, u.avatar, u.points, u.streak,
       (SELECT m.villa_id FROM memberships m JOIN villas v ON v.id = m.villa_id
         WHERE m.user_id = u.id AND m.left_at IS NULL AND v.dissolved_at IS NULL) AS villaId
     FROM users u WHERE u.id = ?`,
  )
    .bind(c.get("userId"))
    .first<{ avatar: string } & Record<string, unknown>>();
  if (!u) return jsonError(c, 401, "로그인이 필요해요");
  let stored: unknown = null;
  try {
    stored = JSON.parse(u.avatar);
  } catch {}
  return c.json({ ...u, avatar: parseAvatar(stored) ?? DEFAULT_AVATAR });
});
