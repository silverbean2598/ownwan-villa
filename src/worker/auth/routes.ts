import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError } from "../http";
import { hashToken, newRecoveryCode } from "../recovery/codes";
import { isValidNickname } from "../../shared/nickname";
import { DEFAULT_AVATAR, parseAvatar } from "../../shared/avatar";
import { PASSWORD_LENGTH_MSG, hashPassword, isValidPasswordLength, needsRehash, verifyPassword } from "./password";
import { normalizeUsername } from "./username";
import { KAKAO_ONLY_MSG, isPasswordless } from "./identity";
import { LOCKED_MSG, isLocked, recordFailure, resetFailures } from "./lockout";
import { createSession, endSession, requireUser, setSessionCookie } from "./session";
import { CERTIFIED_PHOTO } from "../cert/certified";
import { kstDay } from "../../shared/rules/day";

export const auth = new Hono<AppEnv>();

const BAD_LOGIN = "아이디 또는 비밀번호가 맞지 않아요";

auth.post("/api/signup", async (c) => {
  const b = await c.req.json().catch(() => null);
  const username = normalizeUsername(b?.username);
  const password = typeof b?.password === "string" ? b.password : "";
  const nickname = typeof b?.nickname === "string" ? b.nickname.trim() : "";
  if (!/^[a-z0-9]{4,16}$/.test(username)) return jsonError(c, 400, "아이디는 영문 소문자와 숫자 4~16자로 입력해 주세요");
  if (!isValidPasswordLength(password)) return jsonError(c, 400, PASSWORD_LENGTH_MSG);
  if (!isValidNickname(nickname)) return jsonError(c, 400, "닉네임은 2~10자로 입력해 주세요");
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
  const username = normalizeUsername(b?.username);
  const password = typeof b?.password === "string" ? b.password : "";
  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, failed_logins, locked_until FROM users WHERE username = ?",
  )
    .bind(username)
    .first<{ id: string; password_hash: string; failed_logins: number; locked_until: number | null }>();
  if (!user) return jsonError(c, 401, BAD_LOGIN);
  // 카카오로만 가입한 계정: 비밀번호 로그인은 절대 성공하지 않는다 (실패 횟수도 세지 않는다)
  if (isPasswordless(user.password_hash)) return jsonError(c, 401, KAKAO_ONLY_MSG);

  if (isLocked(user)) return jsonError(c, 423, LOCKED_MSG);

  if (!(await verifyPassword(password, user.password_hash))) {
    await recordFailure(c.env, user.id);
    return jsonError(c, 401, BAD_LOGIN);
  }
  await resetFailures(c.env, user.id);
  // 반복 횟수를 바꾼 뒤 예전 해시로 로그인하면 지금 설정으로 다시 해시해 둔다
  if (needsRehash(user.password_hash)) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?")
      .bind(await hashPassword(password), user.id, user.password_hash)
      .run();
  }
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
         WHERE m.user_id = u.id AND m.left_at IS NULL AND v.dissolved_at IS NULL ORDER BY m.joined_at ASC, m.rowid ASC LIMIT 1) AS villaId,
       EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.day = ? AND ${CERTIFIED_PHOTO}) AS certifiedToday
     FROM users u WHERE u.id = ?`,
  )
    .bind(kstDay(now()), c.get("userId"))
    .first<{ avatar: string; certifiedToday: number } & Record<string, unknown>>();
  if (!u) return jsonError(c, 401, "로그인이 필요해요");
  let stored: unknown = null;
  try {
    stored = JSON.parse(u.avatar);
  } catch {}
  return c.json({ ...u, avatar: parseAvatar(stored) ?? DEFAULT_AVATAR, certifiedToday: !!u.certifiedToday });
});
