import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { app } from "../index";

let n = 0;
async function signup() {
  const username = `bd${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await app.request(
    "/api/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "password1", nickname: "운동러", over14: true, agree: true }),
    },
    env,
  );
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const me = await (await app.request("/api/me", { headers: { cookie } }, env)).json<any>();
  return { cookie, id: me.id as string, username };
}
type U = Awaited<ReturnType<typeof signup>>;
const req = (path: string, method: string, cookie?: string, body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
async function makeVilla(cookie: string) {
  const r = await req("/api/villas", "POST", cookie, { name: "빌라" });
  return (await r.json<any>()).inviteToken as string;
}
const join = (cookie: string, token: string) => req(`/api/invite/${token}/join`, "POST", cookie, {});
async function photo(cookie: string, seed = 7) {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(500).fill(seed)], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", "0000000000000000");
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, env);
  return (await r.json<any>()).certId as string;
}
const count = async (sql: string, ...b: unknown[]) =>
  (await env.DB.prepare(sql).bind(...b).first<{ c: number }>())!.c;

describe("badges", () => {
  it("counts_pending_recovery_approvals_for_current_approver", async () => {
    const owner = await signup();
    const token = await makeVilla(owner.cookie);
    const a = await signup();
    const b = await signup();
    await join(a.cookie, token);
    await join(b.cookie, token);
    expect((await req("/api/recover/request", "POST", undefined, { username: a.username })).status).toBe(201);
    expect((await req("/api/recover/request", "POST", undefined, { username: b.username })).status).toBe(201);
    expect(await (await req("/api/badges", "GET", owner.cookie)).json()).toEqual({ recoveryApprovals: 2 });
    expect(await (await req("/api/badges", "GET", a.cookie)).json()).toEqual({ recoveryApprovals: 0 });
    const list = await (await req("/api/recover/pending", "GET", owner.cookie)).json<any[]>();
    await req(`/api/recover/${list[0].id}/approve`, "POST", owner.cookie);
    expect(await (await req("/api/badges", "GET", owner.cookie)).json()).toEqual({ recoveryApprovals: 1 });
  });

  it("requires_login", async () => {
    expect((await req("/api/badges", "GET")).status).toBe(401);
  });
});

describe("password change", () => {
  it("wrong_current_is_400", async () => {
    const u = await signup();
    const res = await req("/api/me/password", "POST", u.cookie, { current: "nope-nope", next: "newpassword1" });
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toBe("지금 비밀번호가 맞지 않아요");
  });

  it("short_next_is_400", async () => {
    const u = await signup();
    const res = await req("/api/me/password", "POST", u.cookie, { current: "password1", next: "short" });
    expect(res.status).toBe(400);
  });

  it("success_changes_password_and_kills_other_sessions", async () => {
    const u = await signup();
    const login = await req("/api/login", "POST", undefined, { username: u.username, password: "password1" });
    const other = login.headers.get("set-cookie")!.split(";")[0];
    expect((await req("/api/me", "GET", other)).status).toBe(200);
    const res = await req("/api/me/password", "POST", u.cookie, { current: "password1", next: "newpassword1" });
    expect(res.status).toBe(200);
    expect((await req("/api/me", "GET", u.cookie)).status).toBe(200);
    expect((await req("/api/me", "GET", other)).status).toBe(401);
    expect((await req("/api/login", "POST", undefined, { username: u.username, password: "newpassword1" })).status).toBe(200);
    expect((await req("/api/login", "POST", undefined, { username: u.username, password: "password1" })).status).toBe(401);
  });
});

describe("password change lockout", () => {
  it("locks_after_5_wrong_attempts_even_with_correct_password", async () => {
    const u = await signup();
    for (let i = 0; i < 5; i++) {
      expect((await req("/api/me/password", "POST", u.cookie, { current: "wrongwrong", next: "newpassword1" })).status).toBe(400);
    }
    const res = await req("/api/me/password", "POST", u.cookie, { current: "password1", next: "newpassword1" });
    expect(res.status).toBe(423);
  });

  it("success_resets_failure_count", async () => {
    const u = await signup();
    for (let i = 0; i < 4; i++) await req("/api/me/password", "POST", u.cookie, { current: "wrongwrong", next: "newpassword1" });
    expect((await req("/api/me/password", "POST", u.cookie, { current: "password1", next: "newpassword1" })).status).toBe(200);
    expect((await req("/api/me/password", "POST", u.cookie, { current: "wrongwrong", next: "newpassword2" })).status).toBe(400);
    expect((await req("/api/me/password", "POST", u.cookie, { current: "newpassword1", next: "newpassword2" })).status).toBe(200);
  });
});

describe("delete account", () => {
  it("deletes_many_photos_with_one_bulk_call", async () => {
    const u = await signup();
    const keys: string[] = [];
    for (let i = 0; i < 30; i++) {
      const id = await photo(u.cookie, i + 1);
      keys.push((await env.DB.prepare("SELECT r2_key FROM certs WHERE id = ?").bind(id).first<{ r2_key: string }>())!.r2_key);
    }
    const spy = vi.spyOn(env.PHOTOS, "delete");
    const res = await req("/api/me", "DELETE", u.cookie);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(30);
    spy.mockRestore();
    for (const k of keys) expect(await env.PHOTOS.get(k)).toBeNull();
  });

  it("removes_everything_and_hands_over_ownership", async () => {
    const owner = await signup();
    const token = await makeVilla(owner.cookie);
    const heir = await signup();
    await join(heir.cookie, token);
    const other = await signup();
    await join(other.cookie, token);
    const certId = await photo(owner.cookie);
    const otherCert = await photo(other.cookie, 9);
    const key = (await env.DB.prepare("SELECT r2_key FROM certs WHERE id = ?").bind(certId).first<{ r2_key: string }>())!.r2_key;
    const otherKey = (await env.DB.prepare("SELECT r2_key FROM certs WHERE id = ?").bind(otherCert).first<{ r2_key: string }>())!.r2_key;
    expect(await env.PHOTOS.get(key)).not.toBeNull();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO inventory (user_id, item_id) VALUES (?, 'x')").bind(owner.id),
      env.DB.prepare("INSERT INTO placements (user_id, slot, item_id) VALUES (?, 's', 'x')").bind(owner.id),
      env.DB.prepare("INSERT INTO reports (cert_id, reporter_id) VALUES (?, ?)").bind(otherCert, owner.id),
      env.DB.prepare("INSERT INTO reports (cert_id, reporter_id) VALUES (?, ?)").bind(certId, heir.id),
    ]);
    await req("/api/recover/request", "POST", undefined, { username: owner.username });

    const res = await req("/api/me", "DELETE", owner.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sid=;|Max-Age=0/i);

    expect(await env.PHOTOS.get(key)).toBeNull();
    expect(await env.PHOTOS.get(otherKey)).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS c FROM certs WHERE user_id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM inventory WHERE user_id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM placements WHERE user_id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM recovery_requests WHERE user_id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM reports WHERE cert_id = ? OR reporter_id = ?", certId, owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM users WHERE id = ?", owner.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM memberships WHERE user_id = ? AND left_at IS NULL", owner.id)).toBe(0);
    const v = await env.DB.prepare("SELECT owner_id FROM villas WHERE invite_token = ?").bind(token).first<{ owner_id: string }>();
    expect(v!.owner_id).toBe(heir.id);
  });

  it("works_for_user_without_villa", async () => {
    const u = await signup();
    expect((await req("/api/me", "DELETE", u.cookie)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS c FROM users WHERE id = ?", u.id)).toBe(0);
  });
});
