import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { settle, settleThrough } from "../cron/settle";
import { runCompetitions, settleLeague } from "./service";
import { nextDay } from "../../shared/rules/day";
import type { RankingResponse, VillaBattles, VillaPrice } from "../../shared/price";
import type { CityResponse } from "../../shared/city";

// 집값 대결 [확정 — 기획자 결정, 2026-11-20]

let n = 0;
const uname = () => `pr${Date.now().toString(36)}${n++}`.slice(0, 16);
const at = (day: string, hh = 12) => Date.parse(`${day}T${String(hh).padStart(2, "0")}:00:00+09:00`);
let clock = at("2026-11-02", 10);
const setClock = (ms: number) => {
  clock = ms;
};

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
async function create(u: U, name: string) {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = async (u: U, token: string) => expect((await send("POST", `/api/invite/${token}/join`, undefined, u.cookie)).status).toBe(200);
/** 이웃 n명을 입주시킨다 (대결 · 리그는 입주민 3명 이상) */
async function fill(token: string, n: number) {
  const out: U[] = [];
  for (let i = 0; i < n; i++) {
    const u = await signup(`이웃${i}`);
    await join(u, token);
    out.push(u);
  }
  return out;
}
const setPublic = (u: U, vid: string, value: boolean) => send("PUT", `/api/villas/${vid}/public`, { public: value }, u.cookie);
const get = async <T>(u: U, path: string) => (await (await send("GET", path, undefined, u.cookie)).json()) as T;
const points = async (u: U) => (await env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(u.id).first<{ points: number }>())!.points;
const priceOf = async (vid: string, day: string) =>
  (await env.DB.prepare("SELECT price FROM villa_prices WHERE villa_id = ? AND day = ?").bind(vid, day).first<{ price: number }>())?.price ?? null;
const eventsOf = async (u: U, type: string) =>
  (await env.DB.prepare("SELECT payload FROM events WHERE user_id = ? AND type = ?").bind(u.id, type).all<{ payload: string }>()).results.map(
    (r) => JSON.parse(r.payload) as Record<string, unknown>,
  );

/** 사진 인증 하나를 고른 빌라에만 올린다 (cert_villas 를 먼저 넣어 기본 트리거가 모든 빌라에 붙이지 않게) */
async function photo(u: U, villas: string[], day: string, extra: { duplicate?: number; deleted?: number } = {}) {
  const id = crypto.randomUUID();
  for (const v of villas) await env.DB.prepare("INSERT INTO cert_villas (cert_id, villa_id, created_at) VALUES (?, ?, 1)").bind(id, v).run();
  await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, deleted, created_at) VALUES (?, ?, ?, 'photo', 20, ?, ?, 1)")
    .bind(id, u.id, day, extra.duplicate ?? 0, extra.deleted ?? 0)
    .run();
}

/** from ~ to 를 하루씩 정산한다 (크론처럼 정산 뒤 리그 · 대결도) */
async function settleDays(from: string, to: string) {
  for (let d = from; d <= to; d = nextDay(d)) {
    setClock(at(nextDay(d), 0) + 60_000);
    await settle(env, d);
    await runCompetitions(env);
  }
}

beforeEach(async () => {
  setClock(at("2026-11-02", 10));
  setNow(() => clock);
  for (const t of [
    "users", "villas", "memberships", "certs", "cert_villas", "settings", "events", "villa_prices", "league_results", "battles", "price_rewards",
  ]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
});
afterEach(() => setNow(null));

describe("price", () => {
  it("counts_only_certs_posted_to_that_villa_and_multi_villa_user_counted_per_villa", async () => {
    const a = await signup("에이");
    const b = await signup("비비");
    const A = await create(a, "에이빌라");
    const B = await create(a, "비빌라");
    await join(b, A.inviteToken);
    // a: 에이빌라 3일, 비빌라 1일 (다른 기록). b: 에이빌라 2일 + 중복 · 지운 사진은 세지 않는다
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) await photo(a, [A.id], d);
    await photo(a, [B.id], "2026-11-05");
    await photo(b, [A.id], "2026-11-03");
    await photo(b, [A.id], "2026-11-04");
    await photo(b, [A.id], "2026-11-05", { duplicate: 1 });
    await photo(b, [A.id], "2026-11-06", { deleted: 1 });
    // 같은 날 두 장은 하루로
    await photo(b, [A.id], "2026-11-04");
    await settleDays("2026-11-02", "2026-11-08");
    // 1억 + 2명 × 0.1 + (3 + 2)일 × 0.1
    expect(await priceOf(A.id, "2026-11-08")).toBe(10 + 2 + 5);
    expect(await priceOf(B.id, "2026-11-08")).toBe(10 + 1 + 1);
    // 다음 날: 11-02 이 7일 창에서 빠진다
    await settleDays("2026-11-09", "2026-11-09");
    expect(await priceOf(A.id, "2026-11-09")).toBe(10 + 2 + 4);
  });

  it("floor_above_first_adds_price_after_settle_floor", async () => {
    const a = await signup();
    const A = await create(a, "층빌라");
    for (let d = "2026-11-02"; d <= "2026-11-08"; d = nextDay(d)) await photo(a, [A.id], d);
    await settleDays("2026-11-02", "2026-11-08");
    // 7일 연속 → 그날 정산 뒤 2층: 10 + 1 + 7 + 1
    expect(await priceOf(A.id, "2026-11-08")).toBe(19);
    expect(await priceOf(A.id, "2026-11-07")).toBe(10 + 1 + 6);
  });

  it("daily_change_and_villa_screen_and_price_endpoint", async () => {
    const a = await signup();
    const A = await create(a, "변동빌라");
    await settleDays("2026-11-02", "2026-11-02");
    await photo(a, [A.id], "2026-11-03");
    await settleDays("2026-11-03", "2026-11-03");
    const p = await get<VillaPrice>(a, `/api/villas/${A.id}/price`);
    expect(p).toMatchObject({ day: "2026-11-03", price: 12, change: 1 });
    expect(p.history.map((h) => h.day)).toEqual(["2026-11-02", "2026-11-03"]);
    const v = await get<{ price: number; priceChange: number; battle: null }>(a, `/api/villas/${A.id}`);
    expect(v).toMatchObject({ price: 12, priceChange: 1, battle: null });
    await settleDays("2026-11-04", "2026-11-04");
    expect((await get<VillaPrice>(a, `/api/villas/${A.id}/price`)).change).toBe(0);
  });

  it("dissolved_villa_and_late_joiner_not_priced", async () => {
    const a = await signup();
    const b = await signup();
    const A = await create(a, "해체빌라");
    const B = await create(b, "늦은빌라");
    await send("POST", `/api/villas/${A.id}/dissolve`, { confirmName: "해체빌라" }, a.cookie);
    // 11-02 이 끝난 뒤(11-03 12시) 입주한 사람은 11-02 집값에 들어가지 않는다 (밀린 날 정산)
    setClock(at("2026-11-03"));
    const c = await signup();
    await join(c, B.inviteToken);
    await settle(env, "2026-11-02");
    expect(await priceOf(A.id, "2026-11-02")).toBeNull();
    expect(await env.DB.prepare("SELECT member_count AS n FROM villa_prices WHERE villa_id = ?").bind(B.id).first()).toEqual({ n: 1 });
  });

  it("price_written_once_with_settlement_claim", async () => {
    const a = await signup();
    const A = await create(a, "한번빌라");
    await photo(a, [A.id], "2026-11-02");
    setClock(at("2026-11-03", 0) + 1000);
    const rs = await Promise.all([settle(env, "2026-11-02"), settle(env, "2026-11-02")]);
    expect(rs.filter((r) => r.settled)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM villa_prices").first<{ n: number }>())!.n).toBe(1);
    // 다른 토큰이 이미 그날을 선점했으면 집값도 쓰지 않는다
    await env.DB.prepare("UPDATE settings SET value = '2026-11-03:other' WHERE key = 'last_settled_day'").run();
    await settle(env, "2026-11-03");
    expect(await priceOf(A.id, "2026-11-03")).toBeNull();
  });

  it("price_endpoint_private_only_for_members", async () => {
    const a = await signup();
    const x = await signup();
    const A = await create(a, "비밀빌라");
    await settleDays("2026-11-02", "2026-11-02");
    expect((await send("GET", `/api/villas/${A.id}/price`, undefined, x.cookie)).status).toBe(404);
    expect((await send("GET", `/api/villas/${A.id}/price`, undefined, a.cookie)).status).toBe(200);
    await setPublic(a, A.id, true);
    expect((await send("GET", `/api/villas/${A.id}/price`, undefined, x.cookie)).status).toBe(200);
    expect((await send("GET", `/api/villas/${A.id}/battles`, undefined, x.cookie)).status).toBe(404);
  });
});

describe("ranking & city", () => {
  it("ranking_lists_public_villas_by_price_without_member_ids", async () => {
    const a = await signup();
    const b = await signup();
    const c = await signup();
    const A = await create(a, "가빌라");
    const B = await create(b, "나빌라");
    const C = await create(c, "비공개");
    await setPublic(a, A.id, true);
    await setPublic(b, B.id, true);
    await photo(b, [B.id], "2026-11-02");
    await photo(c, [C.id], "2026-11-02");
    await photo(c, [C.id], "2026-11-03");
    await settleDays("2026-11-02", "2026-11-03");
    const r = await get<RankingResponse>(a, "/api/ranking");
    expect(r.day).toBe("2026-11-03");
    expect(r.villas.map((v) => [v.name, v.rank, v.price, v.change])).toEqual([
      ["나빌라", 1, 12, 0],
      ["가빌라", 2, 11, 0],
    ]);
    expect(r.mine).toEqual([{ villaId: A.id, name: "가빌라", isOwner: true, public: true, inBattle: false, memberCount: 1 }]);
    const raw = JSON.stringify(r);
    for (const u of [b, c]) expect(raw).not.toContain(u.id);
    expect(raw).not.toContain(C.id);

    const city = await get<CityResponse>(a, "/api/city");
    const nb = city.villas.find((v) => v.id === B.id)!;
    expect(nb).toMatchObject({ price: 12, priceChange: 0, inBattle: false });
    expect(nb.trophy).toBeUndefined();
  });
});

/** 공개 빌라 3곳 + 비공개 1곳: 월~일 인증 수가 다르다 */
async function leagueSetup() {
  const owners = [await signup("일등"), await signup("이등"), await signup("삼등"), await signup("비공개"), await signup("사등")];
  const names = ["일등빌라", "이등빌라", "삼등빌라", "숨은빌라", "사등빌라"];
  const V = [];
  for (let i = 0; i < owners.length; i++) V.push(await create(owners[i], names[i]));
  for (const i of [0, 1, 2, 4]) await setPublic(owners[i], V[i].id, true);
  const mate = await signup("일등이웃");
  await join(mate, V[0].inviteToken);
  await fill(V[0].inviteToken, 1);
  for (const i of [1, 2, 4]) await fill(V[i].inviteToken, 2);
  const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
  for (const d of days.slice(0, 5)) await photo(owners[0], [V[0].id], d);
  for (const d of days.slice(0, 3)) await photo(owners[1], [V[1].id], d);
  for (const d of days.slice(0, 2)) await photo(owners[2], [V[2].id], d);
  for (const d of days) await photo(owners[3], [V[3].id], d);
  await photo(owners[4], [V[4].id], days[0]);
  return { owners, V, mate };
}

describe("weekly league", () => {
  it("sunday_settle_ranks_public_villas_and_pays_once_with_catch_up", async () => {
    const { owners, V, mate } = await leagueSetup();
    await settleDays("2026-11-09", "2026-11-13");
    // 주 중간(수요일)에 입주한 사람은 보상 대상이 아니다
    setClock(at("2026-11-11"));
    const late = await signup("늦게온이웃");
    await join(late, V[0].inviteToken);
    // 토 · 일 · 월을 한 번에 (크론이 이틀 밀린 경우)
    await settleDays("2026-11-14", "2026-11-14");
    setClock(at("2026-11-17", 0) + 60_000);
    expect(await settleThrough(env, "2026-11-16")).toEqual(["2026-11-15", "2026-11-16"]);

    const { results } = await env.DB.prepare("SELECT villa_id AS v, rank FROM league_results WHERE week = '2026-11-09' ORDER BY rank").all<{ v: string; rank: number }>();
    expect(results.map((r) => r.v)).toEqual([V[0].id, V[1].id, V[2].id, V[4].id]);
    expect(await points(owners[0])).toBe(100);
    expect(await points(mate)).toBe(100);
    expect(await points(late)).toBe(0);
    expect(await points(owners[1])).toBe(60);
    expect(await points(owners[2])).toBe(30);
    expect(await points(owners[3])).toBe(0);
    expect(await points(owners[4])).toBe(0);
    expect(await eventsOf(late, "league_rank")).toMatchObject([{ rank: 1, points: 0, villaName: "일등빌라" }]);
    expect(await eventsOf(owners[1], "league_rank")).toMatchObject([{ rank: 2, points: 60 }]);
    expect(await eventsOf(owners[4], "league_rank")).toEqual([]);

    // 다시 돌아도 · 리그만 다시 불러도 한 번만
    await runCompetitions(env);
    expect(await settleLeague(env, "2026-11-15")).toEqual({ settled: false });
    await settleThrough(env, "2026-11-16");
    expect(await points(owners[0])).toBe(100);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM price_rewards").first<{ n: number }>())!.n).toBe(9);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'league_rank'").first<{ n: number }>())!.n).toBe(10);

    // 트로피: 순위 · 도시 · 빌라 화면
    const r = await get<RankingResponse>(owners[3], "/api/ranking");
    expect(r.leagueWeek).toBe("2026-11-09");
    expect(r.villas.find((v) => v.id === V[0].id)!.trophy).toBe(1);
    expect(r.villas.find((v) => v.id === V[2].id)!.trophy).toBe(3);
    expect(r.villas.find((v) => v.id === V[4].id)!.trophy).toBeUndefined();
    const city = await get<CityResponse>(owners[3], "/api/city");
    expect(city.villas.find((v) => v.id === V[1].id)!.trophy).toBe(2);
  });

  it("villa_without_certs_in_week_not_ranked_and_nothing_when_no_villas", async () => {
    const a = await signup();
    const A = await create(a, "조용한빌라");
    await setPublic(a, A.id, true);
    await settleDays("2026-11-09", "2026-11-15");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM league_results").first<{ n: number }>())!.n).toBe(0);
    expect(await points(a)).toBe(0);
  });

  it("villa_with_fewer_than_three_members_not_ranked", async () => {
    const a = await signup();
    const A = await create(a, "둘빌라");
    await fill(A.inviteToken, 1);
    await setPublic(a, A.id, true);
    await photo(a, [A.id], "2026-11-10");
    await settleDays("2026-11-09", "2026-11-15");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM league_results").first<{ n: number }>())!.n).toBe(0);
  });

  it("league_only_on_sunday", async () => {
    expect(await settleLeague(env, "2026-11-14")).toEqual({ settled: false });
  });
});

/** 공개 빌라 둘 (방장 + 입주민 하나씩) */
async function battlePair() {
  const ao = await signup("에이방장");
  const bo = await signup("비방장");
  const am = await signup("에이이웃");
  const A = await create(ao, "에이빌라");
  const B = await create(bo, "비빌라");
  await join(am, A.inviteToken);
  await fill(A.inviteToken, 1);
  const bm = await fill(B.inviteToken, 2);
  await setPublic(ao, A.id, true);
  await setPublic(bo, B.id, true);
  return { ao, bo, am, bm, A, B };
}
const challenge = (u: U, from: string, to: string) => send("POST", `/api/villas/${from}/battles`, { opponentVillaId: to }, u.cookie);
const act = (u: U, bid: string, what: "accept" | "decline" | "cancel") => send("POST", `/api/battles/${bid}/${what}`, undefined, u.cookie);
const battles = (u: U, vid: string) => get<VillaBattles>(u, `/api/villas/${vid}/battles`);

describe("1:1 battle", () => {
  it("challenge_accept_lifecycle_and_owner_only", async () => {
    const { ao, bo, am, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    // 입주민(방장 아님)은 신청할 수 없다
    expect((await challenge(am, A.id, B.id)).status).toBe(403);
    const res = await challenge(ao, A.id, B.id);
    expect(res.status).toBe(201);
    const mine = (await res.json()) as VillaBattles;
    expect(mine.current).toMatchObject({ status: "pending", side: "challenger", them: { name: "비빌라" } });
    const bid = mine.current!.id;
    expect(await eventsOf(bo, "battle_challenged")).toMatchObject([{ battleId: bid, fromName: "에이빌라" }]);

    // 입주민은 보기만 (같은 상태가 보인다)
    expect((await battles(am, A.id)).current).toMatchObject({ id: bid, status: "pending" });
    expect((await battles(am, A.id)).isOwner).toBe(false);
    // 신청한 쪽 · 입주민은 받을 수 없다
    expect((await act(ao, bid, "accept")).status).toBe(403);
    expect((await act(am, bid, "accept")).status).toBe(403);
    expect((await act(bo, bid, "cancel")).status).toBe(403);

    const ok = await act(bo, bid, "accept");
    expect(ok.status).toBe(200);
    const view = ((await ok.json()) as VillaBattles).current!;
    expect(view).toMatchObject({ status: "active", side: "opponent", startDay: "2026-11-11", endDay: "2026-11-17", daysLeft: 7, started: false });
    expect(await eventsOf(am, "battle_started")).toMatchObject([{ opponentName: "비빌라", startDay: "2026-11-11" }]);
    // 두 번 받아도 한 번
    expect((await act(bo, bid, "accept")).status).toBe(409);
    expect((await act(ao, bid, "cancel")).status).toBe(409);
    // 빌라 화면 · 도시에 대결 표시
    expect((await get<{ battle: { id: string } }>(am, `/api/villas/${A.id}`)).battle.id).toBe(bid);
    expect((await get<CityResponse>(am, "/api/city")).villas.find((v) => v.id === B.id)!.inBattle).toBe(true);
  });

  it("one_battle_per_villa_both_sides_and_races", async () => {
    const { ao, bo, A, B } = await battlePair();
    const co = await signup();
    const doo = await signup();
    const C = await create(co, "씨빌라");
    const D = await create(doo, "디빌라");
    await fill(C.inviteToken, 2);
    await fill(D.inviteToken, 2);
    await setPublic(co, C.id, true);
    await setPublic(doo, D.id, true);
    // 둘이 동시에 비빌라에 신청 → 하나만
    const rs = await Promise.all([challenge(ao, A.id, B.id), challenge(co, C.id, B.id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = rs[0].status === 201 ? { u: ao, v: A } : { u: co, v: C };
    const loser = rs[0].status === 201 ? { u: co, v: C } : { u: ao, v: A };
    // 신청 중인 빌라는 다른 곳에 신청하지 못하고, 받는 쪽도 다른 곳에 신청하지 못한다
    expect((await challenge(winner.u, winner.v.id, D.id)).status).toBe(409);
    expect((await challenge(bo, B.id, D.id)).status).toBe(409);
    const busy = await challenge(loser.u, loser.v.id, B.id);
    expect(((await busy.json()) as { error: string }).error).toContain("다른 대결");
    // 상관없는 빌라끼리는 된다
    expect((await challenge(loser.u, loser.v.id, D.id)).status).toBe(201);
    // 서로에게 동시에 신청해도 하나만
    const e1 = await signup();
    const e2 = await signup();
    const E1 = await create(e1, "이원");
    const E2 = await create(e2, "이투");
    await fill(E1.inviteToken, 2);
    await fill(E2.inviteToken, 2);
    await setPublic(e1, E1.id, true);
    await setPublic(e2, E2.id, true);
    const both = await Promise.all([challenge(e1, E1.id, E2.id), challenge(e2, E2.id, E1.id)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM battles WHERE status = 'pending'").first<{ n: number }>())!.n).toBe(3);
  });

  it("refusals_private_self_and_own_both", async () => {
    const { ao, A, B } = await battlePair();
    const x = await signup();
    const X = await create(x, "비공개빌라");
    expect((await challenge(ao, A.id, X.id)).status).toBe(404);
    expect((await challenge(ao, A.id, A.id)).status).toBe(400);
    expect((await challenge(x, X.id, B.id)).status).toBe(409);
    const Own = await create(ao, "내두번째");
    await setPublic(ao, Own.id, true);
    expect((await challenge(ao, A.id, Own.id)).status).toBe(409);
    expect((await send("POST", `/api/villas/${A.id}/battles`, {}, ao.cookie)).status).toBe(400);
  });

  it("decline_cancel_and_expire_after_48h", async () => {
    const { ao, bo, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    const b1 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    expect((await act(bo, b1, "decline")).status).toBe(200);
    expect(await eventsOf(ao, "battle_declined")).toMatchObject([{ opponentName: "비빌라" }]);
    expect((await battles(ao, A.id)).recent[0]).toMatchObject({ id: b1, status: "declined" });

    const b2 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    expect((await act(ao, b2, "cancel")).status).toBe(200);
    expect((await act(bo, b2, "accept")).status).toBe(409);

    const b3 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    setClock(at("2026-11-12", 13));
    // 48시간이 지나면 읽을 때 만료로 보이고, 받을 수 없으며, 새 신청을 막지 않는다
    expect((await battles(bo, B.id)).current).toBeNull();
    expect((await act(bo, b3, "accept")).status).toBe(409);
    expect((await battles(ao, A.id)).recent[0]).toMatchObject({ id: b3, status: "expired" });
    expect(await eventsOf(ao, "battle_expired")).toHaveLength(1);
    const b4 = await challenge(bo, B.id, A.id);
    expect(b4.status).toBe(201);
    // 크론도 만료로 바꾼다
    setClock(at("2026-11-14", 13));
    await runCompetitions(env);
    expect((await env.DB.prepare("SELECT status FROM battles WHERE id = ?").bind(((await b4.json()) as VillaBattles).current!.id).first())).toEqual({ status: "expired" });
  });

  it("winner_gets_points_once_only_members_joined_before_start", async () => {
    const { ao, bo, am, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    const bid = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    await act(bo, bid, "accept");
    // 기준일 11-10: 비빌라가 더 높게 시작해도 오른 값으로 판정한다
    for (const d of ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]) await photo(bo, [B.id], d);
    for (const d of ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]) {
      await photo(ao, [A.id], d);
      await photo(am, [A.id], d);
    }
    await settleDays("2026-11-04", "2026-11-11");
    // 대결 중에 입주한 사람은 보상 대상이 아니다
    setClock(at("2026-11-12", 15));
    const late = await signup("중간입주");
    await join(late, A.inviteToken);
    await settleDays("2026-11-12", "2026-11-12");
    const mid = (await battles(am, A.id)).current!;
    expect(mid).toMatchObject({ status: "active", started: true, daysLeft: 5 });
    expect(mid.me.delta).toBeGreaterThan(0);
    expect(mid.them.delta).toBeLessThan(0);

    await settleDays("2026-11-13", "2026-11-16");
    // 주간 리그(11-15) 포인트는 따로: 대결 보상만 본다
    const before = { ao: await points(ao), am: await points(am), late: await points(late), bo: await points(bo) };
    await settleDays("2026-11-17", "2026-11-17");
    const row = await env.DB.prepare("SELECT status, winner_villa_id AS w FROM battles WHERE id = ?").bind(bid).first();
    expect(row).toEqual({ status: "finished", w: A.id });
    expect(await points(ao)).toBe(before.ao + 50);
    expect(await points(am)).toBe(before.am + 50);
    expect(await points(late)).toBe(before.late);
    expect(await points(bo)).toBe(before.bo);
    expect(await eventsOf(am, "battle_result")).toMatchObject([{ result: "won", opponentName: "비빌라", points: 50 }]);
    expect(await eventsOf(late, "battle_result")).toMatchObject([{ result: "won", points: 0 }]);
    expect(await eventsOf(bo, "battle_result")).toMatchObject([{ result: "lost", points: 0 }]);

    await runCompetitions(env);
    await settleDays("2026-11-18", "2026-11-18");
    expect(await points(ao)).toBe(before.ao + 50);
    const after = await battles(ao, A.id);
    expect(after.current).toBeNull();
    expect(after.recent[0]).toMatchObject({ id: bid, status: "finished", result: "won" });
    expect((await get<RankingResponse>(bo, "/api/ranking")).villas.find((v) => v.id === A.id)!.battleWin).toBe(true);
    // 승리 배지는 7일
    setClock(at("2026-11-26"));
    expect((await get<RankingResponse>(bo, "/api/ranking")).villas.find((v) => v.id === A.id)!.battleWin).toBeUndefined();
  });

  it("draw_no_reward", async () => {
    const { ao, bo, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    const bid = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    await act(bo, bid, "accept");
    await settleDays("2026-11-10", "2026-11-17");
    expect(await env.DB.prepare("SELECT status, winner_villa_id AS w FROM battles WHERE id = ?").bind(bid).first()).toEqual({ status: "finished", w: null });
    expect(await points(ao)).toBe(0);
    expect(await points(bo)).toBe(0);
    expect(await eventsOf(bo, "battle_result")).toMatchObject([{ result: "draw" }]);
  });

  it("private_blocked_while_active_pending_cancelled_by_private_and_dissolve_cancels", async () => {
    const { ao, bo, am, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    // 신청 중일 때는 비공개로 바꾸면 신청이 취소된다
    const b0 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    expect((await setPublic(bo, B.id, false)).status).toBe(200);
    expect(await env.DB.prepare("SELECT status, reason FROM battles WHERE id = ?").bind(b0).first()).toEqual({ status: "cancelled", reason: "private" });
    expect(await eventsOf(ao, "battle_cancelled")).toMatchObject([{ opponentName: "비빌라", reason: "private" }]);
    await setPublic(bo, B.id, true);

    // 진행 중에는 비공개로 바꿀 수 없다 (양쪽 모두)
    const b1 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    await act(bo, b1, "accept");
    for (const [u, v] of [[bo, B], [ao, A]] as const) {
      const r = await setPublic(u, v.id, false);
      expect(r.status).toBe(409);
      expect(((await r.json()) as { error: string }).error).toBe("대결이 끝난 뒤에 비공개로 바꿀 수 있어요");
    }
    expect(await env.DB.prepare("SELECT status, public FROM battles JOIN villas ON villas.id = ? WHERE battles.id = ?").bind(B.id, b1).first()).toEqual({ status: "active", public: 1 });

    // 크론이 안전망: 다른 길로 해체된 경우
    await env.DB.prepare("UPDATE villas SET dissolved_at = 1 WHERE id = ?").bind(B.id).run();
    await settleDays("2026-11-10", "2026-11-17");
    expect(await env.DB.prepare("SELECT status, reason FROM battles WHERE id = ?").bind(b1).first()).toEqual({ status: "cancelled", reason: "dissolved" });
    expect(await eventsOf(am, "battle_cancelled")).toMatchObject([{ reason: "dissolved" }]);
    expect(await points(ao)).toBe(0);

    // 방장 해체는 진행 중이어도 되고, 바로 취소
    const co = await signup();
    const C = await create(co, "씨빌라");
    await fill(C.inviteToken, 2);
    await setPublic(co, C.id, true);
    setClock(at("2026-11-19"));
    const b3 = ((await (await challenge(co, C.id, A.id)).json()) as VillaBattles).current!.id;
    await act(ao, b3, "accept");
    expect((await send("POST", `/api/villas/${C.id}/dissolve`, { confirmName: "씨빌라" }, co.cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT status FROM battles WHERE id = ?").bind(b3).first()).toEqual({ status: "cancelled" });
  });

  it("needs_three_members_at_challenge_accept_and_finish", async () => {
    const { ao, bo, am, bm, A, B } = await battlePair();
    const x = await signup();
    const X = await create(x, "둘빌라");
    await fill(X.inviteToken, 1);
    await setPublic(x, X.id, true);
    setClock(at("2026-11-10"));
    const r1 = await challenge(x, X.id, A.id);
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as { error: string }).error).toBe("입주민이 3명 이상이어야 대결할 수 있어요");
    const r2 = await challenge(ao, A.id, X.id);
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { error: string }).error).toContain("3명 이상인 빌라와만");

    // 받기 전에 신청한 빌라가 2명이 되면 받을 수 없다
    const b1 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    expect((await send("POST", `/api/villas/${A.id}/leave`, undefined, am.cookie)).status).toBe(200);
    const acc = await act(bo, b1, "accept");
    expect(acc.status).toBe(409);
    expect(((await acc.json()) as { error: string }).error).toContain("3명보다 적어");
    await act(ao, b1, "cancel");

    // 진행 중에 3명보다 적어지면 끝날 때 취소 (보상 없음)
    await join(am, A.inviteToken);
    const b2 = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    expect((await act(bo, b2, "accept")).status).toBe(200);
    for (let d = "2026-11-11"; d <= "2026-11-17"; d = nextDay(d)) await photo(bo, [B.id], d);
    expect((await send("POST", `/api/villas/${B.id}/leave`, undefined, bm[0].cookie)).status).toBe(200);
    await settleDays("2026-11-10", "2026-11-17");
    expect(await env.DB.prepare("SELECT status, reason FROM battles WHERE id = ?").bind(b2).first()).toEqual({ status: "cancelled", reason: "members" });
    expect(await points(bo)).toBe(0);
    expect(await eventsOf(bo, "battle_cancelled")).toMatchObject([{ reason: "members" }]);
  });

  it("one_broken_battle_does_not_stop_others_or_league", async () => {
    const { ao, bo, A, B } = await battlePair();
    setClock(at("2026-11-10"));
    const bid = ((await (await challenge(ao, A.id, B.id)).json()) as VillaBattles).current!.id;
    await act(bo, bid, "accept");
    for (let d = "2026-11-09"; d <= "2026-11-17"; d = nextDay(d)) await photo(ao, [A.id], d);
    // 깨진 진행 중 대결 (첫날이 없다) 하나를 먼저 둔다
    await env.DB.prepare(
      "INSERT INTO battles (id, challenger_villa_id, opponent_villa_id, challenger_user_id, status, created_at, end_day) VALUES ('broken', 'x1', 'x2', 'u', 'active', 0, '2026-11-01')",
    ).run();
    await settleDays("2026-11-09", "2026-11-17");
    expect(await env.DB.prepare("SELECT status FROM battles WHERE id = ?").bind(bid).first()).toEqual({ status: "finished" });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM league_results WHERE week = '2026-11-09'").first<{ n: number }>())!.n).toBe(1);
    // 결과 카드는 보상과 같은 batch 에 들어간다
    expect(await eventsOf(ao, "battle_result")).toMatchObject([{ result: "won", points: 50 }]);
    expect(await eventsOf(ao, "league_rank")).toMatchObject([{ rank: 1, points: 100 }]);
  });
});
