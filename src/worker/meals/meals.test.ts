import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { urlOf, categoryOf } from "../push/service";
import { kstDay, prevDay } from "../../shared/rules/day";

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
async function signup(nickname = "먹방러") {
  const username = `ml${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await send("POST", "/api/signup", undefined, { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie, nickname };
}
type U = Awaited<ReturnType<typeof signup>>;
async function villaOf(owner: U, ...members: U[]) {
  const v = (await (await send("POST", "/api/villas", owner.cookie, { name: "식당아파트" })).json()) as { id: string; inviteToken: string };
  for (const m of members) await send("POST", `/api/invite/${v.inviteToken}/join`, m.cookie, {});
  return v;
}

// 서로 멀리 떨어진 해시들 (해밍거리 > 5)
const HASHES = ["0000000000000000", "ffffffffffffffff", "00000000ffffffff", "ffffffff00000000", "0f0f0f0f0f0f0f0f", "f0f0f0f0f0f0f0f0", "3333333333333333", "cccccccccccccccc"];
let hi = 0;
const freshHash = () => HASHES[hi++ % HASHES.length];

function mealForm(opts: { mealType?: string; memo?: string; villaIds?: unknown; dhash?: string; file?: boolean } = {}) {
  const fd = new FormData();
  if (opts.file !== false) {
    const bytes = new Uint8Array(400).fill(3);
    bytes.set([0xff, 0xd8, 0xff]);
    fd.set("file", new File([bytes], "m.jpg", { type: "image/jpeg" }));
    fd.set("dhash", opts.dhash ?? freshHash());
  }
  if (opts.mealType !== undefined) fd.set("mealType", opts.mealType);
  if (opts.memo !== undefined) fd.set("memo", opts.memo);
  if (opts.villaIds !== undefined) fd.set("villaIds", JSON.stringify(opts.villaIds));
  return fd;
}
const post = (u: U, fd: FormData) => app.request("/api/meals", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env);
const patch = (u: U, id: string, fd: FormData) => app.request(`/api/meals/${id}`, { method: "PATCH", headers: { cookie: u.cookie }, body: fd }, env);
async function upload(u: U, opts: Parameters<typeof mealForm>[0] = {}) {
  const r = await post(u, mealForm({ mealType: "lunch", ...opts }));
  expect(r.status).toBe(200);
  return (await r.json()) as { mealId: string; points: number; duplicate: boolean; villaIds: string[] };
}
type Meal = { id: string; userId: string; mealType: string; memo: string | null; mine: boolean; cheerCount: number; cheeredByMe: boolean; commentCount: number; photoUrl: string };
const list = async (u: U, villaId: string, day?: string) => {
  const r = await send("GET", `/api/meals?villa=${villaId}${day ? `&day=${day}` : ""}`, u.cookie);
  expect(r.status).toBe(200);
  return ((await r.json()) as { meals: Meal[] }).meals;
};
const points = async (u: U) => (await env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(u.id).first<{ points: number }>())!.points;
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

afterEach(() => setNow(null));

describe("POST /api/meals", () => {
  it("requires_login", async () => {
    expect((await post({ id: "", cookie: "", nickname: "" }, mealForm({ mealType: "lunch" }))).status).toBe(401);
  });

  it("five_points_each_up_to_fifteen_per_kst_day", async () => {
    const T = Date.parse("2026-11-24T12:00:00+09:00");
    setNow(() => T);
    const u = await signup();
    const v = await villaOf(u);
    const before = await points(u);
    expect(((await (await send("GET", `/api/meals?villa=${v.id}`, u.cookie)).json()) as { pointsLeftToday: number }).pointsLeftToday).toBe(15);
    await upload(u);
    expect(((await (await send("GET", `/api/meals?villa=${v.id}`, u.cookie)).json()) as { pointsLeftToday: number }).pointsLeftToday).toBe(10);
    const got = [5];
    for (let i = 0; i < 4; i++) got.push((await upload(u)).points);
    expect(got).toEqual([5, 5, 5, 0, 0]);
    const left = async () => ((await (await send("GET", `/api/meals?villa=${v.id}`, u.cookie)).json()) as { pointsLeftToday: number }).pointsLeftToday;
    expect(await left()).toBe(0);
    expect((await points(u)) - before).toBe(15);
    // 다음 날(KST)이면 다시 받는다
    setNow(() => T + 24 * 3600_000);
    expect((await upload(u)).points).toBe(5);
  });

  it("duplicate_photo_earns_zero_but_is_posted", async () => {
    const u = await signup();
    const v = await villaOf(u);
    const a = await upload(u, { dhash: "0123456789abcdef" });
    expect(a).toMatchObject({ points: 5, duplicate: false });
    // 비트 1개 차이 → 같은 사진
    const b = await upload(u, { dhash: "0123456789abcdee" });
    expect(b).toMatchObject({ points: 0, duplicate: true });
    expect((await list(u, v.id)).map((m) => m.id)).toContain(b.mealId);
  });

  it("cert_photo_reused_as_meal_is_duplicate", async () => {
    const u = await signup();
    await villaOf(u);
    const fd = new FormData();
    const bytes = new Uint8Array(400).fill(9);
    bytes.set([0xff, 0xd8, 0xff]);
    fd.set("file", new File([bytes], "c.jpg", { type: "image/jpeg" }));
    fd.set("dhash", "aaaaaaaaaaaaaaaa");
    expect((await app.request("/api/certs/photo", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env)).status).toBe(200);
    expect(await upload(u, { dhash: "aaaaaaaaaaaaaaaa" })).toMatchObject({ points: 0, duplicate: true });
  });

  it("validates_meal_type_memo_photo_and_villas", async () => {
    const u = await signup();
    const other = await signup();
    await villaOf(u);
    const ov = await villaOf(other);
    expect(await errorOf(await post(u, mealForm({ mealType: "brunch" })))).toBe("끼니를 골라 주세요");
    expect((await post(u, mealForm({}))).status).toBe(400);
    expect((await post(u, mealForm({ mealType: "lunch", memo: "가".repeat(41) }))).status).toBe(400);
    expect((await post(u, mealForm({ mealType: "lunch", memo: "가".repeat(40) }))).status).toBe(200);
    expect(await errorOf(await post(u, mealForm({ mealType: "lunch", file: false })))).toBe("사진을 골라 주세요");
    expect((await post(u, mealForm({ mealType: "lunch", villaIds: [ov.id] }))).status).toBe(403);
    expect((await post(u, mealForm({ mealType: "lunch", villaIds: [] }))).status).toBe(400);
  });

  it("needs_a_villa", async () => {
    const u = await signup();
    expect(await errorOf(await post(u, mealForm({ mealType: "lunch" })))).toBe("아파트에 입주하면 식단을 올릴 수 있어요");
  });

  it("does_not_light_room_or_touch_streak", async () => {
    const u = await signup();
    const v = await villaOf(u);
    await upload(u);
    const me = (await (await send("GET", "/api/me", u.cookie)).json()) as { certifiedToday: boolean; streak: number };
    expect(me).toMatchObject({ certifiedToday: false, streak: 0 });
    const villa = (await (await send("GET", `/api/villas/${v.id}`, u.cookie)).json()) as { members: { userId: string; certifiedToday: boolean }[] };
    expect(villa.members.find((m) => m.userId === u.id)!.certifiedToday).toBe(false);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM certs WHERE user_id = ?").bind(u.id).first<{ n: number }>()).toEqual({ n: 0 });
  });
});

describe("GET /api/meals", () => {
  it("shows_meals_only_in_picked_villas_newest_first", async () => {
    const T = Date.parse("2026-11-24T08:00:00+09:00");
    setNow(() => T);
    const a = await signup("에이");
    const b = await signup("비비");
    const c = await signup("씨씨");
    const v1 = await villaOf(a, b);
    const v2 = (await (await send("POST", "/api/villas", a.cookie, { name: "둘째아파트" })).json()) as { id: string; inviteToken: string };
    await send("POST", `/api/invite/${v2.inviteToken}/join`, c.cookie, {});
    const first = await upload(a, { mealType: "breakfast", memo: "오트밀", villaIds: [v1.id] });
    setNow(() => T + 1000);
    const second = await upload(a, { mealType: "lunch", villaIds: [v1.id, v2.id] });
    const inV1 = await list(b, v1.id);
    expect(inV1.map((m) => m.id)).toEqual([second.mealId, first.mealId]);
    expect(inV1[1]).toMatchObject({ mealType: "breakfast", memo: "오트밀", mine: false, cheerCount: 0, commentCount: 0 });
    expect((await list(a, v1.id))[0].mine).toBe(true);
    expect((await list(c, v2.id)).map((m) => m.id)).toEqual([second.mealId]);
    // 다른 아파트 입주민은 그 아파트 식당을 못 연다
    expect((await send("GET", `/api/meals?villa=${v1.id}`, c.cookie)).status).toBe(403);
    // 사진도 같은 규칙
    expect((await send("GET", `/api/meals/${first.mealId}/photo`, b.cookie)).status).toBe(200);
    expect((await send("GET", `/api/meals/${first.mealId}/photo`, c.cookie)).status).toBe(403);
    expect((await send("GET", `/api/meals/${second.mealId}/photo`, c.cookie)).status).toBe(200);
  });

  it("author_who_left_the_villa_disappears_from_it", async () => {
    const a = await signup();
    const b = await signup();
    const v = await villaOf(b, a);
    const m = await upload(a);
    expect((await list(b, v.id)).map((x) => x.id)).toEqual([m.mealId]);
    await send("POST", `/api/villas/${v.id}/leave`, a.cookie, {});
    expect(await list(b, v.id)).toEqual([]);
    expect((await send("GET", `/api/meals/${m.mealId}/photo`, b.cookie)).status).toBe(403);
  });

  it("day_window_is_last_seven_kst_days", async () => {
    const T = Date.parse("2026-11-24T09:00:00+09:00");
    setNow(() => T - 2 * 24 * 3600_000);
    const u = await signup();
    const v = await villaOf(u);
    const old = await upload(u);
    setNow(() => T);
    const today = kstDay(T);
    expect(await list(u, v.id)).toEqual([]);
    expect((await list(u, v.id, prevDay(prevDay(today)))).map((m) => m.id)).toEqual([old.mealId]);
    let d = today;
    for (let i = 0; i < 6; i++) d = prevDay(d);
    expect((await send("GET", `/api/meals?villa=${v.id}&day=${d}`, u.cookie)).status).toBe(200);
    expect((await send("GET", `/api/meals?villa=${v.id}&day=${prevDay(d)}`, u.cookie)).status).toBe(400);
    expect((await send("GET", `/api/meals?villa=${v.id}&day=2026-11-25`, u.cookie)).status).toBe(400);
    expect((await send("GET", `/api/meals?villa=${v.id}&day=bad`, u.cookie)).status).toBe(400);
  });
});

describe("PATCH /api/meals/:id", () => {
  it("author_changes_type_memo_and_photo_only", async () => {
    const a = await signup();
    const b = await signup();
    const v = await villaOf(a, b);
    const m = await upload(a, { mealType: "lunch", memo: "샐러드" });
    const fd = new FormData();
    fd.set("mealType", "dinner");
    fd.set("memo", "  닭가슴살  ");
    const r = await patch(a, m.mealId, fd);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ mealType: "dinner", memo: "닭가슴살" });
    const after = (await list(b, v.id))[0];
    expect(after).toMatchObject({ mealType: "dinner", memo: "닭가슴살" });
    // 사진 바꾸기: 주소의 버전이 바뀌고 포인트는 그대로
    const p0 = await points(a);
    const photo = mealForm({ dhash: freshHash() });
    const r2 = await patch(a, m.mealId, photo);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { photoUrl: string }).photoUrl).not.toBe(after.photoUrl);
    expect(await points(a)).toBe(p0);
    expect((await send("GET", `/api/meals/${m.mealId}/photo`, b.cookie)).status).toBe(200);
    // 메모를 비우면 지운다
    const clear = new FormData();
    clear.set("memo", "");
    expect(await (await patch(a, m.mealId, clear)).json()).toMatchObject({ memo: null, mealType: "dinner" });
  });

  it("others_cannot_edit_and_bad_values_rejected", async () => {
    const a = await signup();
    const b = await signup();
    const stranger = await signup();
    await villaOf(a, b);
    await villaOf(stranger);
    const m = await upload(a);
    const fd = new FormData();
    fd.set("memo", "몰래");
    expect((await patch(b, m.mealId, fd)).status).toBe(403);
    expect((await patch(stranger, m.mealId, fd)).status).toBe(404);
    const bad = new FormData();
    bad.set("mealType", "brunch");
    expect((await patch(a, m.mealId, bad)).status).toBe(400);
    const long = new FormData();
    long.set("memo", "a".repeat(41));
    expect((await patch(a, m.mealId, long)).status).toBe(400);
  });
});

describe("DELETE /api/meals/:id", () => {
  it("author_only_and_reverses_points", async () => {
    const T = Date.parse("2026-11-24T13:00:00+09:00");
    setNow(() => T);
    const a = await signup();
    const b = await signup();
    const v = await villaOf(a, b);
    const p0 = await points(a);
    const ms = [await upload(a), await upload(a), await upload(a)];
    expect((await points(a)) - p0).toBe(15);
    expect((await send("DELETE", `/api/meals/${ms[0].mealId}`, b.cookie)).status).toBe(403);
    const r = await send("DELETE", `/api/meals/${ms[0].mealId}`, a.cookie);
    expect(await r.json()).toEqual({ ok: true, refunded: 5 });
    expect((await points(a)) - p0).toBe(10);
    // 두 번 지워도 한 번만 뺀다
    expect((await send("DELETE", `/api/meals/${ms[0].mealId}`, a.cookie)).status).toBe(404);
    expect((await points(a)) - p0).toBe(10);
    expect((await list(b, v.id)).map((m) => m.id)).not.toContain(ms[0].mealId);
    expect((await send("GET", `/api/meals/${ms[0].mealId}/photo`, a.cookie)).status).toBe(404);
    // 되돌린 만큼은 다시 받을 수 있다 (상한은 그대로 15P)
    expect((await upload(a)).points).toBe(5);
    expect((await upload(a)).points).toBe(0);
    expect((await points(a)) - p0).toBe(15);
  });

  it("spent_points_cannot_be_farmed_by_delete_and_reupload", async () => {
    const a = await signup();
    await villaOf(a);
    const m = await upload(a);
    await env.DB.prepare("UPDATE users SET points = 2 WHERE id = ?").bind(a.id).run();
    expect(await (await send("DELETE", `/api/meals/${m.mealId}`, a.cookie)).json()).toEqual({ ok: true, refunded: 2 });
    expect(await points(a)).toBe(0);
    // 못 뺀 3P 는 오늘 받은 것으로 계속 센다: 남은 상한 12P
    expect([(await upload(a)).points, (await upload(a)).points, (await upload(a)).points]).toEqual([5, 5, 2]);
  });
});

describe("meal cheers and comments", () => {
  it("cheer_toggle_and_notify_owner_once", async () => {
    const a = await signup("작가");
    const b = await signup("이웃");
    const stranger = await signup();
    const v = await villaOf(a, b);
    await villaOf(stranger);
    const m = await upload(a);
    expect((await send("POST", `/api/meals/${m.mealId}/cheer`, a.cookie)).status).toBe(400);
    expect((await send("POST", `/api/meals/${m.mealId}/cheer`, stranger.cookie)).status).toBe(403);
    expect(await (await send("POST", `/api/meals/${m.mealId}/cheer`, b.cookie)).json()).toEqual({ cheered: true, count: 1 });
    expect((await list(b, v.id))[0]).toMatchObject({ cheerCount: 1, cheeredByMe: true });
    expect(await (await send("POST", `/api/meals/${m.mealId}/cheer`, b.cookie)).json()).toEqual({ cheered: false, count: 0 });
    await send("POST", `/api/meals/${m.mealId}/cheer`, b.cookie);
    const evs = ((await (await send("GET", "/api/events", a.cookie)).json()) as { type: string; payload: Record<string, unknown> }[]).filter((e) => e.type === "cheered");
    expect(evs).toHaveLength(1);
    expect(evs[0].payload).toMatchObject({ nickname: "이웃", mealId: m.mealId, villaId: v.id });
    // 푸시: 인증 응원과 같은 종류(cheer → 같은 알림 설정)로, 누르면 그 아파트 · 그날 식당
    const e = { userId: a.id, type: "cheered" as const, payload: evs[0].payload };
    expect(categoryOf(e)).toBe("cheer");
    expect(urlOf(e)).toBe(`/meals?villa=${v.id}&day=${evs[0].payload.day}`);
  });

  it("comments_crud_and_notify", async () => {
    const a = await signup("작가");
    const b = await signup("이웃");
    const c = await signup("셋째");
    const v = await villaOf(a, b, c);
    const m = await upload(a);
    const r = await send("POST", `/api/meals/${m.mealId}/comments`, b.cookie, { body: "맛있겠다" });
    expect(r.status).toBe(200);
    const cm = (await r.json()) as { id: string; canDelete: boolean };
    expect((await send("POST", `/api/meals/${m.mealId}/comments`, b.cookie, { body: "" })).status).toBe(400);
    expect((await list(c, v.id))[0].commentCount).toBe(1);
    const asC = (await (await send("GET", `/api/meals/${m.mealId}/comments`, c.cookie)).json()) as { canDelete: boolean }[];
    expect(asC[0].canDelete).toBe(false);
    const asA = (await (await send("GET", `/api/meals/${m.mealId}/comments`, a.cookie)).json()) as { canDelete: boolean }[];
    expect(asA[0].canDelete).toBe(true);
    const evs = ((await (await send("GET", "/api/events", a.cookie)).json()) as { id: string; type: string; payload: Record<string, unknown> }[]).filter((e) => e.type === "commented");
    expect(evs.map((e) => e.payload.body)).toEqual(["맛있겠다"]);
    expect((await send("DELETE", `/api/meal-comments/${cm.id}`, c.cookie)).status).toBe(403);
    expect((await send("DELETE", `/api/meal-comments/${cm.id}`, b.cookie)).status).toBe(200);
    // 댓글을 지우면 알림도 사라진다
    expect(((await (await send("GET", "/api/events", a.cookie)).json()) as { type: string }[]).filter((e) => e.type === "commented")).toEqual([]);
  });

  it("deleting_meal_removes_cheers_comments_and_their_events", async () => {
    const a = await signup();
    const b = await signup();
    await villaOf(a, b);
    const m = await upload(a);
    await send("POST", `/api/meals/${m.mealId}/cheer`, b.cookie);
    await send("POST", `/api/meals/${m.mealId}/comments`, b.cookie, { body: "굿" });
    await send("DELETE", `/api/meals/${m.mealId}`, a.cookie);
    const count = async (sql: string) => (await env.DB.prepare(sql).bind(m.mealId).first<{ n: number }>())!.n;
    expect(await count("SELECT COUNT(*) AS n FROM meal_cheers WHERE meal_id = ?")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM meal_comments WHERE meal_id = ?")).toBe(0);
    expect(((await (await send("GET", "/api/events", a.cookie)).json()) as { type: string }[]).filter((e) => e.type === "cheered" || e.type === "commented")).toEqual([]);
  });
});

describe("withdrawal", () => {
  it("removes_my_meals_and_my_meal_comments", async () => {
    const a = await signup();
    const b = await signup();
    await villaOf(b, a);
    const mine = await upload(a);
    const theirs = await upload(b);
    await send("POST", `/api/meals/${theirs.mealId}/comments`, a.cookie, { body: "안녕" });
    await send("POST", `/api/meals/${theirs.mealId}/cheer`, a.cookie);
    expect((await send("DELETE", "/api/me", a.cookie)).status).toBe(200);
    const n = async (sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())!.n;
    expect(await n("SELECT COUNT(*) AS n FROM meals WHERE user_id = ?", a.id)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM meal_villas WHERE meal_id = ?", mine.mealId)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM meal_comments WHERE user_id = ?", a.id)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM meal_cheers WHERE user_id = ?", a.id)).toBe(0);
  });
});
