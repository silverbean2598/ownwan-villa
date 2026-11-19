import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Env } from "../env";
import { now } from "../clock";
import { jsonError } from "../http";
import { hashToken } from "../recovery/codes";
import { isValidNickname } from "../../shared/nickname";
import { COOKIE, createSession, requireUser, sessionUserId, setSessionCookie } from "./session";
import { NO_PASSWORD, isPasswordless } from "./identity";

// 카카오 로그인 · 가입 · 계정 연결 [확정 — 기획자 결정, 2026-11-19]
// 카카오에서는 회원번호(id)만 쓴다. 동의 항목(scope)을 요청하지 않고, 카카오 토큰은 저장하지 않는다.
export const kakao = new Hono<AppEnv>();

const PROVIDER = "kakao";
const TTL_MS = 10 * 60 * 1000;
const STATE_COOKIE = "kakao_state";
const PENDING_COOKIE = "kakao_pending";
const COOKIE_PATH = "/api/auth/kakao";
export const KAKAO_NOT_READY = "카카오 로그인을 준비 중이에요";

const AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const ME_URL = "https://kapi.kakao.com/v2/user/me";
const KAKAO_TIMEOUT_MS = 8000;
/** 살아 있는 state 가 이만큼 넘으면 새로 만들지 않는다 (로그인 없이 부를 수 있는 /start 반복으로 표가 끝없이 커지지 않게) */
export const MAX_LIVE_STATES = 5000;

type Mode = "login" | "link";

export function kakaoConfigured(env: Env): boolean {
  return !!env.KAKAO_REST_API_KEY && !!env.KAKAO_CLIENT_SECRET;
}

/** 운영: https://ownwan-villa.silverbin2598.workers.dev/api/auth/kakao/callback (요청 주소에서 만든다). KAKAO_REDIRECT_URI 가 있으면 그것을 쓴다 */
export function redirectUri(c: Context<AppEnv>): string {
  return c.env.KAKAO_REDIRECT_URI || `${new URL(c.req.url).origin}${COOKIE_PATH}/callback`;
}

/** 같은 사이트 안의 경로만 받는다 ("/"로 시작, "//" · "/\" 불가). 아니면 null */
export function safeInternalPath(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 200) return null;
  return /^\/(?![/\\])/.test(v) && !/[\\\s]/.test(v) ? v : null;
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 길이가 같으면 끝까지 비교한다 (state 비교용) */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function setShortCookie(c: Context<AppEnv>, name: string, value: string) {
  setCookie(c, name, value, { httpOnly: true, secure: true, sameSite: "Lax", path: COOKIE_PATH, maxAge: TTL_MS / 1000 });
}

/** 콜백 응답은 저장하지 않고, 이동할 때 주소(code · state)를 Referer 로 넘기지 않는다 */
function redirectNoStore(c: Context<AppEnv>, location: string) {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(location, 302);
}

/** 실패하면 화면으로 돌려보내며 이유 코드를 붙인다 (문구는 화면이 정한다) */
function fail(c: Context<AppEnv>, mode: Mode, code: string) {
  return redirectNoStore(c, mode === "link" ? `/settings?kakao=${code}#kakao` : `/login?kakao=${code}`);
}

/** 만료된 state · 가입 대기 행을 지운다 (/start · 콜백 때, 그리고 매일 크론에서) */
export async function purgeExpiredKakao(env: Env): Promise<void> {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM kakao_pending WHERE expires_at <= ?").bind(t),
  ]);
}

/** 로그인 세션 발급: 들고 온 세션은 지우고 새로 만든다 (세션 고정 방지) */
async function logIn(c: Context<AppEnv>, userId: string) {
  const old = getCookie(c, COOKIE);
  if (old) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(old)).run();
  // 본인이 카카오로 들어왔으니 진행 중인 방장 확인 요청은 취소한다 (비밀번호 로그인과 같게)
  await c.env.DB.prepare(
    "UPDATE recovery_requests SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending','approved')",
  )
    .bind(userId)
    .run();
  setSessionCookie(c, await createSession(c.env, userId));
}

async function userIdForKakao(env: Env, kakaoId: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT user_id FROM user_identities WHERE provider = ? AND provider_user_id = ?")
    .bind(PROVIDER, kakaoId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** 실패 원인을 Workers Logs 에 남긴다: HTTP 상태와 카카오 error_code 만 (토큰 · 인가 코드는 절대 남기지 않는다) */
async function warnKakao(step: string, res: Response) {
  let errorCode: unknown = null;
  try {
    const b = (await res.json()) as { error_code?: unknown; code?: unknown };
    errorCode = b.error_code ?? b.code ?? null;
  } catch {}
  const safe = typeof errorCode === "string" || typeof errorCode === "number" ? String(errorCode).slice(0, 40) : "-";
  console.warn(`kakao ${step} failed: status=${res.status} error_code=${safe}`);
}

/** 인가 코드 → 액세스 토큰 → 회원번호. 토큰은 이 함수 밖으로 내보내지 않는다. 실패하면 null */
async function fetchKakaoId(c: Context<AppEnv>, code: string): Promise<string | null> {
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: c.env.KAKAO_REST_API_KEY!,
        client_secret: c.env.KAKAO_CLIENT_SECRET!,
        redirect_uri: redirectUri(c),
        code,
      }),
    });
    if (!tokenRes.ok) {
      await warnKakao("token", tokenRes);
      return null;
    }
    const token = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) return null;
    const meRes = await fetch(ME_URL, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS) });
    if (!meRes.ok) {
      await warnKakao("user/me", meRes);
      return null;
    }
    const id = ((await meRes.json()) as { id?: unknown }).id;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : null;
  } catch (e) {
    // 시간 초과 · 네트워크 오류: 오류 이름만 남긴다
    console.warn(`kakao request failed: ${e instanceof Error ? e.name : "unknown"}`);
    return null;
  }
}

// GET /api/auth/kakao/start?mode=login|link[&next=/경로]
kakao.get(`${COOKIE_PATH}/start`, async (c) => {
  const mode: Mode = c.req.query("mode") === "link" ? "link" : "login";
  if (!kakaoConfigured(c.env)) return fail(c, mode, "unconfigured");
  let userId: string | null = null;
  if (mode === "link") {
    userId = await sessionUserId(c);
    if (!userId) return c.redirect("/login?next=/settings", 302);
  }
  const next = mode === "link" ? "/settings" : safeInternalPath(c.req.query("next"));
  const state = randomToken();
  const t = now();
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(t).run();
  const live = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM oauth_states").first<{ n: number }>();
  if ((live?.n ?? 0) >= MAX_LIVE_STATES) return fail(c, mode, "busy");
  await c.env.DB.prepare("INSERT INTO oauth_states (state_hash, mode, user_id, next, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await hashToken(state), mode, userId, next, t + TTL_MS)
    .run();
  setShortCookie(c, STATE_COOKIE, state);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.env.KAKAO_REST_API_KEY!);
  url.searchParams.set("redirect_uri", redirectUri(c));
  url.searchParams.set("state", state);
  return c.redirect(url.toString(), 302);
});

// GET /api/auth/kakao/callback?code=..&state=..  (카카오가 돌려보내는 곳)
kakao.get(`${COOKIE_PATH}/callback`, async (c) => {
  const cookieState = getCookie(c, STATE_COOKIE) ?? "";
  deleteCookie(c, STATE_COOKIE, { path: COOKIE_PATH, secure: true });
  if (!kakaoConfigured(c.env)) return fail(c, "login", "unconfigured");

  const state = c.req.query("state") ?? "";
  if (!state || !cookieState || !safeEqual(state, cookieState)) return fail(c, "login", "state");
  // 한 번만 쓴다: 지우면서 읽는다
  const row = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? RETURNING mode, user_id, next, expires_at",
  )
    .bind(await hashToken(state))
    .first<{ mode: Mode; user_id: string | null; next: string | null; expires_at: number }>();
  if (!row || row.expires_at <= now()) return fail(c, "login", "state");
  const mode = row.mode;

  if (c.req.query("error")) return fail(c, mode, "cancelled");
  const code = c.req.query("code");
  if (!code) return fail(c, mode, "failed");
  const kakaoId = await fetchKakaoId(c, code);
  if (!kakaoId) return fail(c, mode, "failed");
  const owner = await userIdForKakao(c.env, kakaoId);

  if (mode === "link") {
    // 시작한 사람과 지금 로그인한 사람이 같아야 한다
    const me = await sessionUserId(c);
    if (!me || me !== row.user_id) return fail(c, "link", "link_mismatch");
    if (owner === me) return fail(c, "link", "linked");
    if (owner) return fail(c, "link", "linked_other");
    try {
      await c.env.DB.prepare("INSERT INTO user_identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(PROVIDER, kakaoId, me, now())
        .run();
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
      // 동시에 다른 계정이 먼저 연결했거나, 내 계정에 이미 다른 카카오 계정이 연결돼 있다
      const again = await userIdForKakao(c.env, kakaoId);
      return fail(c, "link", again && again !== me ? "linked_other" : "already_has");
    }
    return fail(c, "link", "linked");
  }

  if (owner) {
    await logIn(c, owner);
    return redirectNoStore(c, row.next ?? "/villa");
  }

  // 처음 온 카카오 회원번호 → 닉네임 정하기 (회원번호만 10분 동안 들고 있는다)
  const token = randomToken();
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM kakao_pending WHERE expires_at <= ?").bind(t),
    c.env.DB.prepare("INSERT INTO kakao_pending (token_hash, kakao_id, next, expires_at) VALUES (?, ?, ?, ?)").bind(
      await hashToken(token), kakaoId, row.next, t + TTL_MS,
    ),
  ]);
  setShortCookie(c, PENDING_COOKIE, token);
  return redirectNoStore(c, "/kakao/nickname");
});

// POST /api/auth/kakao/finish { nickname, over14, agree } → 계정 만들기 + 로그인
kakao.post(`${COOKIE_PATH}/finish`, async (c) => {
  const b = await c.req.json().catch(() => null);
  const nickname = typeof b?.nickname === "string" ? b.nickname.trim() : "";
  if (!isValidNickname(nickname)) return jsonError(c, 400, "닉네임은 2~10자로 입력해 주세요");
  if (b?.over14 !== true) return jsonError(c, 400, "만 14세 이상만 가입할 수 있어요");
  if (b?.agree !== true) return jsonError(c, 400, "이용약관과 개인정보 처리방침에 동의해 주세요");

  const token = getCookie(c, PENDING_COOKIE) ?? "";
  const pending = token
    ? await c.env.DB.prepare("DELETE FROM kakao_pending WHERE token_hash = ? RETURNING kakao_id, next, expires_at")
        .bind(await hashToken(token))
        .first<{ kakao_id: string; next: string | null; expires_at: number }>()
    : null;
  deleteCookie(c, PENDING_COOKIE, { path: COOKIE_PATH, secure: true });
  if (!pending || pending.expires_at <= now()) return jsonError(c, 410, "시간이 지났어요. 카카오로 다시 시작해 주세요");
  const next = pending.next ?? "/";

  const id = crypto.randomUUID();
  const username = `kakao_${randomToken().slice(0, 20)}`;
  const t = now();
  try {
    // 한 batch = 한 트랜잭션: 회원번호가 이미 연결돼 있으면 users 도 함께 되돌린다
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO users (id, username, nickname, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, username, nickname, NO_PASSWORD, NO_PASSWORD, t),
      c.env.DB.prepare("INSERT INTO user_identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)").bind(
        PROVIDER, pending.kakao_id, id, t,
      ),
    ]);
  } catch (e) {
    if (!String(e).includes("UNIQUE")) throw e;
    // 다른 창에서 같은 카카오 계정으로 먼저 가입을 마쳤다: 그 계정으로 로그인한다 (카카오 인증은 방금 마쳤다)
    const owner = await userIdForKakao(c.env, pending.kakao_id);
    if (!owner) throw e;
    await logIn(c, owner);
    return c.json({ next, existing: true });
  }
  await logIn(c, id);
  return c.json({ next }, 201);
});

// GET /api/auth/kakao/status → 설정 화면 "카카오 연결" 상태
kakao.get(`${COOKIE_PATH}/status`, requireUser, async (c) => {
  const userId = c.get("userId");
  const u = await c.env.DB.prepare(
    `SELECT u.password_hash,
       EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = u.id AND i.provider = ?) AS linked
     FROM users u WHERE u.id = ?`,
  )
    .bind(PROVIDER, userId)
    .first<{ password_hash: string; linked: number }>();
  if (!u) return jsonError(c, 401, "로그인이 필요해요");
  return c.json({ configured: kakaoConfigured(c.env), linked: !!u.linked, hasPassword: !isPasswordless(u.password_hash) });
});

// DELETE /api/auth/kakao/link → 연결 해제 (비밀번호가 있는 계정만)
kakao.delete(`${COOKIE_PATH}/link`, requireUser, async (c) => {
  const userId = c.get("userId");
  const u = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  if (!u) return jsonError(c, 401, "로그인이 필요해요");
  if (isPasswordless(u.password_hash))
    return jsonError(c, 400, "카카오로만 로그인하는 계정이라 연결을 해제할 수 없어요");
  await c.env.DB.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = ?").bind(userId, PROVIDER).run();
  return c.json({ ok: true });
});
