import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError } from "../http";
import { hashToken } from "../recovery/codes";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE = "sid";

export async function createSession(env: Env, userId: string): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashToken(token), userId, now() + SESSION_MS)
    .run();
  return token;
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_MS / 1000,
  });
}

export async function endSession(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  deleteCookie(c, COOKIE, { path: "/", secure: true });
}

/** 로그인했으면 사용자 id, 아니면 null (로그인 없이도 열리는 화면용) */
export async function sessionUserId(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, COOKIE);
  const row = token
    ? await c.env.DB.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
        .bind(await hashToken(token), now())
        .first<{ user_id: string }>()
    : null;
  return row?.user_id ?? null;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = await sessionUserId(c);
  if (!userId) return jsonError(c, 401, "로그인이 필요해요");
  c.set("userId", userId);
  await next();
};
