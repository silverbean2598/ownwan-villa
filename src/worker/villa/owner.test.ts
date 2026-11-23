import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { approverFor } from "../recovery/routes";

let n = 0;
const uname = () => `ow${Date.now().toString(36)}${n++}`.slice(0, 16);
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
async function signup(nickname = "운동러") {
  const username = uname();
  const res = await send("POST", "/api/signup", { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;
async function create(u: U, name = "우리아파트") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const kick = (owner: U, vid: string, target: U) => send("POST", `/api/villas/${vid}/members/${target.id}/kick`, undefined, owner.cookie);
const transfer = (owner: U, vid: string, target: U) => send("POST", `/api/villas/${vid}/transfer`, { userId: target.id }, owner.cookie);
const dissolve = (owner: U, vid: string, confirmName: string) => send("POST", `/api/villas/${vid}/dissolve`, { confirmName }, owner.cookie);
const err = async (r: Response) => ((await r.json()) as { error: string }).error;
const activeIds = async (vid: string) =>
  (await env.DB.prepare("SELECT user_id FROM memberships WHERE villa_id = ? AND left_at IS NULL ORDER BY user_id").bind(vid).all<{ user_id: string }>()).results.map((r) => r.user_id);
const villaRow = (vid: string) =>
  env.DB.prepare("SELECT owner_id, penthouse_user_id, dissolved_at FROM villas WHERE id = ?").bind(vid).first<{
    owner_id: string; penthouse_user_id: string | null; dissolved_at: number | null;
  }>();
type Ev = { id: string; type: string; payload: Record<string, unknown> };
const events = async (u: U) => (await (await send("GET", "/api/events", undefined, u.cookie)).json()) as Ev[];
const ofType = async (u: U, type: string) => (await events(u)).filter((e) => e.type === type);
const banned = async (vid: string, uid: string) =>
  !!(await env.DB.prepare("SELECT 1 AS x FROM villa_bans WHERE villa_id = ? AND user_id = ?").bind(vid, uid).first());

/** 방장 + 입주민 둘 */
async function villaOf3(name = "우리아파트") {
  const owner = await signup("방장");
  const b = await signup("비비");
  const c = await signup("씨씨");
  // 입주 순서를 확실히 (같은 ms 에 들어가지 않게)
  let t = Date.now();
  setNow(() => (t += 1000));
  const v = await create(owner, name);
  await join(b, v.inviteToken);
  await join(c, v.inviteToken);
  setNow(null);
  return { owner, b, c, ...v };
}

afterEach(() => setNow(null));

describe("내보내기 (kick)", () => {
  it("owner_only_not_self_target_must_be_active", async () => {
    const { owner, b, c, id } = await villaOf3();
    const r1 = await kick(b, id, c);
    expect(r1.status).toBe(403);
    expect(await err(r1)).toBe("방장만 할 수 있어요");
    const r2 = await kick(owner, id, owner);
    expect(r2.status).toBe(400);
    expect(await err(r2)).toBe("나를 내보낼 수는 없어요");
    const stranger = await signup();
    expect((await kick(owner, id, stranger)).status).toBe(404);
    expect((await send("POST", `/api/villas/${id}/members/${b.id}/kick`)).status).toBe(401);
    expect(await activeIds(id)).toEqual([owner.id, b.id, c.id].sort());
  });

  it("effects_equal_leave_and_ban_is_recorded", async () => {
    const { owner, b, id } = await villaOf3();
    await env.DB.prepare("UPDATE users SET streak = 12, points = 250 WHERE id = ?").bind(b.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 4 WHERE user_id = ?").bind(b.id).run();
    await env.DB.prepare("INSERT INTO inventory (user_id, item_id) VALUES (?, 'sofa')").bind(b.id).run();
    const r = await kick(owner, id, b);
    expect(r.status).toBe(200);
    expect(await activeIds(id)).not.toContain(b.id);
    expect(await banned(id, b.id)).toBe(true);
    expect(await env.DB.prepare("SELECT streak, points FROM users WHERE id = ?").bind(b.id).first()).toEqual({ streak: 12, points: 250 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM inventory WHERE user_id = ?").bind(b.id).first<{ c: number }>())!.c).toBe(1);
    // 다른 아파트에 들어가면 1층부터
    const other = await signup();
    const v2 = await create(other);
    expect((await join(b, v2.inviteToken)).status).toBe(200);
    expect((await env.DB.prepare("SELECT floor FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(b.id).first<{ floor: number }>())!.floor).toBe(1);
    // 이미 나간 사람은 다시 내보낼 수 없다
    expect((await kick(owner, id, b)).status).toBe(404);
  });

  it("kicked_event_only_for_the_kicked_member", async () => {
    const { owner, b, c, id } = await villaOf3("땀아파트");
    const before = { o: (await events(owner)).length, c: (await events(c)).length };
    await kick(owner, id, b);
    const k = await ofType(b, "kicked");
    expect(k).toHaveLength(1);
    expect(k[0].payload).toEqual({ villaName: "땀아파트" });
    expect((await events(owner)).length).toBe(before.o);
    expect((await events(c)).length).toBe(before.c);
  });

  it("recomputes_penthouse_after_kick", async () => {
    const { owner, b, c, id } = await villaOf3();
    await env.DB.prepare("UPDATE memberships SET floor = 2 WHERE user_id = ?").bind(owner.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 5 WHERE user_id = ?").bind(b.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 3 WHERE user_id = ?").bind(c.id).run();
    const { recomputePenthouse } = await import("./service");
    expect(await recomputePenthouse(env, id)).toBe(b.id);
    await kick(owner, id, b);
    expect((await villaRow(id))!.penthouse_user_id).toBe(c.id);
  });

  it("former_owner_cannot_kick_after_transfer_race", async () => {
    const { owner, b, c, id } = await villaOf3();
    await transfer(owner, id, b);
    const r = await kick(owner, id, c);
    expect(r.status).toBe(403);
    expect(await activeIds(id)).toContain(c.id);
    expect(await banned(id, c.id)).toBe(false);
  });
});

describe("동시에 일어날 때", () => {
  const ownerOk = async (vid: string) => {
    const o = (await villaRow(vid))!.owner_id;
    expect(await activeIds(vid)).toContain(o);
    return o;
  };

  it("kick_B_while_transferring_to_B", async () => {
    // 순서를 정해 두고(넘기기 먼저) 내보내기가 실패해도 방장이 몰래 바뀌지 않는다
    const { owner, b, c, id } = await villaOf3();
    expect((await transfer(owner, id, b)).status).toBe(200);
    expect((await kick(owner, id, b)).status).toBe(403);
    expect(await ownerOk(id)).toBe(b.id);
    expect(await activeIds(id)).toEqual([owner.id, b.id, c.id].sort());
    expect(await banned(id, b.id)).toBe(false);
    expect(await ofType(b, "kicked")).toHaveLength(0);
    // 화면 검사를 지난 뒤 넘기기가 끝난 경우 (service 를 바로 부른다)
    const { kickMember, NotOwnerError } = await import("./service");
    await expect(kickMember(env, id, owner.id, b.id)).rejects.toBeInstanceOf(NotOwnerError);
    expect(await ownerOk(id)).toBe(b.id);
    expect(await activeIds(id)).toEqual([owner.id, b.id, c.id].sort());
    expect(await banned(id, b.id)).toBe(false);
  });

  it("kick_B_and_transfer_to_B_in_parallel", async () => {
    for (let i = 0; i < 5; i++) {
      const { owner, b, id } = await villaOf3();
      const [k, t] = await Promise.all([kick(owner, id, b), transfer(owner, id, b)]);
      const o = await ownerOk(id);
      const bActive = (await activeIds(id)).includes(b.id);
      const kicked = await ofType(b, "kicked");
      const ownerIn = await ofType(b, "owner_in");
      if (k.status === 200) {
        // 내보내기가 이겼다: B는 나갔고 금지, 넘기기는 실패, 방장은 그대로
        expect(t.status).toBe(404);
        expect(o).toBe(owner.id);
        expect(bActive).toBe(false);
        expect(await banned(id, b.id)).toBe(true);
        expect(kicked).toHaveLength(1);
        expect(ownerIn).toHaveLength(0);
      } else {
        // 넘기기가 이겼다: B가 방장, 내보내기는 실패, 금지 없음
        expect(t.status).toBe(200);
        expect(k.status).toBe(403);
        expect(o).toBe(b.id);
        expect(bActive).toBe(true);
        expect(await banned(id, b.id)).toBe(false);
        expect(kicked).toHaveLength(0);
        expect(ownerIn).toHaveLength(1);
      }
    }
  });

  it("kick_B_while_B_leaves", async () => {
    for (let i = 0; i < 5; i++) {
      const { owner, b, id } = await villaOf3();
      const [k, l] = await Promise.all([kick(owner, id, b), send("POST", "/api/villas/leave", undefined, b.cookie)]);
      expect(await ownerOk(id)).toBe(owner.id);
      expect(await activeIds(id)).not.toContain(b.id);
      const kicked = await ofType(b, "kicked");
      if (k.status === 200) {
        expect(l.status).toBe(409);
        expect(await banned(id, b.id)).toBe(true);
        expect(kicked).toHaveLength(1);
      } else {
        // 먼저 나갔으면 금지도 알림도 남지 않는다
        expect(k.status).toBe(404);
        expect(l.status).toBe(200);
        expect(await banned(id, b.id)).toBe(false);
        expect(kicked).toHaveLength(0);
      }
    }
  });
});

describe("내보낸 사람 입주 막기", () => {
  it("banned_user_cannot_join_or_preview", async () => {
    const { owner, b, id, inviteToken } = await villaOf3();
    await kick(owner, id, b);
    const p = await send("GET", `/api/invite/${inviteToken}`, undefined, b.cookie);
    expect(p.status).toBe(403);
    expect(await err(p)).toBe("이 아파트에는 다시 입주할 수 없어요");
    const r = await join(b, inviteToken);
    expect(r.status).toBe(403);
    expect(await err(r)).toBe("이 아파트에는 다시 입주할 수 없어요");
    expect(await activeIds(id)).not.toContain(b.id);
    // 새 초대 링크도 마찬가지
    const { inviteToken: t2 } = (await (await send("POST", `/api/villas/${id}/invite/rotate`, undefined, owner.cookie)).json()) as { inviteToken: string };
    expect((await join(b, t2)).status).toBe(403);
    // 로그인하지 않은 미리보기는 그대로
    expect((await send("GET", `/api/invite/${t2}`)).status).toBe(200);
  });

  it("ban_check_is_part_of_the_atomic_insert", async () => {
    // 입주 직전 검사를 지나친 뒤 막혀도(동시 요청) INSERT 자체가 막는다: 금지 행을 넣고 바로 입주 시도
    const { owner, id, inviteToken } = await villaOf3();
    const x = await signup();
    await env.DB.prepare("INSERT INTO villa_bans (villa_id, user_id, created_at) VALUES (?, ?, 1)").bind(id, x.id).run();
    const rs = await Promise.all([join(x, inviteToken), join(x, inviteToken)]);
    expect(rs.map((r) => r.status)).toEqual([403, 403]);
    expect(await activeIds(id)).not.toContain(x.id);
    expect(owner).toBeTruthy();
  });

  it("bans_list_and_unban_allows_join", async () => {
    const { owner, b, c, id, inviteToken } = await villaOf3();
    await kick(owner, id, b);
    expect((await send("GET", `/api/villas/${id}/bans`, undefined, c.cookie)).status).toBe(403);
    const list = (await (await send("GET", `/api/villas/${id}/bans`, undefined, owner.cookie)).json()) as any[];
    expect(list).toEqual([{ userId: b.id, nickname: "비비", createdAt: expect.any(Number) }]);
    expect((await send("DELETE", `/api/villas/${id}/bans/${b.id}`, undefined, c.cookie)).status).toBe(403);
    expect(await banned(id, b.id)).toBe(true);
    expect((await send("DELETE", `/api/villas/${id}/bans/${b.id}`, undefined, owner.cookie)).status).toBe(200);
    expect(await (await send("GET", `/api/villas/${id}/bans`, undefined, owner.cookie)).json()).toEqual([]);
    expect((await join(b, inviteToken)).status).toBe(200);
  });

  it("account_deletion_removes_bans", async () => {
    const { owner, b, id } = await villaOf3();
    await kick(owner, id, b);
    expect((await send("DELETE", "/api/me", undefined, b.cookie)).status).toBe(200);
    expect(await banned(id, b.id)).toBe(false);
  });
});

describe("방장 넘기기 (transfer)", () => {
  it("owner_only_target_active_not_self", async () => {
    const { owner, b, c, id } = await villaOf3();
    expect((await transfer(b, id, c)).status).toBe(403);
    expect((await transfer(owner, id, owner)).status).toBe(400);
    const stranger = await signup();
    expect((await transfer(owner, id, stranger)).status).toBe(404);
    await send("POST", "/api/villas/leave", undefined, c.cookie);
    expect((await transfer(owner, id, c)).status).toBe(404);
    expect((await send("POST", `/api/villas/${id}/transfer`, {}, owner.cookie)).status).toBe(400);
    expect((await villaRow(id))!.owner_id).toBe(owner.id);
  });

  it("transfers_immediately_and_invite_follows_owner", async () => {
    const { owner, b, id, inviteToken } = await villaOf3();
    expect((await transfer(owner, id, b)).status).toBe(200);
    expect((await villaRow(id))!.owner_id).toBe(b.id);
    const mineB = (await (await send("GET", "/api/villas/mine", undefined, b.cookie)).json()) as any;
    expect(mineB.inviteToken).toBe(inviteToken);
    const mineO = (await (await send("GET", "/api/villas/mine", undefined, owner.cookie)).json()) as any;
    expect(mineO.inviteToken).toBeUndefined();
    // 예전 방장은 이제 방장 일을 할 수 없다
    expect((await send("PATCH", `/api/villas/${id}`, { name: "새이름" }, owner.cookie)).status).toBe(403);
  });

  it("concurrent_transfers_have_one_winner", async () => {
    const { owner, b, c, id } = await villaOf3();
    const rs = await Promise.all([transfer(owner, id, b), transfer(owner, id, c)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 403]);
    const ownerNow = (await villaRow(id))!.owner_id;
    expect([b.id, c.id]).toContain(ownerNow);
    const ins = [...(await ofType(b, "owner_in")), ...(await ofType(c, "owner_in"))];
    expect(ins).toHaveLength(1);
  });

  it("events_owner_in_and_owner_changed", async () => {
    const { owner, b, c, id } = await villaOf3();
    await transfer(owner, id, b);
    expect(await ofType(b, "owner_in")).toHaveLength(1);
    expect(await ofType(b, "owner_changed")).toHaveLength(0);
    for (const u of [owner, c]) {
      const e = await ofType(u, "owner_changed");
      expect(e).toHaveLength(1);
      expect(e[0].payload).toMatchObject({ nickname: "비비" });
    }
  });

  it("recovery_approver_follows_new_owner", async () => {
    const { owner, b, c, id } = await villaOf3();
    expect(await approverFor(env, c.id)).toBe(owner.id);
    await transfer(owner, id, b);
    expect(await approverFor(env, c.id)).toBe(b.id);
    expect(await approverFor(env, owner.id)).toBe(b.id);
  });
});

describe("아파트 해체 (dissolve)", () => {
  it("owner_only_and_name_must_match", async () => {
    const { owner, b, id } = await villaOf3("땀아파트");
    expect((await dissolve(b, id, "땀아파트")).status).toBe(403);
    const r = await dissolve(owner, id, "땀 아파트");
    expect(r.status).toBe(400);
    expect(await err(r)).toBe("아파트 이름이 맞지 않아요");
    expect((await dissolve(owner, id, "")).status).toBe(400);
    expect((await villaRow(id))!.dissolved_at).toBeNull();
  });

  it("everyone_leaves_invite_dies_bans_cleared", async () => {
    const { owner, b, c, id, inviteToken } = await villaOf3("땀아파트");
    await kick(owner, id, c);
    expect((await dissolve(owner, id, "  땀아파트 ")).status).toBe(200);
    const v = await villaRow(id);
    expect(v!.dissolved_at).not.toBeNull();
    expect(v!.penthouse_user_id).toBeNull();
    expect(await activeIds(id)).toEqual([]);
    expect(await banned(id, c.id)).toBe(false);
    const x = await signup();
    expect((await join(x, inviteToken)).status).toBe(404);
    expect((await send("GET", `/api/invite/${inviteToken}`)).status).toBe(404);
    expect(await (await send("GET", "/api/villas/mine", undefined, b.cookie)).json()).toBeNull();
    // 이미 해체된 아파트는 다시 해체할 수 없다
    expect((await dissolve(owner, id, "땀아파트")).status).toBe(404);
  });

  it("dissolved_event_for_every_member_including_owner", async () => {
    const { owner, b, c, id } = await villaOf3("땀아파트");
    await dissolve(owner, id, "땀아파트");
    for (const u of [owner, b, c]) {
      const e = await ofType(u, "dissolved");
      expect(e).toHaveLength(1);
      expect(e[0].payload).toEqual({ villaName: "땀아파트" });
    }
  });

  it("concurrent_dissolves_once", async () => {
    const { owner, id } = await villaOf3("땀아파트");
    const rs = await Promise.all([dissolve(owner, id, "땀아파트"), dissolve(owner, id, "땀아파트")]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(await ofType(owner, "dissolved")).toHaveLength(1);
  });
});
