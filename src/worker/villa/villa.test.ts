import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { kstDay } from "../../shared/rules/day";
import { settle } from "../cron/settle";
import { DEFAULT_AVATAR } from "../../shared/avatar";

let n = 0;
const uname = () => `vl${Date.now().toString(36)}${n++}`.slice(0, 16);
const send = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(
    path,
    {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    env,
  );
async function signup() {
  const username = uname();
  const res = await send("POST", "/api/signup", { username, password: "password1", nickname: "운동러", over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;
async function create(u: U, name = "우리빌라") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const active = async (vid: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE villa_id = ? AND left_at IS NULL").bind(vid).first<{ c: number }>())!.c;
const villaRow = (vid: string) =>
  env.DB.prepare("SELECT owner_id, penthouse_user_id, dissolved_at FROM villas WHERE id = ?").bind(vid).first<{
    owner_id: string; penthouse_user_id: string | null; dissolved_at: number | null;
  }>();

afterEach(() => setNow(null));

describe("villa", () => {
  it("create_makes_owner_and_penthouse", async () => {
    const u = await signup();
    const res = await send("POST", "/api/villas", { name: "  우리빌라 " }, u.cookie);
    expect(res.status).toBe(201);
    const { id, inviteToken } = (await res.json()) as { id: string; inviteToken: string };
    expect(inviteToken.length).toBeGreaterThanOrEqual(22);
    expect(await villaRow(id)).toMatchObject({ owner_id: u.id, penthouse_user_id: u.id });
    const m = await env.DB.prepare("SELECT floor FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(u.id).first<{ floor: number }>();
    expect(m!.floor).toBe(1);
    const mine = (await (await send("GET", "/api/villas/mine", undefined, u.cookie)).json()) as any;
    expect(mine.name).toBe("우리빌라");
    expect(mine.members[0]).toMatchObject({ userId: u.id, floor: 1, certifiedToday: false, placements: [] });
    expect(mine.members[0].avatar).toBeTypeOf("object");
  });

  it("create validates name and single villa", async () => {
    const u = await signup();
    for (const name of ["", "   ", "가".repeat(21)]) {
      const r = await send("POST", "/api/villas", { name }, u.cookie);
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).error).toBe("빌라 이름은 1~20자로 지어 주세요");
    }
    await create(u);
    const r = await send("POST", "/api/villas", { name: "또" }, u.cookie);
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toBe("지금 빌라를 먼저 나가야 해요");
  });

  it("mine returns default avatar for unparseable stored avatar", async () => {
    const u = await signup();
    await create(u);
    for (const raw of ["{}", "not json"]) {
      await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(raw, u.id).run();
      const mine = (await (await send("GET", "/api/villas/mine", undefined, u.cookie)).json()) as any;
      expect(mine.members[0].avatar).toEqual(DEFAULT_AVATAR);
    }
  });

  it("mine is null without villa", async () => {
    const u = await signup();
    const r = await send("GET", "/api/villas/mine", undefined, u.cookie);
    expect(r.status).toBe(200);
    expect(await r.json()).toBeNull();
  });

  it("certifiedToday counts only today's non-duplicate photo", async () => {
    const u = await signup();
    await create(u);
    const day = kstDay(Date.now());
    await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES (?, ?, ?, 'photo', 0, 1, 1)").bind(crypto.randomUUID(), u.id, day).run();
    const get = async () => ((await (await send("GET", "/api/villas/mine", undefined, u.cookie)).json()) as any).members[0].certifiedToday;
    expect(await get()).toBe(false);
    await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES (?, ?, ?, 'photo', 20, 0, 1)").bind(crypto.randomUUID(), u.id, day).run();
    expect(await get()).toBe(true);
  });

  it("7일째 인증하면 바로 +1층, 자정 정산 뒤 저장된 층과 같다", async () => {
    const u = await signup();
    await create(u);
    const t0 = Date.parse("2026-11-18T03:00:00+09:00");
    setNow(() => t0);
    const day = kstDay(t0);
    await env.DB.prepare("UPDATE users SET streak = 6, created_at = 0 WHERE id = ?").bind(u.id).run();
    const me = async () => ((await (await send("GET", "/api/villas/mine", undefined, u.cookie)).json()) as any).members[0];
    expect(await me()).toMatchObject({ floor: 1, floorUpToday: false });
    await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES (?, ?, ?, 'photo', 20, 0, ?)").bind(crypto.randomUUID(), u.id, day, t0).run();
    expect(await me()).toMatchObject({ floor: 2, floorUpToday: true });
    // 저장된 층은 아직 그대로
    expect((await env.DB.prepare("SELECT floor FROM memberships WHERE user_id = ?").bind(u.id).first<{ floor: number }>())!.floor).toBe(1);
    await settle(env, day);
    expect((await env.DB.prepare("SELECT floor FROM memberships WHERE user_id = ?").bind(u.id).first<{ floor: number }>())!.floor).toBe(2);
    setNow(() => t0 + 86_400_000);
    expect(await me()).toMatchObject({ floor: 2, floorUpToday: false });
  });

  it("join_rejects_21st_member", async () => {
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    for (let i = 0; i < 19; i++) expect((await join(await signup(), inviteToken)).status).toBe(200);
    expect(await active(id)).toBe(20);
    const r = await join(await signup(), inviteToken);
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toBe("빌라가 꽉 찼어요");
  });

  it("concurrent_joins_never_exceed_20", async () => {
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    for (let i = 0; i < 18; i++) await join(await signup(), inviteToken);
    expect(await active(id)).toBe(19);
    const rs = await Promise.all([join(await signup(), inviteToken), join(await signup(), inviteToken)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await active(id)).toBe(20);
  });

  it("join rejects when already in a villa", async () => {
    const a = await signup();
    const { inviteToken } = await create(a);
    const b = await signup();
    const other = await create(b);
    const r = await join(b, inviteToken);
    expect(r.status).toBe(409);
    expect(other.id).toBeTruthy();
  });

  it("rejoin_same_villa_is_idempotent_200", async () => {
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    const b = await signup();
    expect((await join(b, inviteToken)).status).toBe(200);
    const before = await env.DB.prepare("SELECT id, floor, joined_at FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(b.id).all();
    const r = await join(b, inviteToken);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, alreadyMember: true });
    const after = await env.DB.prepare("SELECT id, floor, joined_at FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(b.id).all();
    expect(after.results).toEqual(before.results);
    expect(after.results).toHaveLength(1);
    expect(await active(id)).toBe(2);
    // 방장 본인이 자기 초대 링크를 다시 열어도 200
    expect((await join(owner, inviteToken)).status).toBe(200);
  });

  it("rejoin_same_full_villa_is_still_200", async () => {
    const owner = await signup();
    const { inviteToken } = await create(owner);
    for (let i = 0; i < 9; i++) await join(await signup(), inviteToken);
    expect((await join(owner, inviteToken)).status).toBe(200);
  });

  it("invite_preview_tells_logged_in_member", async () => {
    const a = await signup();
    const { inviteToken } = await create(a);
    const b = await signup();
    await create(b, "다른빌라");
    expect(await (await send("GET", `/api/invite/${inviteToken}`, undefined, a.cookie)).json()).toMatchObject({ alreadyMember: true, inOtherVilla: false });
    expect(await (await send("GET", `/api/invite/${inviteToken}`, undefined, b.cookie)).json()).toMatchObject({ alreadyMember: false, inOtherVilla: true });
    const anon = (await (await send("GET", `/api/invite/${inviteToken}`)).json()) as Record<string, unknown>;
    expect(anon.alreadyMember).toBeUndefined();
  });

  it("invite preview and rotate", async () => {
    const a = await signup();
    const { id, inviteToken } = await create(a, "미리보기");
    const prev = await send("GET", `/api/invite/${inviteToken}`);
    expect(await prev.json()).toEqual({ villaName: "미리보기", memberCount: 1 });
    const b = await signup();
    expect((await send("POST", `/api/villas/${id}/invite/rotate`, undefined, b.cookie)).status).toBe(403);
    const rot = await send("POST", `/api/villas/${id}/invite/rotate`, undefined, a.cookie);
    const { inviteToken: t2 } = (await rot.json()) as { inviteToken: string };
    expect(t2).not.toBe(inviteToken);
    expect((await send("GET", `/api/invite/${inviteToken}`)).status).toBe(404);
    expect((await join(b, inviteToken)).status).toBe(404);
    expect((await join(b, t2)).status).toBe(200);
  });

  it("leave_keeps_streak_points_resets_floor", async () => {
    const a = await signup();
    const va = await create(a);
    await env.DB.prepare("UPDATE users SET streak = 20, points = 300 WHERE id = ?").bind(a.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 5 WHERE user_id = ?").bind(a.id).run();
    await env.DB.prepare("INSERT INTO inventory (user_id, item_id) VALUES (?, 'sofa')").bind(a.id).run();
    const other = await signup();
    await join(other, va.inviteToken);
    expect((await send("POST", "/api/villas/leave", undefined, a.cookie)).status).toBe(200);
    const b = await signup();
    const vb = await create(b);
    expect((await join(a, vb.inviteToken)).status).toBe(200);
    const m = await env.DB.prepare("SELECT floor FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(a.id).first<{ floor: number }>();
    const u = await env.DB.prepare("SELECT streak, points FROM users WHERE id = ?").bind(a.id).first<any>();
    expect(m!.floor).toBe(1);
    expect(u).toEqual({ streak: 20, points: 300 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM inventory WHERE user_id = ?").bind(a.id).first<any>()).c).toBe(1);
  });

  it("leave without villa is 409", async () => {
    const u = await signup();
    const r = await send("POST", "/api/villas/leave", undefined, u.cookie);
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toBe("살고 있는 빌라가 없어요");
  });

  it("owner_leave_passes_to_earliest_joined", async () => {
    let t = 1_000_000;
    setNow(() => (t += 1000));
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    const first = await signup();
    const second = await signup();
    await join(first, inviteToken);
    await join(second, inviteToken);
    await send("POST", "/api/villas/leave", undefined, owner.cookie);
    expect((await villaRow(id))!.owner_id).toBe(first.id);
  });

  it("last_leave_dissolves", async () => {
    const u = await signup();
    const { id, inviteToken } = await create(u);
    await send("POST", "/api/villas/leave", undefined, u.cookie);
    const v = await villaRow(id);
    expect(v!.dissolved_at).not.toBeNull();
    expect(v!.penthouse_user_id).toBeNull();
    const b = await signup();
    const r = await join(b, inviteToken);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).error).toBe("초대 링크가 만료됐어요");
  });

  it("penthouse_recomputed_on_leave", async () => {
    const a = await signup();
    const { id, inviteToken } = await create(a);
    const b = await signup();
    const c = await signup();
    await join(b, inviteToken);
    await join(c, inviteToken);
    await env.DB.prepare("UPDATE memberships SET floor = 4 WHERE user_id = ?").bind(a.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 3 WHERE user_id = ?").bind(b.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 2 WHERE user_id = ?").bind(c.id).run();
    const { recomputePenthouse } = await import("./service");
    expect(await recomputePenthouse(env, id)).toBe(a.id);
    await send("POST", "/api/villas/leave", undefined, a.cookie);
    expect((await villaRow(id))!.penthouse_user_id).toBe(b.id);
  });

  it("rename_owner_only", async () => {
    const a = await signup();
    const { id, inviteToken } = await create(a);
    const b = await signup();
    await join(b, inviteToken);
    expect((await send("PATCH", `/api/villas/${id}`, { name: "새이름" }, b.cookie)).status).toBe(403);
    expect((await send("PATCH", `/api/villas/${id}`, { name: "" }, a.cookie)).status).toBe(400);
    expect((await send("PATCH", `/api/villas/${id}`, { name: "새이름" }, a.cookie)).status).toBe(200);
    expect((await env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(id).first<any>()).name).toBe("새이름");
  });

  it("concurrent leaves keep a valid owner", async () => {
    let t = 1_000_000;
    setNow(() => (t += 1000));
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    const b = await signup();
    const c = await signup();
    await join(b, inviteToken);
    await join(c, inviteToken);
    await Promise.all([send("POST", "/api/villas/leave", undefined, owner.cookie), send("POST", "/api/villas/leave", undefined, b.cookie)]);
    const v = await villaRow(id);
    expect(v!.owner_id).toBe(c.id);
    expect(v!.penthouse_user_id).toBe(c.id);
    expect(v!.dissolved_at).toBeNull();
  });

  it("concurrent leave of everyone dissolves", async () => {
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    const b = await signup();
    await join(b, inviteToken);
    await Promise.all([send("POST", "/api/villas/leave", undefined, owner.cookie), send("POST", "/api/villas/leave", undefined, b.cookie)]);
    expect((await villaRow(id))!.dissolved_at).not.toBeNull();
    expect(await active(id)).toBe(0);
  });

  it("join recomputes penthouse immediately", async () => {
    const owner = await signup();
    const { id, inviteToken } = await create(owner);
    const b = await signup();
    await join(b, inviteToken);
    expect((await villaRow(id))!.penthouse_user_id).toBe(owner.id);
    await env.DB.prepare("UPDATE users SET streak = 9 WHERE id = ?").bind(b.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 1 WHERE user_id = ?").bind(owner.id).run();
    const c = await signup();
    await join(c, inviteToken);
    expect((await villaRow(id))!.penthouse_user_id).toBe(b.id);
  });
});
