import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { now } from "../clock";
import { kstDay, prevDay } from "../../shared/rules/day";
import type { CityResponse, CityVilla } from "../../shared/city";

let n = 0;
const uname = () => `ct${Date.now().toString(36)}${n++}`.slice(0, 16);
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
async function create(u: U, name = "우리빌라") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const setPublic = (u: U, vid: string, value: boolean) => send("PUT", `/api/villas/${vid}/public`, { public: value }, u.cookie);
const cityOf = async (u: U) => (await (await send("GET", "/api/city", undefined, u.cookie)).json()) as CityResponse;
const find = (r: CityResponse, vid: string) => r.villas.find((v) => v.id === vid);
const slotOf = async (vid: string) =>
  (await env.DB.prepare("SELECT map_slot FROM villas WHERE id = ?").bind(vid).first<{ map_slot: number | null }>())!.map_slot;
async function photo(u: U, day = kstDay(now()), extra: { duplicate?: number; deleted?: number } = {}) {
  await env.DB.prepare(
    "INSERT INTO certs (id, user_id, day, kind, points, duplicate, deleted, created_at) VALUES (?, ?, ?, 'photo', 20, ?, ?, 1)",
  )
    .bind(crypto.randomUUID(), u.id, day, extra.duplicate ?? 0, extra.deleted ?? 0)
    .run();
}
/** 방장 + 입주민 n명인 빌라 */
async function villaWith(extra: number, name = "햇살빌라") {
  const owner = await signup("방장");
  const v = await create(owner, name);
  const others: U[] = [];
  for (let i = 0; i < extra; i++) {
    const u = await signup(`입주${i}`);
    await join(u, v.inviteToken);
    others.push(u);
  }
  return { owner, others, ...v };
}

describe("GET /api/city", () => {
  it("requires_login", async () => {
    expect((await send("GET", "/api/city")).status).toBe(401);
  });

  it("private_villas_hidden_until_owner_turns_public_and_hidden_again_when_off", async () => {
    const a = await villaWith(0, "비밀빌라");
    expect(find(await cityOf(a.owner), a.id)).toBeUndefined();
    expect((await cityOf(a.owner)).mine).toEqual({ villaId: a.id, name: "비밀빌라", public: false, isOwner: true, inBattle: false });
    expect((await setPublic(a.owner, a.id, true)).status).toBe(200);
    const on = await cityOf(a.owner);
    expect(find(on, a.id)?.name).toBe("비밀빌라");
    expect(on.mine).toEqual({ villaId: a.id, name: "비밀빌라", public: true, isOwner: true, inBattle: false });
    await setPublic(a.owner, a.id, false);
    expect(find(await cityOf(a.owner), a.id)).toBeUndefined();
  });

  it("dissolved_villa_hidden_and_slot_freed", async () => {
    const a = await villaWith(0, "곧해체");
    await setPublic(a.owner, a.id, true);
    expect(await slotOf(a.id)).not.toBeNull();
    const r = await send("POST", `/api/villas/${a.id}/dissolve`, { confirmName: "곧해체" }, a.owner.cookie);
    expect(r.status).toBe(200);
    expect(await slotOf(a.id)).toBeNull();
    const viewer = await signup();
    expect(find(await cityOf(viewer), a.id)).toBeUndefined();
  });

  it("last_member_leaving_dissolves_and_frees_slot", async () => {
    const a = await villaWith(0, "혼자빌라");
    await setPublic(a.owner, a.id, true);
    await send("POST", "/api/villas/leave", undefined, a.owner.cookie);
    expect(await slotOf(a.id)).toBeNull();
    expect(find(await cityOf(a.owner), a.id)).toBeUndefined();
  });

  it("aggregates_members_lit_today_only_excluding_deleted_and_duplicate", async () => {
    const a = await villaWith(4, "집계빌라");
    const [b, c, d, e] = a.others;
    await photo(a.owner);
    await photo(b);
    await photo(b); // 두 장이어도 창문 하나
    await photo(c, prevDay(kstDay(now()))); // 어제
    await photo(d, kstDay(now()), { deleted: 1 }); // 지운 사진
    await photo(e, kstDay(now()), { duplicate: 1 }); // 중복 사진
    await setPublic(a.owner, a.id, true);
    const v = find(await cityOf(a.owner), a.id)!;
    expect(v.memberCount).toBe(5);
    expect(v.litCount).toBe(2);
    expect(v.penthouseNickname).toBeTypeOf("string");
  });

  it("top_floor_uses_display_floor", async () => {
    const a = await villaWith(1, "높은빌라");
    const [b] = a.others;
    await env.DB.prepare("UPDATE memberships SET floor = 4 WHERE user_id = ? AND left_at IS NULL").bind(b.id).run();
    // 6일 연속 + 오늘 인증 = 7일째 → 바로 5층
    await env.DB.prepare("UPDATE users SET streak = 6 WHERE id = ?").bind(b.id).run();
    await env.DB.prepare("UPDATE memberships SET streak = 6 WHERE user_id = ? AND left_at IS NULL").bind(b.id).run();
    await setPublic(a.owner, a.id, true);
    expect(find(await cityOf(a.owner), a.id)!.topFloor).toBe(4);
    await photo(b);
    expect(find(await cityOf(a.owner), a.id)!.topFloor).toBe(5);
  });

  it("response_has_only_aggregates_no_photos_routines_or_member_ids", async () => {
    const a = await villaWith(2, "비공개정보");
    await photo(a.owner);
    await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, body, points, created_at) VALUES (?, ?, ?, 'routine', '스쿼트 비밀루틴', 10, 1)")
      .bind(crypto.randomUUID(), a.others[0].id, kstDay(now()))
      .run();
    await setPublic(a.owner, a.id, true);
    const viewer = await signup("구경꾼");
    const res = await cityOf(viewer);
    expect(res.mine).toBeNull();
    const v = find(res, a.id)!;
    expect(Object.keys(v).sort()).toEqual(["id", "inBattle", "litCount", "memberCount", "name", "penthouseNickname", "price", "priceChange", "slot", "topFloor"]);
    const raw = JSON.stringify(res);
    for (const u of [a.owner, ...a.others]) expect(raw).not.toContain(u.id);
    expect(raw).not.toContain("스쿼트");
    expect(raw).not.toContain("r2");
    expect(raw).not.toContain(a.inviteToken);
  });

  it("non_owner_mine_shows_not_owner", async () => {
    const a = await villaWith(1, "입주민시점");
    const r = await cityOf(a.others[0]);
    expect(r.mine).toEqual({ villaId: a.id, name: "입주민시점", public: false, isOwner: false, inBattle: false });
  });
});

describe("PUT /api/villas/:id/public", () => {
  it("owner_only_non_owner_403_outsider_403_bad_body_400", async () => {
    const a = await villaWith(1, "권한빌라");
    const outsider = await signup();
    expect((await setPublic(a.others[0], a.id, true)).status).toBe(403);
    expect((await setPublic(outsider, a.id, true)).status).toBe(403);
    expect((await send("PUT", `/api/villas/${a.id}/public`, { public: "yes" }, a.owner.cookie)).status).toBe(400);
    expect((await send("PUT", `/api/villas/nope/public`, { public: true }, a.owner.cookie)).status).toBe(404);
    expect(await slotOf(a.id)).toBeNull();
  });

  it("slot_assigned_once_and_kept_across_off_on", async () => {
    const a = await villaWith(0, "자리빌라");
    await setPublic(a.owner, a.id, true);
    const s = await slotOf(a.id);
    expect(s).not.toBeNull();
    await setPublic(a.owner, a.id, false);
    expect(await slotOf(a.id)).toBe(s);
    const other = await villaWith(0, "다른빌라");
    await setPublic(other.owner, other.id, true);
    await setPublic(a.owner, a.id, true);
    expect(await slotOf(a.id)).toBe(s);
    expect(await slotOf(other.id)).not.toBe(s);
    expect(find(await cityOf(a.owner), a.id)!.slot).toBe(s);
  });

  it("freed_slot_is_reused_as_lowest_free", async () => {
    const x = await villaWith(0, "엑스");
    await setPublic(x.owner, x.id, true);
    const sx = (await slotOf(x.id))!;
    await send("POST", `/api/villas/${x.id}/dissolve`, { confirmName: "엑스" }, x.owner.cookie);
    const used = new Set(
      (await env.DB.prepare("SELECT map_slot FROM villas WHERE map_slot IS NOT NULL").all<{ map_slot: number }>()).results.map((r) => r.map_slot),
    );
    expect(used.has(sx)).toBe(false);
    let lowest = 0;
    while (used.has(lowest)) lowest++;
    const z = await villaWith(0, "제트");
    await setPublic(z.owner, z.id, true);
    expect(await slotOf(z.id)).toBe(lowest);
    expect(lowest).toBeLessThanOrEqual(sx);
  });

  it("concurrent_toggles_never_share_a_slot", async () => {
    const vs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => villaWith(0, `동시${i}`)));
    const res = await Promise.all(vs.map((v) => setPublic(v.owner, v.id, true)));
    expect(res.map((r) => r.status)).toEqual(vs.map(() => 200));
    // 같은 빌라를 동시에 여러 번 켜도 자리는 하나
    await Promise.all([0, 1, 2].map(() => setPublic(vs[0].owner, vs[0].id, true)));
    const slots = await Promise.all(vs.map((v) => slotOf(v.id)));
    expect(slots.every((s) => s !== null)).toBe(true);
    expect(new Set(slots).size).toBe(slots.length);
    const all = (await env.DB.prepare("SELECT map_slot FROM villas WHERE map_slot IS NOT NULL").all<{ map_slot: number }>()).results;
    expect(new Set(all.map((r) => r.map_slot)).size).toBe(all.length);
  });

  it("dissolved_villa_cannot_be_toggled", async () => {
    const a = await villaWith(0, "끝난빌라");
    await send("POST", `/api/villas/${a.id}/dissolve`, { confirmName: "끝난빌라" }, a.owner.cookie);
    expect((await setPublic(a.owner, a.id, true)).status).toBe(404);
    expect(await slotOf(a.id)).toBeNull();
  });

  it("villas_mine_reports_public_flag", async () => {
    const a = await villaWith(0, "플래그");
    const get = async () => ((await (await send("GET", "/api/villas/mine", undefined, a.owner.cookie)).json()) as { public: boolean }).public;
    expect(await get()).toBe(false);
    await setPublic(a.owner, a.id, true);
    expect(await get()).toBe(true);
  });

  it("listed_in_slot_order", async () => {
    const a = await villaWith(0, "순서1");
    const b = await villaWith(0, "순서2");
    await setPublic(a.owner, a.id, true);
    await setPublic(b.owner, b.id, true);
    const slots = (await cityOf(a.owner)).villas.map((v: CityVilla) => v.slot);
    expect(slots).toEqual([...slots].sort((x, y) => x - y));
  });
});
