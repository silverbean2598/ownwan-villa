import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { settle } from "../cron/settle";
import { kstDay } from "../../shared/rules/day";

let n = 0;
const send = (method: string, path: string, cookie?: string, body?: unknown) =>
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
  const username = `ev${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await send("POST", "/api/signup", undefined, { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  // 정산 대상이 되도록 가입 시각을 과거로
  await env.DB.prepare("UPDATE users SET created_at = 0 WHERE id = ?").bind(row!.id).run();
  return { id: row!.id, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;
const HASHES = ["0000000000000000", "ffffffffffffffff", "00000000ffffffff", "ffffffff00000000", "0f0f0f0f0f0f0f0f"];
let h = 0;
function upload(u: U, dhash = HASHES[h++ % HASHES.length]) {
  const fd = new FormData();
  const bytes = new Uint8Array(1000).fill(7);
  bytes.set([0xff, 0xd8, 0xff]);
  fd.set("file", new File([bytes], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", dhash);
  return app.request("/api/certs/photo", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env);
}
async function createVilla(u: U, name = "우리빌라") {
  return (await (await send("POST", "/api/villas", u.cookie, { name })).json()) as { id: string; inviteToken: string };
}
// 사용자 연속 기록과 지금 사는 빌라의 연속 기록을 함께 (빌라 1곳에만 살던 기존 데이터와 같은 모양)
const setStreak = (u: U, streak: number) =>
  env.DB.batch([
    env.DB.prepare("UPDATE users SET streak = ? WHERE id = ?").bind(streak, u.id),
    env.DB.prepare("UPDATE memberships SET streak = ? WHERE user_id = ? AND left_at IS NULL").bind(streak, u.id),
  ]);
type Ev = { id: string; type: string; payload: Record<string, unknown>; createdAt: number };
const events = async (u: U) => (await (await send("GET", "/api/events", u.cookie)).json()) as Ev[];
const ofType = async (u: U, type: string) => (await events(u)).filter((e) => e.type === type);
/** 다른 테스트가 남긴 이벤트와 섞이지 않게: 그 사용자 이벤트를 모두 본 것으로 */
async function clear(u: U) {
  const ids = (await events(u)).map((e) => e.id);
  if (ids.length) await send("POST", "/api/events/seen", u.cookie, { ids });
}

const T0 = Date.parse("2026-11-18T10:00:00+09:00");
afterEach(() => setNow(null));

describe("GET /api/events", () => {
  it("requires_login", async () => {
    expect((await send("GET", "/api/events")).status).toBe(401);
    expect((await send("POST", "/api/events/seen", undefined, { ids: [] })).status).toBe(401);
  });

  it("new_user_has_none", async () => {
    expect(await events(await signup())).toEqual([]);
  });
});

describe("GET /api/me certifiedToday (밤 알림용)", () => {
  it("false_until_a_certifying_photo_today", async () => {
    setNow(() => T0);
    const u = await signup();
    const me = async () => ((await (await send("GET", "/api/me", u.cookie)).json()) as { certifiedToday: boolean }).certifiedToday;
    expect(await me()).toBe(false);
    await send("POST", "/api/certs/routine", u.cookie, { body: "스쿼트" });
    expect(await me()).toBe(false);
    await upload(u);
    expect(await me()).toBe(true);
    setNow(() => T0 + 86_400_000);
    expect(await me()).toBe(false);
  });
});

describe("cert events", () => {
  it("certified_once_on_first_certifying_photo_with_points", async () => {
    setNow(() => T0);
    const u = await signup();
    await upload(u);
    await upload(u);
    const got = await ofType(u, "certified");
    expect(got).toHaveLength(1);
    expect(got[0].payload).toEqual({ points: 20 });
  });

  it("duplicate_photo_makes_no_certified_event", async () => {
    setNow(() => T0 - 86_400_000);
    const u = await signup();
    await upload(u, HASHES[0]);
    await clear(u);
    setNow(() => T0);
    await upload(u, HASHES[0]);
    expect(await ofType(u, "certified")).toEqual([]);
  });

  it("deleting_and_reuploading_does_not_repeat_certified", async () => {
    setNow(() => T0);
    const u = await signup();
    const { certId } = (await (await upload(u)).json()) as { certId: string };
    await env.DB.prepare("UPDATE certs SET deleted = 1 WHERE id = ?").bind(certId).run();
    await upload(u);
    expect(await ofType(u, "certified")).toHaveLength(1);
  });

  it("routine_makes_no_event", async () => {
    const u = await signup();
    await send("POST", "/api/certs/routine", u.cookie, { body: "스쿼트" });
    expect(await events(u)).toEqual([]);
  });

  it("no_streak6_without_villa_since_there_is_no_floor_to_climb", async () => {
    setNow(() => T0);
    const u = await signup();
    await setStreak(u, 5);
    await upload(u);
    expect((await events(u)).map((e) => e.type)).toEqual(["certified"]);
  });

  it("streak6_once_when_today_makes_six", async () => {
    setNow(() => T0);
    const u = await signup();
    await createVilla(u);
    await clear(u);
    await setStreak(u, 5);
    await upload(u);
    await upload(u);
    const got = await ofType(u, "streak6");
    expect(got).toHaveLength(1);
    expect(got[0].payload).toMatchObject({ streak: 6, villaName: "우리빌라", multi: false });
    expect(await ofType(u, "streak7")).toEqual([]);
  });

  it("streak7_without_villa_has_no_floor_up", async () => {
    setNow(() => T0);
    const u = await signup();
    await setStreak(u, 13);
    await upload(u);
    await upload(u);
    const got = await ofType(u, "streak7");
    expect(got).toHaveLength(1);
    expect(got[0].payload).toEqual({ streak: 14 });
    expect(await ofType(u, "floor_up")).toEqual([]);
  });

  it("seventh_day_in_villa_is_one_floor_up_event_carrying_the_streak", async () => {
    setNow(() => T0);
    const u = await signup();
    await createVilla(u);
    await clear(u);
    await setStreak(u, 6);
    await upload(u);
    await upload(u);
    const up = await ofType(u, "floor_up");
    expect(up).toHaveLength(1);
    expect(up[0].payload).toMatchObject({ floor: 2, streak: 7, villaName: "우리빌라", multi: false });
    expect(await ofType(u, "streak7")).toEqual([]);
    expect(await ofType(u, "streak6")).toEqual([]);
  });

  it("ordinary_day_makes_only_certified", async () => {
    setNow(() => T0);
    const u = await signup();
    await setStreak(u, 2);
    await upload(u);
    expect((await events(u)).map((e) => e.type)).toEqual(["certified"]);
  });
});

describe("penthouse events", () => {
  it("in_for_new_holder_and_out_for_previous_holder_once", async () => {
    let t = T0;
    // 시각이 같으면 1등 동점 처리가 순서에 따라 달라지므로 호출마다 1ms씩 흐르게
    setNow(() => (t += 1));
    const a = await signup("에이");
    const b = await signup("비비");
    const v = await createVilla(a);
    await send("POST", `/api/invite/${v.inviteToken}/join`, b.cookie);
    await clear(a);
    await clear(b);
    await setStreak(b, 3);
    await upload(b);
    await upload(b);
    const inB = await ofType(b, "penthouse_in");
    expect(inB).toHaveLength(1);
    const outA = await ofType(a, "penthouse_out");
    expect(outA).toHaveLength(1);
    expect(outA[0].payload).toMatchObject({ nickname: "비비" });
    expect(await ofType(a, "penthouse_in")).toEqual([]);
    expect(await ofType(b, "penthouse_out")).toEqual([]);
  });

  it("no_events_when_holder_unchanged", async () => {
    let t = T0;
    // 시각이 같으면 1등 동점 처리가 순서에 따라 달라지므로 호출마다 1ms씩 흐르게
    setNow(() => (t += 1));
    const a = await signup();
    const b = await signup();
    const v = await createVilla(a);
    await send("POST", `/api/invite/${v.inviteToken}/join`, b.cookie);
    await clear(a);
    await clear(b);
    await upload(a);
    await upload(b);
    for (const u of [a, b]) {
      const types = (await events(u)).map((e) => e.type);
      expect(types).not.toContain("penthouse_in");
      expect(types).not.toContain("penthouse_out");
    }
  });

  it("holder_leaving_gives_in_to_successor_and_no_out_to_leaver", async () => {
    let t = T0;
    // 시각이 같으면 1등 동점 처리가 순서에 따라 달라지므로 호출마다 1ms씩 흐르게
    setNow(() => (t += 1));
    const a = await signup();
    const b = await signup();
    const v = await createVilla(a);
    await send("POST", `/api/invite/${v.inviteToken}/join`, b.cookie);
    await clear(a);
    await clear(b);
    await send("POST", "/api/villas/leave", a.cookie, {});
    expect(await ofType(b, "penthouse_in")).toHaveLength(1);
    expect(await ofType(a, "penthouse_out")).toEqual([]);
  });
});

describe("villa join events", () => {
  it("welcome_on_create", async () => {
    const a = await signup();
    await createVilla(a, "땀빌라");
    const got = await ofType(a, "welcome");
    expect(got).toHaveLength(1);
    expect(got[0].payload).toMatchObject({ villaName: "땀빌라", multi: false });
  });

  it("join_welcomes_joiner_and_tells_every_other_member_once", async () => {
    const a = await signup("에이");
    const b = await signup("비비");
    const c = await signup("씨씨");
    const v = await createVilla(a, "땀빌라");
    await send("POST", `/api/invite/${v.inviteToken}/join`, b.cookie);
    await clear(a);
    await clear(b);
    await send("POST", `/api/invite/${v.inviteToken}/join`, c.cookie);
    // 같은 링크를 다시 열어도 다시 알리지 않는다
    await send("POST", `/api/invite/${v.inviteToken}/join`, c.cookie);
    const w = await ofType(c, "welcome");
    expect(w).toHaveLength(1);
    expect(w[0].payload).toMatchObject({ villaName: "땀빌라", multi: false });
    expect(await ofType(c, "friend_joined")).toEqual([]);
    for (const u of [a, b]) {
      const f = await ofType(u, "friend_joined");
      expect(f).toHaveLength(1);
      expect(f[0].payload).toMatchObject({ nickname: "씨씨", avatar: { skin: 0, hair: "short", shirt: 4 } });
    }
  });
});

describe("settle events", () => {
  it("floor_down_once_when_midnight_settle_lowers_floor", async () => {
    setNow(() => T0);
    const u = await signup();
    await createVilla(u);
    await clear(u);
    await env.DB.prepare("UPDATE memberships SET floor = 3, joined_at = 0 WHERE user_id = ?").bind(u.id).run();
    const day = "2026-11-17";
    await env.DB.prepare("DELETE FROM settings WHERE key = 'last_settled_day'").run();
    await settle(env, day);
    await settle(env, day);
    const got = (await ofType(u, "floor_down"));
    expect(got).toHaveLength(1);
    expect(got[0].payload).toMatchObject({ floor: 2, villaName: "우리빌라", multi: false });
  });
});

describe("shop events", () => {
  it("bought_with_item_name", async () => {
    const u = await signup();
    await env.DB.prepare("UPDATE users SET points = 500 WHERE id = ?").bind(u.id).run();
    await send("POST", "/api/shop/buy", u.cookie, { itemId: "plant" });
    await send("POST", "/api/shop/buy", u.cookie, { itemId: "plant" });
    const got = await ofType(u, "bought");
    expect(got).toHaveLength(1);
    expect(got[0].payload).toEqual({ itemId: "plant", itemName: "화분" });
  });
});

describe("seen flow", () => {
  it("oldest_first_then_seen_hides_them_and_only_mine_are_marked", async () => {
    setNow(() => T0);
    const a = await signup();
    const b = await signup();
    await createVilla(a, "하나");
    await upload(a);
    const list = await events(a);
    expect(list.map((e) => e.type)).toEqual(["welcome", "certified"]);
    // 남의 이벤트 id로는 바꿀 수 없다
    expect((await send("POST", "/api/events/seen", b.cookie, { ids: list.map((e) => e.id) })).status).toBe(200);
    expect(await events(a)).toHaveLength(2);
    expect((await send("POST", "/api/events/seen", a.cookie, { ids: [list[0].id] })).status).toBe(200);
    expect((await events(a)).map((e) => e.id)).toEqual([list[1].id]);
  });

  it("rejects_bad_body", async () => {
    const a = await signup();
    expect((await send("POST", "/api/events/seen", a.cookie, { ids: "x" })).status).toBe(400);
    expect((await send("POST", "/api/events/seen", a.cookie, { ids: [1] })).status).toBe(400);
  });

  it("returns_at_most_20", async () => {
    const a = await signup();
    const stmts = Array.from({ length: 25 }, (_, i) =>
      env.DB.prepare("INSERT INTO events (id, user_id, type, payload, created_at) VALUES (?, ?, 'bought', '{}', ?)").bind(`x${a.id}${i}`, a.id, i),
    );
    await env.DB.batch(stmts);
    const got = await events(a);
    expect(got).toHaveLength(20);
    expect(got[0].createdAt).toBe(0);
  });
});

describe("safety", () => {
  it("main_actions_still_work_when_event_writes_fail", async () => {
    setNow(() => T0);
    const a = await signup();
    const b = await signup();
    await env.DB.prepare("UPDATE users SET points = 500 WHERE id = ?").bind(a.id).run();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.prepare("ALTER TABLE events RENAME TO events_off").run();
    try {
      const v = await createVilla(a);
      expect(v.inviteToken).toBeTruthy();
      expect((await send("POST", `/api/invite/${v.inviteToken}/join`, b.cookie)).status).toBe(200);
      const r = await upload(a);
      expect(r.status).toBe(200);
      expect(((await r.json()) as { points: number }).points).toBe(20);
      expect((await send("POST", "/api/shop/buy", a.cookie, { itemId: "plant" })).status).toBe(200);
      expect((await send("POST", "/api/villas/leave", a.cookie, {})).status).toBe(200);
      await env.DB.prepare("DELETE FROM settings WHERE key = 'last_settled_day'").run();
      expect(await settle(env, kstDay(T0 - 86_400_000))).toEqual({ settled: true });
    } finally {
      await env.DB.prepare("ALTER TABLE events_off RENAME TO events").run();
      spy.mockRestore();
    }
  });

  it("account_deletion_removes_my_events", async () => {
    const a = await signup();
    await createVilla(a);
    expect((await events(a)).length).toBeGreaterThan(0);
    expect((await send("DELETE", "/api/me", a.cookie)).status).toBe(200);
    const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = ?").bind(a.id).first<{ c: number }>();
    expect(c!.c).toBe(0);
  });
});
