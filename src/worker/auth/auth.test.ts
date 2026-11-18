import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { hashPassword, verifyPassword } from "./password";

let n = 0;
const uname = () => `user${Date.now().toString(36)}${n++}`.slice(0, 16);
const post = (path: string, body: unknown, cookie?: string) =>
  app.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    },
    env,
  );
const valid = (username = uname()) => ({
  username,
  password: "password1",
  nickname: "운동러",
  over14: true,
  agree: true,
});

afterEach(() => setNow(null));

describe("signup", () => {
  it("signup_rejects_bad_username", async () => {
    for (const username of ["AB", "has space", "a".repeat(17)]) {
      expect((await post("/api/signup", valid(username))).status).toBe(400);
    }
  });

  it("signup_requires_over14_and_agree", async () => {
    expect((await post("/api/signup", { ...valid(), over14: false })).status).toBe(400);
    expect((await post("/api/signup", { ...valid(), agree: false })).status).toBe(400);
  });

  it("signup_rejects_duplicate_username", async () => {
    const body = valid();
    expect((await post("/api/signup", body)).status).toBe(201);
    const res = await post("/api/signup", body);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "이미 쓰고 있는 아이디예요" });
  });

  it("signup_returns_recovery_code_once", async () => {
    const body = valid();
    const res = await post("/api/signup", body);
    expect(res.status).toBe(201);
    const { recoveryCode } = (await res.json()) as { recoveryCode: string };
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(res.headers.get("set-cookie")).toMatch(/sid=.*HttpOnly.*Secure.*SameSite=Lax/i);
    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(body.username).first<Record<string, unknown>>();
    expect(row!.recovery_hash).not.toBe(recoveryCode);
    expect(row!.recovery_hash).not.toContain(recoveryCode.replaceAll("-", ""));
    const cols = Object.keys(row!);
    expect(cols).not.toContain("email");
    expect(cols).not.toContain("phone");
  });
});

describe("login / me", () => {
  it("login_locks_after_5_failures", async () => {
    let t = 1_700_000_000_000;
    setNow(() => t);
    const body = valid();
    await post("/api/signup", body);
    for (let i = 0; i < 5; i++) {
      const r = await post("/api/login", { username: body.username, password: "wrongpass1" });
      expect(r.status).toBe(401);
    }
    const locked = await post("/api/login", { username: body.username, password: body.password });
    expect(locked.status).toBe(423);
    expect(await locked.json()).toEqual({ error: "로그인을 5번 실패해서 15분 동안 잠겼어요" });
    t += 15 * 60 * 1000 + 1;
    expect((await post("/api/login", { username: body.username, password: body.password })).status).toBe(200);
  });

  it("login_same_401_for_unknown_user", async () => {
    const res = await post("/api/login", { username: "nobodyhere", password: "whatever12" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "아이디 또는 비밀번호가 맞지 않아요" });
  });

  it("me_requires_session", async () => {
    expect((await app.request("/api/me", {}, env)).status).toBe(401);
  });

  it("me_returns_profile_and_logout_ends_session", async () => {
    const body = valid();
    const res = await post("/api/signup", body);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const me = await app.request("/api/me", { headers: { cookie } }, env);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      username: body.username, nickname: "운동러", sport: null, avatar: {}, points: 0, streak: 0, villaId: null,
    });
    expect((await post("/api/logout", {}, cookie)).status).toBe(200);
    expect((await app.request("/api/me", { headers: { cookie } }, env)).status).toBe(401);
  });
});

const wrong = (username: string) => post("/api/login", { username, password: "wrongpass1" });
const failsOf = async (username: string) =>
  (await env.DB.prepare("SELECT failed_logins f, locked_until l FROM users WHERE username = ?").bind(username).first<{ f: number; l: number | null }>())!;

describe("lockout and session edges", () => {
  it("concurrent_failures_still_lock", async () => {
    const body = valid();
    await post("/api/signup", body);
    await Promise.all(Array.from({ length: 8 }, () => wrong(body.username)));
    expect((await failsOf(body.username)).f).toBeGreaterThanOrEqual(5);
    const res = await post("/api/login", { username: body.username, password: body.password });
    expect(res.status).toBe(423);
  });

  it("success_resets_failed_logins", async () => {
    const body = valid();
    await post("/api/signup", body);
    await wrong(body.username);
    await wrong(body.username);
    expect((await failsOf(body.username)).f).toBe(2);
    expect((await post("/api/login", { username: body.username, password: body.password })).status).toBe(200);
    expect(await failsOf(body.username)).toEqual({ f: 0, l: null });
  });

  it("first_failure_after_expired_lock_counts_as_1", async () => {
    let t = 1_700_000_000_000;
    setNow(() => t);
    const body = valid();
    await post("/api/signup", body);
    for (let i = 0; i < 5; i++) await wrong(body.username);
    t += 15 * 60 * 1000 + 1;
    expect((await wrong(body.username)).status).toBe(401);
    expect(await failsOf(body.username)).toEqual({ f: 1, l: null });
    for (let i = 0; i < 3; i++) await wrong(body.username);
    expect((await post("/api/login", { username: body.username, password: body.password })).status).toBe(200);
  });

  it("expired_session_is_rejected", async () => {
    let t = 1_700_000_000_000;
    setNow(() => t);
    const res = await post("/api/signup", valid());
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect((await app.request("/api/me", { headers: { cookie } }, env)).status).toBe(200);
    t += 30 * 24 * 60 * 60 * 1000 + 1;
    expect((await app.request("/api/me", { headers: { cookie } }, env)).status).toBe(401);
  });

  it("hash_format_and_legacy_iterations_verify", async () => {
    expect(await hashPassword("password1")).toMatch(/^pbkdf2\$100000\$/);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("password1"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1000 }, key, 256);
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const stored = `pbkdf2$1000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
    expect(await verifyPassword("password1", stored)).toBe(true);
    expect(await verifyPassword("password2", stored)).toBe(false);
  });
});
