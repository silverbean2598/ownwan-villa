import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { settle } from "../cron/settle";
import { certTestHooks } from "../cert/routes";
import { nextDay } from "../../shared/rules/day";
import { VILLA_LIMIT_MSG } from "../../shared/villa";

// 여러 아파트에 살기 [확정 — 기획자 결정, 2026-11-19]

let n = 0;
const uname = () => `mv${Date.now().toString(36)}${n++}`.slice(0, 16);
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
  // 밀린 날 정산 대상이 되도록 가입 시각을 앞으로
  await env.DB.prepare("UPDATE users SET created_at = 0 WHERE id = ?").bind(row!.id).run();
  return { id: row!.id, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;
async function create(u: U, name = "아파트") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const get = async <T = any>(u: U, path: string) => (await (await send("GET", path, undefined, u.cookie)).json()) as T;
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;
const active = async (villaId: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE villa_id = ? AND left_at IS NULL").bind(villaId).first<{ c: number }>())!.c;

function upload(u: U, villaIds?: string[], dhash = `${(n++).toString(16).padStart(4, "0")}`.repeat(4)) {
  const fd = new FormData();
  const bytes = new Uint8Array(500).fill(7);
  bytes.set([0xff, 0xd8, 0xff]);
  fd.set("file", new File([bytes], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", dhash);
  if (villaIds) fd.set("villaIds", JSON.stringify(villaIds));
  return app.request("/api/certs/photo", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env);
}
const points = async (u: U) => (await env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(u.id).first<{ points: number }>())!.points;
const linked = async (certId: string) =>
  (await env.DB.prepare("SELECT villa_id AS id FROM cert_villas WHERE cert_id = ? ORDER BY villa_id").bind(certId).all<{ id: string }>()).results.map((r) => r.id).sort();
const memberOf = async (u: U, viewer: U, villaId: string) =>
  (await get(viewer, `/api/villas/${villaId}`)).members.find((m: any) => m.userId === u.id);
const membership = (u: U, villaId: string) =>
  env.DB.prepare("SELECT floor, streak, miss_run AS missRun, floor_reached_at AS at FROM memberships WHERE user_id = ? AND villa_id = ? AND left_at IS NULL")
    .bind(u.id, villaId)
    .first<{ floor: number; streak: number; missRun: number; at: number }>();

/** 사진 인증 한 장을 고른 아파트에만 직접 넣는다 (아파트 행을 먼저 넣어 안전망 트리거가 모든 아파트에 올리지 않게) */
async function certInto(u: U, day: string, villaIds: string[], at = 1000) {
  const id = crypto.randomUUID();
  await env.DB.batch([
    ...villaIds.map((v) => env.DB.prepare("INSERT INTO cert_villas (cert_id, villa_id, created_at) VALUES (?, ?, ?)").bind(id, v, at)),
    env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES (?, ?, ?, 'photo', 20, 0, ?)").bind(id, u.id, day, at),
  ]);
  return id;
}

/** 아파트 두 곳(A, B)에 사는 u. A 에는 a, B 에는 b 가 함께 산다 */
async function twoVillas() {
  const a = await signup("에이");
  const b = await signup("비이");
  const u = await signup("나야나");
  const A = await create(a, "에이아파트");
  const B = await create(b, "비아파트");
  expect((await join(u, A.inviteToken)).status).toBe(200);
  expect((await join(u, B.inviteToken)).status).toBe(200);
  // 정산 대상이 되도록 입주 시각을 앞으로
  await env.DB.prepare("UPDATE memberships SET joined_at = 0 WHERE user_id IN (?, ?, ?)").bind(a.id, b.id, u.id).run();
  return { a, b, u, A: A.id, B: B.id, tokenA: A.inviteToken, tokenB: B.inviteToken };
}

afterEach(() => {
  setNow(null);
  certTestHooks.beforeWrite = undefined;
});

describe("아파트 3곳까지", () => {
  it("join_up_to_three_fourth_refused_then_leave_one_frees_a_slot", async () => {
    const u = await signup();
    const vs = [];
    for (let i = 0; i < 4; i++) vs.push(await create(await signup(), `아파트${i}`));
    for (let i = 0; i < 3; i++) expect((await join(u, vs[i].inviteToken)).status).toBe(200);
    const preview = await get(u, `/api/invite/${vs[3].inviteToken}`);
    expect(preview).toMatchObject({ alreadyMember: false, myVillaCount: 3, atLimit: true });
    const r = await join(u, vs[3].inviteToken);
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe(VILLA_LIMIT_MSG);
    expect(await active(vs[3].id)).toBe(1);

    const mine = await get<any[]>(u, "/api/me/villas");
    expect(mine.map((v) => v.name)).toEqual(["아파트0", "아파트1", "아파트2"]);
    expect(mine[0]).toMatchObject({ memberCount: 2, public: false, certifiedToday: false });

    // 한 곳을 나가도 다른 아파트는 그대로, 그리고 새 아파트에 들어올 수 있다
    expect((await send("POST", `/api/villas/${vs[1].id}/leave`, undefined, u.cookie)).status).toBe(200);
    expect(await active(vs[0].id)).toBe(2);
    expect(await active(vs[2].id)).toBe(2);
    expect((await join(u, vs[3].inviteToken)).status).toBe(200);
    expect((await get<any[]>(u, "/api/me/villas")).map((v) => v.name)).toEqual(["아파트0", "아파트2", "아파트3"]);
  });

  it("creating_counts_toward_three", async () => {
    const u = await signup();
    const x = await create(await signup());
    const y = await create(await signup());
    await join(u, x.inviteToken);
    await join(u, y.inviteToken);
    await create(u, "내아파트");
    const r = await send("POST", "/api/villas", { name: "넷째" }, u.cookie);
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe(VILLA_LIMIT_MSG);
    const z = await create(await signup());
    expect(await errorOf(await join(u, z.inviteToken))).toBe(VILLA_LIMIT_MSG);
  });

  it("concurrent_joins_never_exceed_three", async () => {
    for (let k = 0; k < 3; k++) {
      const u = await signup();
      const vs = [];
      for (let i = 0; i < 4; i++) vs.push(await create(await signup()));
      await join(u, vs[0].inviteToken);
      await join(u, vs[1].inviteToken);
      const rs = await Promise.all([join(u, vs[2].inviteToken), join(u, vs[3].inviteToken)]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await get<any[]>(u, "/api/me/villas")).length).toBe(3);
    }
  });

  it("old_leave_route_needs_a_villa_when_living_in_several", async () => {
    const { u, A, B } = await twoVillas();
    const r = await send("POST", "/api/villas/leave", {}, u.cookie);
    expect(r.status).toBe(400);
    expect((await send("POST", "/api/villas/leave", { villaId: B }, u.cookie)).status).toBe(200);
    expect(await active(A)).toBe(2);
    // 이제 1곳뿐이라 예전처럼 villaId 없이 나갈 수 있다
    expect((await send("POST", "/api/villas/leave", {}, u.cookie)).status).toBe(200);
    expect(await active(A)).toBe(1);
  });

  it("villa_detail_is_members_only_and_old_mine_returns_first_villa", async () => {
    const { a, u, A, B } = await twoVillas();
    expect((await send("GET", `/api/villas/${B}`, undefined, a.cookie)).status).toBe(404);
    expect((await get(u, `/api/villas/${B}`)).name).toBe("비아파트");
    expect((await get(u, "/api/villas/mine")).id).toBe(A);
  });
});

describe("인증은 고른 아파트에만", () => {
  it("photo_goes_only_to_chosen_villa_and_points_once", async () => {
    const { a, b, u, A, B } = await twoVillas();
    const r = await upload(u, [A]);
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body).toMatchObject({ points: 20, certifiedToday: true, villaIds: [A] });
    expect(await linked(body.certId)).toEqual([A]);
    expect(await points(u)).toBe(20);
    // A 에서는 불이 켜지고 B 에서는 꺼져 있다 (어디선가 인증은 했다)
    expect(await memberOf(u, a, A)).toMatchObject({ certifiedToday: true, certifiedAnywhere: true });
    expect(await memberOf(u, b, B)).toMatchObject({ certifiedToday: false, certifiedAnywhere: true });
    const mine = await get<any[]>(u, "/api/me/villas");
    expect(Object.fromEntries(mine.map((v) => [v.id, v.certifiedToday]))).toEqual({ [A]: true, [B]: false });
  });

  it("member_of_other_villa_cannot_see_photo_posted_only_to_A", async () => {
    const { a, b, u, A, B } = await twoVillas();
    const { certId } = (await (await upload(u, [A])).json()) as any;
    expect((await send("GET", `/api/photos/${certId}`, undefined, a.cookie)).status).toBe(200);
    expect((await send("GET", `/api/photos/${certId}`, undefined, b.cookie)).status).toBe(403);
    // b 는 u 의 게시판은 열 수 있지만(같은 아파트 B) A 에만 올린 기록은 없다
    expect(await get(b, `/api/users/${u.id}/board`)).toEqual([]);
    expect(await get(b, `/api/users/${u.id}/board?villa=${B}`)).toEqual([]);
    expect((await get<any[]>(a, `/api/users/${u.id}/board?villa=${A}`)).map((x) => x.id)).toEqual([certId]);
    // 남의 아파트를 골라 보거나 응원 · 댓글 · 신고도 막힌다
    expect((await send("GET", `/api/users/${u.id}/board?villa=${A}`, undefined, b.cookie)).status).toBe(403);
    expect((await send("POST", `/api/certs/${certId}/cheer`, undefined, b.cookie)).status).toBe(403);
    expect((await send("POST", `/api/certs/${certId}/report`, undefined, b.cookie)).status).toBe(403);
    // 본인은 아파트를 고르지 않으면 내 기록 전부, B 를 고르면 B 에 올린 것만
    expect((await get<any[]>(u, `/api/users/${u.id}/board`)).length).toBe(1);
    expect(await get(u, `/api/users/${u.id}/board?villa=${B}`)).toEqual([]);
  });

  it("owner_of_B_cannot_delete_a_cert_posted_only_to_A_but_owner_of_A_can_and_it_leaves_both", async () => {
    const { a, b, u, A, B } = await twoVillas();
    const { certId } = (await (await upload(u, [A])).json()) as any;
    expect((await send("DELETE", `/api/certs/${certId}`, undefined, b.cookie)).status).toBe(403);
    await send("POST", "/api/certs/today/villas", { villaIds: [B] }, u.cookie);
    expect((await send("DELETE", `/api/certs/${certId}`, undefined, a.cookie)).status).toBe(200);
    expect(await get(b, `/api/users/${u.id}/board?villa=${B}`)).toEqual([]);
    expect(await memberOf(u, b, B)).toMatchObject({ certifiedToday: false, certifiedAnywhere: false });
  });

  it("villa_pick_validation", async () => {
    const { u, A } = await twoVillas();
    const stranger = await create(await signup());
    let r = await upload(u, []);
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe("올릴 아파트를 하나 이상 골라 주세요");
    r = await upload(u, [A, stranger.id]);
    expect(r.status).toBe(403);
    expect(await errorOf(r)).toBe("내가 사는 아파트에만 올릴 수 있어요");
    expect(await points(u)).toBe(0);
    // 아파트를 보내지 않는 예전 화면은 사는 아파트 모두에 올린다
    const { certId } = (await (await upload(u)).json()) as any;
    expect((await linked(certId)).length).toBe(2);
  });

  it("user_without_villa_still_certifies", async () => {
    const u = await signup();
    const r = await upload(u, []);
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body).toMatchObject({ points: 20, villaIds: [] });
    expect(await linked(body.certId)).toEqual([]);
  });

  it("routine_goes_to_chosen_villas", async () => {
    const { a, b, u, A } = await twoVillas();
    const r = await send("POST", "/api/certs/routine", { body: "스쿼트 5x5", villaIds: [A] }, u.cookie);
    expect(r.status).toBe(200);
    expect((await get<any[]>(a, `/api/users/${u.id}/board`)).map((x) => x.body)).toEqual(["스쿼트 5x5"]);
    expect(await get(b, `/api/users/${u.id}/board`)).toEqual([]);
  });
});

describe("고른 아파트에서 올리는 사이 나간 경우", () => {
  it("picked_only_A_then_kicked_from_A_mid_upload_never_posts_to_B", async () => {
    const { a, b, u, A, B } = await twoVillas();
    // 아파트를 확인한 뒤 · 기록을 쓰기 직전에 A 방장이 u 를 내보낸다
    certTestHooks.beforeWrite = async () => {
      certTestHooks.beforeWrite = undefined;
      expect((await send("POST", `/api/villas/${A}/members/${u.id}/kick`, undefined, a.cookie)).status).toBe(200);
    };
    const r = await upload(u, [A]);
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe("선택한 아파트에서 나가서 올리지 못했어요. 다시 골라 주세요");
    // 기록 · 아파트 연결 · 포인트 · 알림 · 불 모두 없다
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM certs WHERE user_id = ?").bind(u.id).first<{ c: number }>())!.c).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM cert_villas WHERE villa_id = ?").bind(B).first<{ c: number }>())!.c).toBe(0);
    expect(await points(u)).toBe(0);
    expect((await get<any[]>(u, "/api/events")).filter((e) => e.type === "certified")).toEqual([]);
    expect(await memberOf(u, b, B)).toMatchObject({ certifiedToday: false, certifiedAnywhere: false });
    expect(await get(b, `/api/users/${u.id}/board`)).toEqual([]);
  });

  it("same_race_for_routine", async () => {
    const { a, b, u, A } = await twoVillas();
    certTestHooks.beforeWrite = async () => {
      certTestHooks.beforeWrite = undefined;
      await send("POST", `/api/villas/${A}/members/${u.id}/kick`, undefined, a.cookie);
    };
    const r = await send("POST", "/api/certs/routine", { body: "런지", villaIds: [A] }, u.cookie);
    expect(r.status).toBe(409);
    expect(await points(u)).toBe(0);
    expect(await get(b, `/api/users/${u.id}/board`)).toEqual([]);
  });

  it("losing_one_of_two_picked_villas_still_posts_to_the_other_only", async () => {
    const { b, u, A, B } = await twoVillas();
    const C = await create(await signup());
    await join(u, C.inviteToken);
    certTestHooks.beforeWrite = async () => {
      certTestHooks.beforeWrite = undefined;
      await send("POST", `/api/villas/${A}/leave`, undefined, u.cookie);
    };
    const r = await upload(u, [A, B]);
    expect(r.status).toBe(200);
    const { certId } = (await r.json()) as any;
    expect(await linked(certId)).toEqual([B]);
    expect(await memberOf(u, b, B)).toMatchObject({ certifiedToday: true });
  });
});

describe("배포 당일 축하 겹침", () => {
  it("skips_villa_floor_up_when_old_server_already_celebrated_today", async () => {
    const { u, A } = await twoVillas();
    await env.DB.prepare("UPDATE memberships SET streak = 6 WHERE user_id = ?").bind(u.id).run();
    await env.DB.prepare("UPDATE users SET streak = 6 WHERE id = ?").bind(u.id).run();
    const day = (await import("../../shared/rules/day")).kstDay(Date.now());
    // 예전 서버가 오늘 남긴 floor_up (예전 키)
    await env.DB.prepare("INSERT INTO events (id, user_id, type, payload, created_at) VALUES (?, ?, 'floor_up', '{}', 0)").bind(`streak:${u.id}:${day}`, u.id).run();
    await upload(u, [A]);
    const ups = (await get<any[]>(u, "/api/events")).filter((e) => e.type === "floor_up" || e.type === "streak7");
    expect(ups.map((e) => e.id)).toEqual([`streak:${u.id}:${day}`]);
  });
});

describe("다른 아파트에도 올리기", () => {
  it("adds_today_certs_to_another_villa_without_extra_points", async () => {
    const { b, u, A, B } = await twoVillas();
    const { certId } = (await (await upload(u, [A])).json()) as any;
    await send("POST", "/api/certs/routine", { body: "런지", villaIds: [A] }, u.cookie);
    const before = await points(u);
    const r = await send("POST", "/api/certs/today/villas", { villaIds: [B] }, u.cookie);
    expect(r.status).toBe(200);
    expect(await points(u)).toBe(before);
    expect(await linked(certId)).toEqual([A, B].sort());
    expect(await memberOf(u, b, B)).toMatchObject({ certifiedToday: true });
    expect((await get<any[]>(b, `/api/users/${u.id}/board?villa=${B}`)).length).toBe(2);
    expect((await send("GET", `/api/photos/${certId}`, undefined, b.cookie)).status).toBe(200);
    // 다시 눌러도 그대로
    expect((await send("POST", "/api/certs/today/villas", { villaIds: [B] }, u.cookie)).status).toBe(200);
    expect(await linked(certId)).toEqual([A, B].sort());
  });

  it("same_kst_day_only", async () => {
    const { u, A, B } = await twoVillas();
    const t0 = Date.parse("2026-11-18T23:50:00+09:00");
    setNow(() => t0);
    await upload(u, [A]);
    setNow(() => t0 + 20 * 60_000); // 다음 날 00:10
    const r = await send("POST", "/api/certs/today/villas", { villaIds: [B] }, u.cookie);
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe("오늘 올린 인증 사진이 없어요. 먼저 인증해 주세요");
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM cert_villas WHERE villa_id = ?").bind(B).first<{ c: number }>())!.c).toBe(0);
  });

  it("only_my_villas", async () => {
    const { u } = await twoVillas();
    const other = await create(await signup());
    await upload(u);
    expect((await send("POST", "/api/certs/today/villas", { villaIds: [other.id] }, u.cookie)).status).toBe(403);
    expect((await send("POST", "/api/certs/today/villas", { villaIds: [] }, u.cookie)).status).toBe(400);
  });
});

describe("층 · 연속 기록은 아파트마다", () => {
  it("certifying_only_A_for_7_days_raises_A_and_drops_B", async () => {
    const { u, A, B } = await twoVillas();
    await env.DB.prepare("UPDATE memberships SET floor = 3 WHERE user_id = ? AND villa_id = ?").bind(u.id, B).run();
    await env.DB.prepare("DELETE FROM settings WHERE key = 'last_settled_day'").run();
    let day = "2026-10-01";
    for (let i = 0; i < 7; i++) {
      await certInto(u, day, [A]);
      setNow(() => Date.parse(`${day}T12:00:00+09:00`));
      expect((await settle(env, day)).settled).toBe(true);
      if (i === 0) expect(await membership(u, B)).toMatchObject({ floor: 2, streak: 0, missRun: 1 }); // 하루 빠지면 바로 -1
      day = nextDay(day);
    }
    expect(await membership(u, A)).toMatchObject({ floor: 2, streak: 7, missRun: 0 });
    expect(await membership(u, B)).toMatchObject({ floor: 2, streak: 0, missRun: 7 });
    // 사용자 연속 기록은 어느 아파트든 올린 날
    expect((await env.DB.prepare("SELECT streak FROM users WHERE id = ?").bind(u.id).first<{ streak: number }>())!.streak).toBe(7);
    // 8일째 아무 데도 안 올리면: A 는 끊겨 -1, B 는 쉰 지 8일째라 -1
    setNow(() => Date.parse(`${day}T12:00:00+09:00`));
    await settle(env, day);
    expect(await membership(u, A)).toMatchObject({ floor: 1, streak: 0, missRun: 1 });
    expect(await membership(u, B)).toMatchObject({ floor: 1, missRun: 8 });
    // 같은 날 다시 정산해도 바뀌지 않는다
    expect((await settle(env, day)).settled).toBe(false);
    expect(await membership(u, A)).toMatchObject({ floor: 1, streak: 0, missRun: 1 });
  });

  it("joining_a_new_villa_starts_floor_1_streak_0_there", async () => {
    const { u, B } = await twoVillas();
    await env.DB.prepare("UPDATE users SET streak = 20 WHERE id = ?").bind(u.id).run();
    const C = await create(await signup());
    await join(u, C.inviteToken);
    expect(await membership(u, C.id)).toMatchObject({ floor: 1, streak: 0, missRun: 0 });
    expect(await membership(u, B)).toMatchObject({ floor: 1 });
  });

  it("display_floor_and_penthouse_are_per_villa", async () => {
    const { a, b, u, A, B } = await twoVillas();
    // A 에서도 B 에서도 u 는 6일째, 방장은 2층
    await env.DB.prepare("UPDATE memberships SET streak = 6 WHERE user_id = ?").bind(u.id).run();
    await env.DB.prepare("UPDATE memberships SET floor = 2 WHERE user_id IN (?, ?)").bind(a.id, b.id).run();
    await upload(u, [A]);
    expect(await memberOf(u, a, A)).toMatchObject({ floor: 2, floorUpToday: true, streak: 6 });
    expect(await memberOf(u, b, B)).toMatchObject({ floor: 1, floorUpToday: false });
    const ph = async (v: string) => (await env.DB.prepare("SELECT penthouse_user_id AS p FROM villas WHERE id = ?").bind(v).first<{ p: string }>())!.p;
    expect(await ph(A)).toBe(u.id);
    expect(await ph(B)).toBe(b.id);
    // 축하는 A 에서만, 아파트 이름과 함께
    const evs = (await get<any[]>(u, "/api/events")).filter((e) => e.type === "floor_up");
    expect(evs).toHaveLength(1);
    expect(evs[0].payload).toMatchObject({ floor: 2, streak: 7, villaId: A, villaName: "에이아파트", multi: true });
    // 나중에 B 에도 올리면 B 에서도 오늘 7일째 → B 축하도 따로 한 번, 1등도 바뀐다
    await send("POST", "/api/certs/today/villas", { villaIds: [B] }, u.cookie);
    expect(await ph(B)).toBe(u.id);
    const evs2 = (await get<any[]>(u, "/api/events")).filter((e) => e.type === "floor_up");
    expect(evs2.map((e) => e.payload.villaName).sort()).toEqual(["비아파트", "에이아파트"]);
    // 사용자 축하(streak7)는 같은 숫자의 floor_up 과 겹쳐 보내지 않는다
    expect((await get<any[]>(u, "/api/events")).filter((e) => e.type === "streak7")).toEqual([]);
  });
});

describe("도시 · 탈퇴 · 복구", () => {
  it("city_marks_all_my_villas_and_lights_per_villa", async () => {
    const { a, b, u, A, B } = await twoVillas();
    await send("PUT", `/api/villas/${A}/public`, { public: true }, a.cookie);
    await send("PUT", `/api/villas/${B}/public`, { public: true }, b.cookie);
    await upload(u, [A]);
    const city = await get(u, "/api/city");
    expect(city.myVillas.map((m: any) => m.villaId)).toEqual([A, B]);
    expect(city.myVillas[0]).toMatchObject({ name: "에이아파트", public: true, isOwner: false });
    expect(city.mine.villaId).toBe(A);
    const lit = Object.fromEntries(city.villas.filter((v: any) => v.id === A || v.id === B).map((v: any) => [v.id, v.litCount]));
    expect(lit).toEqual({ [A]: 1, [B]: 0 });
  });

  it("account_deletion_leaves_every_villa_with_owner_succession", async () => {
    const x = await signup();
    const y = await signup();
    const u = await signup();
    const A = await create(u, "내가방장A");
    const B = await create(u, "내가방장B");
    await join(x, A.inviteToken);
    await join(y, B.inviteToken);
    expect((await send("DELETE", "/api/me", undefined, u.cookie)).status).toBe(200);
    const owner = async (v: string) => (await env.DB.prepare("SELECT owner_id AS o FROM villas WHERE id = ?").bind(v).first<{ o: string }>())!.o;
    expect(await owner(A.id)).toBe(x.id);
    expect(await owner(B.id)).toBe(y.id);
    expect((await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE user_id = ?").bind(u.id).first<{ c: number }>())!.c).toBe(0);
  });

  it("recovery_approver_is_from_the_oldest_villa", async () => {
    const { a, b, u, A } = await twoVillas();
    const username = (await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(u.id).first<{ username: string }>())!.username;
    expect((await send("POST", "/api/recover/request", { username })).status).toBe(201);
    expect((await get<any[]>(a, "/api/recover/pending")).length).toBe(1);
    expect(await get(b, "/api/recover/pending")).toEqual([]);
    const req = (await env.DB.prepare("SELECT id FROM recovery_requests WHERE user_id = ?").bind(u.id).first<{ id: string }>())!;
    expect((await send("POST", `/api/recover/${req.id}/approve`, undefined, b.cookie)).status).toBe(403);
    expect((await send("POST", `/api/recover/${req.id}/approve`, undefined, a.cookie)).status).toBe(200);
    expect((await env.DB.prepare("SELECT villa_id AS v FROM recovery_requests WHERE id = ?").bind(req.id).first<{ v: string }>())!.v).toBe(A);
  });
});
