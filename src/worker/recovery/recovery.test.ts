import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";

const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const uname = () => `rc${Date.now().toString(36)}${n++}`.slice(0, 16);
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
const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} }, env);

async function signup() {
  const username = uname();
  const res = await post("/api/signup", { username, password: "password1", nickname: "운동러", over14: true, agree: true });
  const { recoveryCode } = (await res.json()) as { recoveryCode: string };
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { username, id: row!.id, recoveryCode, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;

async function villa(owner: U, members: Array<{ u: U; joinedAt: number }> = []) {
  const vid = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO villas (id, name, owner_id, invite_token, created_at) VALUES (?, '빌라', ?, ?, 1)")
    .bind(vid, owner.id, crypto.randomUUID())
    .run();
  for (const [u, joinedAt] of [[owner, 1], ...members.map((m) => [m.u, m.joinedAt] as const)] as Array<[U, number]>) {
    await env.DB.prepare(
      "INSERT INTO memberships (id, user_id, villa_id, floor_reached_at, joined_at) VALUES (?, ?, ?, 1, ?)",
    )
      .bind(crypto.randomUUID(), u.id, vid, joinedAt)
      .run();
  }
  return vid;
}
const status = async (userId: string) =>
  (await env.DB.prepare("SELECT status FROM recovery_requests WHERE user_id = ? ORDER BY created_at DESC, rowid DESC").bind(userId).all<{ status: string }>()).results.map((r) => r.status);

afterEach(() => setNow(null));

describe("recover with code", () => {
  it("recover_with_code_rotates_code", async () => {
    const u = await signup();
    const res = await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "newpassword1" });
    expect(res.status).toBe(200);
    const { recoveryCode } = (await res.json()) as { recoveryCode: string };
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(recoveryCode).not.toBe(u.recoveryCode);
    expect(res.headers.get("set-cookie")).toMatch(/sid=/);
    expect((await post("/api/login", { username: u.username, password: "newpassword1" })).status).toBe(200);
    expect((await post("/api/login", { username: u.username, password: "password1" })).status).toBe(401);
    const again = await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "another1234" });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: "아이디 또는 복구 코드가 맞지 않아요" });
    expect((await post("/api/recover/code", { username: u.username, code: recoveryCode.toLowerCase(), newPassword: "another1234" })).status).toBe(200);
  });

  it("recover_with_code_rejects_unknown_user_and_short_password", async () => {
    const u = await signup();
    const r1 = await post("/api/recover/code", { username: "nobodyhere", code: u.recoveryCode, newPassword: "newpassword1" });
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ error: "아이디 또는 복구 코드가 맞지 않아요" });
    expect((await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "short" })).status).toBe(400);
    // 짧은 비밀번호 시도로 코드가 소모되지 않는다
    expect((await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "newpassword1" })).status).toBe(200);
  });

  it("recover_with_code_ends_old_sessions", async () => {
    const u = await signup();
    await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "newpassword1" });
    expect((await get("/api/me", u.cookie)).status).toBe(401);
  });
});

describe("reissue", () => {
  it("reissue_requires_login_and_replaces_code", async () => {
    expect((await post("/api/recovery-code/reissue", {})).status).toBe(401);
    const u = await signup();
    const res = await post("/api/recovery-code/reissue", {}, u.cookie);
    expect(res.status).toBe(200);
    const { recoveryCode } = (await res.json()) as { recoveryCode: string };
    expect(recoveryCode).not.toBe(u.recoveryCode);
    const old = await post("/api/recover/code", { username: u.username, code: u.recoveryCode, newPassword: "newpassword1" });
    expect(old.status).toBe(400);
    expect((await post("/api/recover/code", { username: u.username, code: recoveryCode, newPassword: "newpassword1" })).status).toBe(200);
  });
});

describe("approver", () => {
  it("request_goes_to_owner", async () => {
    const owner = await signup();
    const member = await signup();
    await villa(owner, [{ u: member, joinedAt: 5 }]);
    const res = await post("/api/recover/request", { username: member.username });
    expect(res.status).toBe(201);
    const { ticket } = (await res.json()) as { ticket: string };
    expect(ticket).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const row = await env.DB.prepare("SELECT * FROM recovery_requests WHERE user_id = ?").bind(member.id).first<Record<string, unknown>>();
    expect(row!.approver_id).toBe(owner.id);
    expect(row!.status).toBe("pending");
    expect(JSON.stringify(row)).not.toContain(ticket.replaceAll("-", ""));
  });

  it("owner_request_goes_to_oldest_member", async () => {
    const owner = await signup();
    const late = await signup();
    const early = await signup();
    await villa(owner, [{ u: late, joinedAt: 20 }, { u: early, joinedAt: 10 }]);
    expect((await post("/api/recover/request", { username: owner.username })).status).toBe(201);
    const row = await env.DB.prepare("SELECT approver_id FROM recovery_requests WHERE user_id = ?").bind(owner.id).first<{ approver_id: string }>();
    expect(row!.approver_id).toBe(early.id);
  });

  it("owner_alone_cannot_request", async () => {
    const owner = await signup();
    await villa(owner);
    const res = await post("/api/recover/request", { username: owner.username });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "확인해 줄 입주민이 없어요. 복구 코드로만 되찾을 수 있어요" });
  });

  it("request_without_villa_or_unknown_user", async () => {
    const u = await signup();
    const r = await post("/api/recover/request", { username: u.username });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "빌라에 살고 있어야 방장 확인을 쓸 수 있어요" });
    const r2 = await post("/api/recover/request", { username: "nobodyhere" });
    expect(r2.status).toBe(400);
    expect(await r2.json()).toEqual({ error: "아이디를 확인해 주세요" });
  });

  it("new_request_rules", async () => {
    const owner = await signup();
    const member = await signup();
    await villa(owner, [{ u: member, joinedAt: 5 }]);
    const t0 = Date.now();
    setNow(() => t0);
    const first = (await (await post("/api/recover/request", { username: member.username })).json()) as { ticket: string };
    setNow(() => t0 + 30 * 60 * 1000);
    const soon = await post("/api/recover/request", { username: member.username });
    expect(soon.status).toBe(429);
    expect(await soon.json()).toEqual({ error: "방금 요청했어요. 1시간 뒤에 다시 요청해 주세요" });
    setNow(() => t0 + 61 * 60 * 1000);
    expect((await post("/api/recover/request", { username: member.username })).status).toBe(201);
    expect(await status(member.id)).toEqual(["pending", "cancelled"]);
    expect((await post("/api/recover/complete", { username: member.username, ticket: first.ticket, newPassword: "newpassword1" })).status).toBe(400);
  });

  it("request_blocked_while_approved", async () => {
    const owner = await signup();
    const member = await signup();
    await villa(owner, [{ u: member, joinedAt: 5 }]);
    const t0 = Date.now();
    setNow(() => t0);
    await post("/api/recover/request", { username: member.username });
    const id = (await env.DB.prepare("SELECT id FROM recovery_requests WHERE user_id = ?").bind(member.id).first<{ id: string }>())!.id;
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    setNow(() => t0 + 5 * DAY);
    const res = await post("/api/recover/request", { username: member.username });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "이미 승인된 요청이 있어요. 요청 번호로 비밀번호를 바꿔 주세요" });
    expect(await status(member.id)).toEqual(["approved"]);
  });
});

describe("approve and complete", () => {
  async function setup() {
    const owner = await signup();
    const member = await signup();
    const other = await signup();
    await villa(owner, [{ u: member, joinedAt: 5 }, { u: other, joinedAt: 6 }]);
    const { ticket } = (await (await post("/api/recover/request", { username: member.username })).json()) as { ticket: string };
    const id = (await env.DB.prepare("SELECT id FROM recovery_requests WHERE user_id = ?").bind(member.id).first<{ id: string }>())!.id;
    return { owner, member, other, ticket, id };
  }

  it("pending_lists_only_my_requests", async () => {
    const { owner, member, other, id } = await setup();
    const res = await get("/api/recover/pending", owner.cookie);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; nickname: string; createdAt: number }>;
    expect(list.map((r) => r.id)).toEqual([id]);
    expect(list[0].nickname).toBe("운동러");
    expect(typeof list[0].createdAt).toBe("number");
    expect(await (await get("/api/recover/pending", other.cookie)).json()).toEqual([]);
    expect((await get("/api/recover/pending")).status).toBe(401);
    void member;
  });

  it("only_approver_can_approve", async () => {
    const { owner, other, id } = await setup();
    expect((await post(`/api/recover/${id}/approve`, {}, other.cookie)).status).toBe(403);
    expect((await post(`/api/recover/${id}/approve`, {})).status).toBe(401);
    expect((await post(`/api/recover/${id}/approve`, {}, owner.cookie)).status).toBe(200);
    expect((await post(`/api/recover/${crypto.randomUUID()}/approve`, {}, owner.cookie)).status).toBe(404);
  });

  it("complete_requires_approval", async () => {
    const { member, ticket } = await setup();
    const res = await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" });
    expect(res.status).toBe(400);
  });

  it("complete_before_24h_fails", async () => {
    const { owner, member, ticket, id } = await setup();
    const t0 = Date.now();
    setNow(() => t0);
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    setNow(() => t0 + DAY - 1000);
    const early = await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" });
    expect(early.status).toBe(425);
    expect(await early.json()).toEqual({ error: "승인 후 24시간이 지나야 바꿀 수 있어요" });
    setNow(() => t0 + DAY);
    const ok = await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" });
    expect(ok.status).toBe(200);
    const { recoveryCode } = (await ok.json()) as { recoveryCode: string };
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(ok.headers.get("set-cookie")).toMatch(/sid=/);
    expect(await status(member.id)).toEqual(["done"]);
    expect((await post("/api/login", { username: member.username, password: "newpassword1" })).status).toBe(200);
    // 새 복구 코드로 바뀌었고, 같은 요청 번호는 다시 쓸 수 없다
    expect((await post("/api/recover/code", { username: member.username, code: member.recoveryCode, newPassword: "zzzzzzzz1" })).status).toBe(400);
    expect((await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword2" })).status).toBe(400);
  });

  it("complete_rejects_wrong_ticket_and_short_password", async () => {
    const { owner, member, ticket, id } = await setup();
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    setNow(() => Date.now() + 2 * DAY);
    expect((await post("/api/recover/complete", { username: member.username, ticket: "AAAA-AAAA-AAAA-AAAA", newPassword: "newpassword1" })).status).toBe(400);
    expect((await post("/api/recover/complete", { username: member.username, ticket, newPassword: "short" })).status).toBe(400);
  });

  it("login_cancels_pending_request", async () => {
    const { owner, member, ticket, id } = await setup();
    expect((await post("/api/login", { username: member.username, password: "password1" })).status).toBe(200);
    expect(await status(member.id)).toEqual(["cancelled"]);
    expect((await post(`/api/recover/${id}/approve`, {}, owner.cookie)).status).toBe(409);
    expect((await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" })).status).toBe(400);
  });

  it("login_cancels_approved_request", async () => {
    const { owner, member, ticket, id } = await setup();
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    await post("/api/login", { username: member.username, password: "password1" });
    expect(await status(member.id)).toEqual(["cancelled"]);
    setNow(() => Date.now() + 2 * DAY);
    expect((await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" })).status).toBe(400);
  });

  it("code_recovery_cancels_attackers_approved_request", async () => {
    const { owner, member, ticket, id } = await setup();
    const t0 = Date.now();
    setNow(() => t0);
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    await post("/api/recover/code", { username: member.username, code: member.recoveryCode, newPassword: "victimpass1" });
    expect(await status(member.id)).toEqual(["cancelled"]);
    setNow(() => t0 + 2 * DAY);
    expect((await post("/api/recover/complete", { username: member.username, ticket, newPassword: "attacker123" })).status).toBe(400);
    expect((await post("/api/login", { username: member.username, password: "victimpass1" })).status).toBe(200);
  });

  it("reissue_cancels_open_requests", async () => {
    const { member } = await setup();
    await post("/api/recovery-code/reissue", {}, member.cookie);
    expect(await status(member.id)).toEqual(["cancelled"]);
  });

  async function leave(u: U) {
    await env.DB.prepare("UPDATE memberships SET left_at = 100 WHERE user_id = ? AND left_at IS NULL").bind(u.id).run();
  }

  it("former_owner_cannot_approve_new_owner_can", async () => {
    const { owner, member, other, id } = await setup();
    // owner leaves; oldest remaining member (member, joined 5) becomes owner -> requester is the owner, approver is oldest other (other)
    await leave(owner);
    await env.DB.prepare("UPDATE villas SET owner_id = ? WHERE owner_id = ?").bind(other.id, owner.id).run();
    expect((await post(`/api/recover/${id}/approve`, {}, owner.cookie)).status).toBe(403);
    expect(await (await get("/api/recover/pending", owner.cookie)).json()).toEqual([]);
    const list = (await (await get("/api/recover/pending", other.cookie)).json()) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).toEqual([id]);
    expect((await post(`/api/recover/${id}/approve`, {}, other.cookie)).status).toBe(200);
    void member;
  });

  it("requester_who_left_cannot_complete", async () => {
    const { owner, member, ticket, id } = await setup();
    const t0 = Date.now();
    setNow(() => t0);
    await post(`/api/recover/${id}/approve`, {}, owner.cookie);
    await leave(member);
    setNow(() => t0 + 2 * DAY);
    const res = await post("/api/recover/complete", { username: member.username, ticket, newPassword: "newpassword1" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "빌라를 옮겨서 요청이 취소됐어요. 다시 요청해 주세요" });
    expect(await status(member.id)).toEqual(["cancelled"]);
  });
});
