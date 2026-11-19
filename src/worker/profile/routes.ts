import { Hono } from "hono";
import type { AppEnv } from "../env";
import { jsonError, requireUser } from "../http";
import { SPORTS } from "../../shared/sports";
import { isValidNickname } from "../../shared/nickname";
import { parseAvatar, wornItemIds } from "../../shared/avatar";
import { getCookie, deleteCookie } from "hono/cookie";
import { COOKIE } from "../auth/session";
import { PASSWORD_LENGTH_MSG, hashPassword, isValidPasswordLength, verifyPassword } from "../auth/password";
import { hashToken } from "../recovery/codes";
import { KAKAO_ONLY_MSG, isPasswordless } from "../auth/identity";
import { LOCKED_MSG, isLocked, recordFailure, resetFailures } from "../auth/lockout";
import { deletePhotoBlobs } from "../storage";
import { leaveAllVillas } from "../villa/service";
import { cheerCleanupForUser } from "../cheer/routes";

export const profile = new Hono<AppEnv>();

profile.patch("/api/me", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  if (typeof b !== "object" || b === null) return jsonError(c, 400, "요청이 올바르지 않아요");
  const sets: string[] = [];
  const vals: (string | null)[] = [];

  if ("sport" in b) {
    if (!(SPORTS as readonly unknown[]).includes(b.sport)) return jsonError(c, 400, "종목을 다시 골라 주세요");
    sets.push("sport = ?");
    vals.push(b.sport);
  }
  if ("avatar" in b) {
    const a = parseAvatar(b.avatar);
    if (!a) return jsonError(c, 400, "캐릭터 설정이 올바르지 않아요");
    // 옷 · 소품은 산 것만 입을 수 있다
    const worn = wornItemIds(a);
    if (worn.length) {
      const { results } = await c.env.DB.prepare(
        `SELECT item_id FROM inventory WHERE user_id = ? AND item_id IN (${worn.map(() => "?").join(", ")})`,
      )
        .bind(c.get("userId"), ...worn)
        .all();
      if (results.length !== worn.length) return jsonError(c, 400, "아직 갖고 있지 않은 꾸미기예요");
    }
    sets.push("avatar = ?");
    vals.push(JSON.stringify(a));
  }
  if ("nickname" in b) {
    const nickname = typeof b.nickname === "string" ? b.nickname.trim() : "";
    if (!isValidNickname(nickname)) return jsonError(c, 400, "닉네임은 2~10자로 입력해 주세요");
    sets.push("nickname = ?");
    vals.push(nickname);
  }
  if (sets.length) {
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...vals, c.get("userId"))
      .run();
  }
  return c.json({ ok: true });
});

profile.post("/api/me/password", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  const current = typeof b?.current === "string" ? b.current : "";
  const next = typeof b?.next === "string" ? b.next : "";
  const userId = c.get("userId");
  const u = await c.env.DB.prepare("SELECT password_hash, locked_until FROM users WHERE id = ?").bind(userId).first<{ password_hash: string; locked_until: number | null }>();
  if (!u) return jsonError(c, 401, "로그인이 필요해요");
  if (isPasswordless(u.password_hash)) return jsonError(c, 400, KAKAO_ONLY_MSG);
  if (isLocked(u)) return jsonError(c, 423, LOCKED_MSG);
  if (!(await verifyPassword(current, u.password_hash))) {
    await recordFailure(c.env, userId);
    return jsonError(c, 400, "지금 비밀번호가 맞지 않아요");
  }
  await resetFailures(c.env, userId);
  if (!isValidPasswordLength(next)) return jsonError(c, 400, PASSWORD_LENGTH_MSG);
  const keep = await hashToken(getCookie(c, COOKIE) ?? "");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), userId),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(userId, keep),
  ]);
  return c.json({ ok: true });
});

// 탈퇴: 사진 파일부터 지우고, 사는 빌라 모두에서 나간 뒤(방장 승계), 내 기록을 모두 지운다
profile.delete("/api/me", requireUser, async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare("SELECT id, r2_key FROM certs WHERE user_id = ?").bind(userId).all<{ id: string; r2_key: string | null }>();
  await deletePhotoBlobs(c.env, results);
  // 사는 빌라 모두에서 나간다 (빌라마다 방장 승계 · 해체)
  await leaveAllVillas(c.env, userId);
  const q = (sql: string) => c.env.DB.prepare(sql).bind(userId);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM reports WHERE reporter_id = ? OR cert_id IN (SELECT id FROM certs WHERE user_id = ?)").bind(userId, userId),
    ...cheerCleanupForUser(c.env, userId),
    q("DELETE FROM cert_villas WHERE cert_id IN (SELECT id FROM certs WHERE user_id = ?)"),
    q("DELETE FROM certs WHERE user_id = ?"),
    q("DELETE FROM inventory WHERE user_id = ?"),
    q("DELETE FROM placements WHERE user_id = ?"),
    q("DELETE FROM sessions WHERE user_id = ?"),
    q("DELETE FROM user_identities WHERE user_id = ?"),
    q("DELETE FROM recovery_requests WHERE user_id = ?"),
    q("DELETE FROM events WHERE user_id = ?"),
    q("DELETE FROM villa_bans WHERE user_id = ?"),
    q("DELETE FROM villa_applications WHERE user_id = ?"),
    q("DELETE FROM memberships WHERE user_id = ?"),
    q("DELETE FROM users WHERE id = ?"),
  ]);
  deleteCookie(c, COOKIE, { path: "/", secure: true });
  return c.json({ ok: true });
});
