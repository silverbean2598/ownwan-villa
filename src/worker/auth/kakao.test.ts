import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MAX_LIVE_STATES, safeInternalPath } from "./kakao";
import { settleThrough } from "../cron/settle";
import { hashToken } from "../recovery/codes";

// 카카오 키가 있는 환경 (테스트 기본 env 에는 키가 없다 = "준비 중")
const kenv = { ...env, KAKAO_REST_API_KEY: "rest-key", KAKAO_CLIENT_SECRET: "client-secret" };
const ORIGIN = "https://ownwan-villa.silverbin2598.workers.dev";

let n = 0;
const uname = () => `kk${Date.now().toString(36)}${n++}`.slice(0, 16);
let kakaoSeq = 1_000_000_000 + Math.floor(Math.random() * 1e6) * 1000;
const newKakaoId = () => ++kakaoSeq;

const cookiesOf = (res: Response) => res.headers.getSetCookie();
const cookieVal = (res: Response, name: string) => {
  const c = cookiesOf(res).find((s) => s.startsWith(`${name}=`));
  return c ? c.split(";")[0] : undefined;
};
const req = (path: string, init: RequestInit = {}, e: object = kenv) => app.request(`${ORIGIN}${path}`, init, e);

/** kauth · kapi 를 흉내 낸다. 호출 기록을 돌려준다 */
function mockKakao(kakaoId: number | null, opts: { tokenStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    if (url === "https://kauth.kakao.com/oauth/token") {
      if (opts.tokenStatus && opts.tokenStatus !== 200) return new Response("{}", { status: opts.tokenStatus });
      return Response.json({ access_token: "AT-secret", token_type: "bearer" });
    }
    if (url === "https://kapi.kakao.com/v2/user/me") return Response.json({ id: kakaoId, connected_at: "2026-11-19T00:00:00Z" });
    return new Response("unexpected", { status: 599 });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

async function signupPw() {
  const username = uname();
  const res = await req("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "password1", nickname: "운동러", over14: true, agree: true }),
  });
  expect(res.status).toBe(201);
  return { username, sid: cookieVal(res, "sid")!, id: (await userByName(username))!.id };
}
const userByName = (u: string) => env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(u).first<Record<string, string>>();

/** start → (카카오) → callback 까지. 응답과 쿠키를 돌려준다 */
async function flow(opts: { mode?: "login" | "link"; sid?: string; kakaoId: number | null; next?: string }) {
  const q = new URLSearchParams({ mode: opts.mode ?? "login", ...(opts.next ? { next: opts.next } : {}) });
  const start = await req(`/api/auth/kakao/start?${q}`, { headers: opts.sid ? { cookie: opts.sid } : {} });
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const stateCookie = cookieVal(start, "kakao_state")!;
  mockKakao(opts.kakaoId);
  const cookie = [stateCookie, opts.sid].filter(Boolean).join("; ");
  const cb = await req(`/api/auth/kakao/callback?code=CODE&state=${state}`, { headers: { cookie } });
  vi.restoreAllMocks();
  return { cb, state, stateCookie };
}

async function finish(pending: string, body: object = { nickname: "카카오러", over14: true, agree: true }) {
  return req("/api/auth/kakao/finish", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: pending },
    body: JSON.stringify(body),
  });
}

/** 카카오로 새로 가입까지 마친다 */
async function kakaoSignup(kakaoId = newKakaoId()) {
  const { cb } = await flow({ kakaoId });
  const res = await finish(cookieVal(cb, "kakao_pending")!);
  expect(res.status).toBe(201);
  const sid = cookieVal(res, "sid")!;
  const me = (await (await req("/api/me", { headers: { cookie: sid } })).json()) as { id: string; username: string };
  return { kakaoId, sid, me };
}

describe("start", () => {
  it("redirects_to_kakao_with_params_and_sets_state_cookie", async () => {
    const res = await req("/api/auth/kakao/start?mode=login");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("client_id")).toBe("rest-key");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/kakao/callback`);
    expect(loc.searchParams.get("scope")).toBeNull();
    const state = loc.searchParams.get("state")!;
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    const set = cookiesOf(res).find((s) => s.startsWith("kakao_state="))!;
    expect(set).toContain(`kakao_state=${state}`);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\/api\/auth\/kakao/);
    expect(set).toMatch(/Max-Age=600/);
    // 원문 state 는 DB 에 남기지 않는다
    expect(await env.DB.prepare("SELECT 1 FROM oauth_states WHERE state_hash = ?").bind(state).first()).toBeNull();
    // 키는 응답에 섞이지 않는다
    expect(res.headers.get("location")).not.toContain("client-secret");
  });

  it("uses_redirect_uri_override", async () => {
    const res = await req("/api/auth/kakao/start", {}, { ...kenv, KAKAO_REDIRECT_URI: "https://x.example/cb" });
    expect(new URL(res.headers.get("location")!).searchParams.get("redirect_uri")).toBe("https://x.example/cb");
  });

  it("link_mode_requires_login", async () => {
    const res = await req("/api/auth/kakao/start?mode=link");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=/settings");
  });

  it("next_accepts_internal_paths_only", () => {
    expect(safeInternalPath("/join/abc")).toBe("/join/abc");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "/a b", "", null, "/" + "a".repeat(300)])
      expect(safeInternalPath(bad)).toBeNull();
  });
});

describe("callback state", () => {
  it("rejects_missing_or_mismatched_state", async () => {
    const start = await req("/api/auth/kakao/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = cookieVal(start, "kakao_state")!;
    const calls = mockKakao(newKakaoId());
    for (const [q, ck] of [
      [`code=C`, cookie], // state 없음
      [`code=C&state=${state}`, ""], // 쿠키 없음
      [`code=C&state=${"0".repeat(64)}`, cookie], // 다름
      [`code=C&state=${"0".repeat(64)}`, "kakao_state=" + "0".repeat(64)], // 쿠키와 같지만 서버가 만든 게 아님
    ]) {
      const res = await req(`/api/auth/kakao/callback?${q}`, { headers: ck ? { cookie: ck } : {} });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login?kakao=state");
    }
    expect(calls).toHaveLength(0);
  });

  it("state_is_single_use", async () => {
    const kakaoId = newKakaoId();
    const { cb, state, stateCookie } = await flow({ kakaoId });
    expect(cb.headers.get("location")).toBe("/kakao/nickname");
    const calls = mockKakao(kakaoId);
    const again = await req(`/api/auth/kakao/callback?code=CODE&state=${state}`, { headers: { cookie: stateCookie } });
    expect(again.headers.get("location")).toBe("/login?kakao=state");
    expect(calls).toHaveLength(0);
  });

  it("expired_state_is_rejected", async () => {
    const start = await req("/api/auth/kakao/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    await env.DB.prepare("UPDATE oauth_states SET expires_at = 1").run();
    mockKakao(newKakaoId());
    const res = await req(`/api/auth/kakao/callback?code=C&state=${state}`, { headers: { cookie: cookieVal(start, "kakao_state")! } });
    expect(res.headers.get("location")).toBe("/login?kakao=state");
  });

  it("user_cancel_and_kakao_failure_are_friendly", async () => {
    const start = await req("/api/auth/kakao/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const res = await req(`/api/auth/kakao/callback?error=access_denied&state=${state}`, { headers: { cookie: cookieVal(start, "kakao_state")! } });
    expect(res.headers.get("location")).toBe("/login?kakao=cancelled");

    const s2 = await req("/api/auth/kakao/start");
    const st2 = new URL(s2.headers.get("location")!).searchParams.get("state")!;
    mockKakao(1, { tokenStatus: 400 });
    const r2 = await req(`/api/auth/kakao/callback?code=C&state=${st2}`, { headers: { cookie: cookieVal(s2, "kakao_state")! } });
    expect(r2.headers.get("location")).toBe("/login?kakao=failed");
  });

  it("sends_token_request_with_secret_and_reads_only_id", async () => {
    const start = await req("/api/auth/kakao/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const calls = mockKakao(newKakaoId());
    await req(`/api/auth/kakao/callback?code=THECODE&state=${state}`, { headers: { cookie: cookieVal(start, "kakao_state")! } });
    expect(calls.map((c) => c.url)).toEqual(["https://kauth.kakao.com/oauth/token", "https://kapi.kakao.com/v2/user/me"]);
    const form = new URLSearchParams(String(calls[0].init!.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      client_id: "rest-key",
      client_secret: "client-secret",
      redirect_uri: `${ORIGIN}/api/auth/kakao/callback`,
      code: "THECODE",
    });
    expect(new Headers(calls[1].init!.headers).get("authorization")).toBe("Bearer AT-secret");
  });
});

describe("kakao signup / login", () => {
  it("unknown_id_goes_pending_then_nickname_creates_account_and_session", async () => {
    const kakaoId = newKakaoId();
    const { cb } = await flow({ kakaoId, next: "/join/tok123" });
    expect(cb.headers.get("location")).toBe("/kakao/nickname");
    expect(cookieVal(cb, "sid")).toBeUndefined();
    const pending = cookieVal(cb, "kakao_pending")!;
    expect(cookiesOf(cb).find((s) => s.startsWith("kakao_pending="))).toMatch(/HttpOnly.*Secure.*SameSite=Lax/i);

    // 닉네임 규칙은 일반 가입과 같다. 실패해도 토큰은 남는다
    expect((await finish(pending, { nickname: "a", over14: true, agree: true })).status).toBe(400);
    expect((await finish(pending, { nickname: "카카오러", over14: false, agree: true })).status).toBe(400);

    const res = await finish(pending);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ next: "/join/tok123" });
    const sid = cookieVal(res, "sid")!;
    const me = await req("/api/me", { headers: { cookie: sid } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { id: string; nickname: string; username: string };
    expect(body.nickname).toBe("카카오러");
    expect(body.username).toMatch(/^kakao_[0-9a-f]{20}$/);
    const ident = await env.DB.prepare("SELECT * FROM user_identities WHERE provider = 'kakao' AND provider_user_id = ?")
      .bind(String(kakaoId))
      .first<{ user_id: string }>();
    expect(ident!.user_id).toBe(body.id);
    // 카카오 계정은 복구 코드가 없다
    const st = await req("/api/auth/kakao/status", { headers: { cookie: sid } });
    expect(await st.json()).toEqual({ configured: true, linked: true, hasPassword: false });

    // 같은 토큰을 다시 쓸 수 없다
    const again = await finish(pending);
    expect(again.status).toBe(410);
  });

  it("double_finish_race_with_two_pending_tokens_keeps_one_account", async () => {
    const kakaoId = newKakaoId();
    const a = cookieVal((await flow({ kakaoId })).cb, "kakao_pending")!;
    const b = cookieVal((await flow({ kakaoId })).cb, "kakao_pending")!;
    const [ra, rb] = await Promise.all([finish(a), finish(b)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 201]);
    const { results } = await env.DB.prepare("SELECT user_id FROM user_identities WHERE provider_user_id = ?").bind(String(kakaoId)).all();
    expect(results).toHaveLength(1);
    const users = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE nickname = '카카오러' AND id = ?").bind(results[0].user_id).first<{ n: number }>();
    expect(users!.n).toBe(1);
    // 둘 다 같은 계정으로 로그인된다
    const idOf = async (r: Response) => ((await (await req("/api/me", { headers: { cookie: cookieVal(r, "sid")! } })).json()) as { id: string }).id;
    expect(await idOf(ra)).toBe(await idOf(rb));
  });

  it("expired_pending_is_rejected", async () => {
    const { cb } = await flow({ kakaoId: newKakaoId() });
    await env.DB.prepare("UPDATE kakao_pending SET expires_at = 1").run();
    expect((await finish(cookieVal(cb, "kakao_pending")!)).status).toBe(410);
    expect((await finish("")).status).toBe(410);
  });

  it("known_id_logs_in_with_new_session", async () => {
    const { kakaoId, me } = await kakaoSignup();
    const { cb } = await flow({ kakaoId, sid: "sid=stale-token", next: "/certify" });
    expect(cb.headers.get("location")).toBe("/certify");
    const sid = cookieVal(cb, "sid")!;
    expect(sid).not.toBe("sid=stale-token");
    const r = (await (await req("/api/me", { headers: { cookie: sid } })).json()) as { id: string };
    expect(r.id).toBe(me.id);
    // next 없으면 빌라로
    const { cb: cb2 } = await flow({ kakaoId });
    expect(cb2.headers.get("location")).toBe("/villa");
  });

  it("login_does_not_follow_external_next", async () => {
    const { kakaoId } = await kakaoSignup();
    const { cb } = await flow({ kakaoId, next: "//evil.com" });
    expect(cb.headers.get("location")).toBe("/villa");
  });

  it("password_login_and_recovery_fail_for_kakao_only", async () => {
    const { me, sid } = await kakaoSignup();
    const row = (await userByName(me.username))!;
    expect(row.password_hash).toBe("!kakao-only");
    for (const password of ["!kakao-only", "", "password1"]) {
      const res = await req("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: me.username, password }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "카카오로 가입한 계정이에요. 카카오로 로그인하면 돼요" });
    }
    expect((await userByName(me.username))!.failed_logins).toBe(0);
    const post = (path: string, body: object, cookie?: string) =>
      req(path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const rc = await post("/api/recover/code", { username: me.username, code: "!kakao-only", newPassword: "password1" });
    expect(rc.status).toBe(400);
    expect(((await rc.json()) as { error: string }).error).toContain("카카오로 로그인하면 돼요");
    expect((await post("/api/recover/request", { username: me.username })).status).toBe(400);
    expect((await post("/api/recovery-code/reissue", {}, sid)).status).toBe(400);
    expect((await post("/api/me/password", { current: "!kakao-only", next: "password2" }, sid)).status).toBe(400);
  });
});

describe("link / unlink", () => {
  it("links_kakao_to_password_account_then_kakao_login_works", async () => {
    const u = await signupPw();
    const kakaoId = newKakaoId();
    const { cb } = await flow({ mode: "link", sid: u.sid, kakaoId });
    expect(cb.headers.get("location")).toBe("/settings?kakao=linked#kakao");
    expect(await (await req("/api/auth/kakao/status", { headers: { cookie: u.sid } })).json()).toEqual({
      configured: true, linked: true, hasPassword: true,
    });
    const { cb: login } = await flow({ kakaoId });
    const me = (await (await req("/api/me", { headers: { cookie: cookieVal(login, "sid")! } })).json()) as { id: string };
    expect(me.id).toBe(u.id);
  });

  it("already_linked_elsewhere_fails_friendly", async () => {
    const { kakaoId } = await kakaoSignup();
    const u = await signupPw();
    const { cb } = await flow({ mode: "link", sid: u.sid, kakaoId });
    expect(cb.headers.get("location")).toBe("/settings?kakao=linked_other#kakao");
    expect(await env.DB.prepare("SELECT 1 FROM user_identities WHERE user_id = ?").bind(u.id).first()).toBeNull();
  });

  it("second_kakao_on_same_account_fails", async () => {
    const u = await signupPw();
    await flow({ mode: "link", sid: u.sid, kakaoId: newKakaoId() });
    const { cb } = await flow({ mode: "link", sid: u.sid, kakaoId: newKakaoId() });
    expect(cb.headers.get("location")).toBe("/settings?kakao=already_has#kakao");
  });

  it("link_callback_with_different_session_is_rejected", async () => {
    const a = await signupPw();
    const b = await signupPw();
    const start = await req("/api/auth/kakao/start?mode=link", { headers: { cookie: a.sid } });
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    mockKakao(newKakaoId());
    const cb = await req(`/api/auth/kakao/callback?code=C&state=${state}`, {
      headers: { cookie: `${cookieVal(start, "kakao_state")}; ${b.sid}` },
    });
    expect(cb.headers.get("location")).toBe("/settings?kakao=link_mismatch#kakao");
    expect(await env.DB.prepare("SELECT 1 FROM user_identities WHERE user_id IN (?, ?)").bind(a.id, b.id).first()).toBeNull();
  });

  it("unlink_works_with_password_and_is_blocked_for_kakao_only", async () => {
    const u = await signupPw();
    await flow({ mode: "link", sid: u.sid, kakaoId: newKakaoId() });
    const del = await req("/api/auth/kakao/link", { method: "DELETE", headers: { cookie: u.sid } });
    expect(del.status).toBe(200);
    expect((await (await req("/api/auth/kakao/status", { headers: { cookie: u.sid } })).json()) as object).toMatchObject({ linked: false });

    const k = await kakaoSignup();
    const blocked = await req("/api/auth/kakao/link", { method: "DELETE", headers: { cookie: k.sid } });
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toEqual({ error: "카카오로만 로그인하는 계정이라 연결을 해제할 수 없어요" });
    expect(await env.DB.prepare("SELECT 1 FROM user_identities WHERE user_id = ?").bind(k.me.id).first()).not.toBeNull();
  });
});

describe("deletion and missing secrets", () => {
  it("account_deletion_removes_identity_and_kakao_can_sign_up_again", async () => {
    const { kakaoId, sid, me } = await kakaoSignup();
    expect((await req("/api/me", { method: "DELETE", headers: { cookie: sid } })).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM user_identities WHERE user_id = ?").bind(me.id).first()).toBeNull();
    const { cb } = await flow({ kakaoId });
    expect(cb.headers.get("location")).toBe("/kakao/nickname");
  });

  it("missing_secrets_are_friendly_not_crash", async () => {
    const calls = mockKakao(1);
    const start = await req("/api/auth/kakao/start?mode=login", {}, env);
    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toBe("/login?kakao=unconfigured");
    const half = await req("/api/auth/kakao/start", {}, { ...env, KAKAO_REST_API_KEY: "only-key" });
    expect(half.headers.get("location")).toBe("/login?kakao=unconfigured");
    const cb = await req("/api/auth/kakao/callback?code=C&state=x", { headers: { cookie: "kakao_state=x" } }, env);
    expect(cb.headers.get("location")).toBe("/login?kakao=unconfigured");
    expect(calls).toHaveLength(0);
    const u = await signupPw();
    const linkStart = await req("/api/auth/kakao/start?mode=link", { headers: { cookie: u.sid } }, env);
    expect(linkStart.headers.get("location")).toBe("/settings?kakao=unconfigured#kakao");
    const st = await req("/api/auth/kakao/status", { headers: { cookie: u.sid } }, env);
    expect(await st.json()).toEqual({ configured: false, linked: false, hasPassword: true });
  });
});

describe("review fixes", () => {
  it("start_refuses_when_too_many_live_states", async () => {
    await env.DB.prepare("DELETE FROM oauth_states").run();
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO oauth_states (state_hash, mode, expires_at) SELECT 'fill' || i, 'login', ? FROM n`,
    ).bind(MAX_LIVE_STATES, Date.now() + 600_000).run();
    const res = await req("/api/auth/kakao/start");
    expect(res.headers.get("location")).toBe("/login?kakao=busy");
    expect(cookieVal(res, "kakao_state")).toBeUndefined();
    // 만료된 행은 세지 않는다
    await env.DB.prepare("UPDATE oauth_states SET expires_at = 1 WHERE state_hash LIKE 'fill%'").run();
    const ok = await req("/api/auth/kakao/start");
    expect(new URL(ok.headers.get("location")!).origin).toBe("https://kauth.kakao.com");
    expect(await env.DB.prepare("SELECT 1 FROM oauth_states WHERE state_hash LIKE 'fill%'").first()).toBeNull();
  });

  it("daily_cron_purges_expired_kakao_rows", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO oauth_states (state_hash, mode, expires_at) VALUES ('old-s', 'login', 1), ('live-s', 'login', ?)").bind(Date.now() + 600_000),
      env.DB.prepare("INSERT INTO kakao_pending (token_hash, kakao_id, expires_at) VALUES ('old-p', '1', 1), ('live-p', '2', ?)").bind(Date.now() + 600_000),
    ]);
    await settleThrough(env, "2000-01-01");
    const left = async (sql: string) => (await env.DB.prepare(sql).all<{ k: string }>()).results.map((r) => r.k);
    expect(await left("SELECT state_hash AS k FROM oauth_states WHERE state_hash IN ('old-s','live-s')")).toEqual(["live-s"]);
    expect(await left("SELECT token_hash AS k FROM kakao_pending WHERE token_hash IN ('old-p','live-p')")).toEqual(["live-p"]);
  });

  it("recover_complete_is_blocked_for_kakao_only", async () => {
    const { me } = await kakaoSignup();
    const ticket = "ABCD-EFGH-JKMN-PQRS";
    await env.DB.prepare(
      `INSERT INTO recovery_requests (id, user_id, approver_id, ticket_hash, status, approved_at, created_at)
       VALUES (?, ?, 'x', ?, 'approved', 1, 1)`,
    ).bind(crypto.randomUUID(), me.id, await hashToken(ticket)).run();
    const res = await req("/api/recover/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: me.username, ticket, newPassword: "password1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "카카오로 가입한 계정이에요. 카카오로 로그인하면 돼요" });
    expect((await userByName(me.username))!.password_hash).toBe("!kakao-only");
  });

  it("callback_redirects_are_no_store_and_no_referrer", async () => {
    const { cb } = await flow({ kakaoId: newKakaoId() });
    expect(cb.headers.get("cache-control")).toBe("no-store");
    expect(cb.headers.get("referrer-policy")).toBe("no-referrer");
    const bad = await req("/api/auth/kakao/callback?code=C&state=x", { headers: { cookie: "kakao_state=y" } });
    expect(bad.headers.get("cache-control")).toBe("no-store");
    expect(bad.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("kakao_failure_logs_status_and_error_code_only_with_timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const start = await req("/api/auth/kakao/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return Response.json({ error: "invalid_client", error_code: "KOE010" }, { status: 401 });
    });
    const res = await req(`/api/auth/kakao/callback?code=SECRETCODE&state=${state}`, { headers: { cookie: cookieVal(start, "kakao_state")! } });
    expect(res.headers.get("location")).toBe("/login?kakao=failed");
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    const logged = warn.mock.calls.map((a) => a.join(" ")).join("\n");
    expect(logged).toContain("status=401");
    expect(logged).toContain("error_code=KOE010");
    expect(logged).not.toContain("SECRETCODE");
    expect(logged).not.toContain("client-secret");
  });
});
