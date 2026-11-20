import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { APARTMENT_CAPACITY, VILLA_CAPACITY, type MyVilla } from "../../shared/villa";
import type { CityResponse } from "../../shared/city";
import type { RankingResponse } from "../../shared/price";
import type { RecruitPost } from "../../shared/recruit";

// 아파트 승격 [제안 — 기획자 확인 필요, 2026-11-20]
// 정원(20명)이 다 찬 빌라를 방장이 아파트(정원 50명)로 바꾼다. 되돌릴 수 없고, 정원은 빌라마다 villas.capacity 를 쓴다

let n = 0;
const uname = () => `ap${Date.now().toString(36)}${n++}`.slice(0, 16);
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
  return { id: row!.id, cookie, nickname };
}
type U = Awaited<ReturnType<typeof signup>>;
async function create(u: U, name = "땀빌라") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const promote = (u: U, vid: string) => send("POST", `/api/villas/${vid}/promote`, undefined, u.cookie);
const get = async <T = any>(u: U, path: string) => (await (await send("GET", path, undefined, u.cookie)).json()) as T;
const body = async (r: Response) => (await r.json()) as Record<string, unknown>;
const count = async (vid: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE villa_id = ? AND left_at IS NULL").bind(vid).first<{ c: number }>())!.c;
const villaRow = (vid: string) => env.DB.prepare("SELECT kind, capacity FROM villas WHERE id = ?").bind(vid).first<{ kind: string; capacity: number }>();
const promotedEvents = (vid: string) =>
  env.DB.prepare("SELECT id, user_id AS userId, payload FROM events WHERE type = 'apartment_promoted' AND id LIKE ? ORDER BY id")
    .bind(`apartment:${vid}:%`)
    .all<{ id: string; userId: string; payload: string }>()
    .then((r) => r.results);

/** 빌라를 입주민으로 채운다 (가입 없이 DB 에 바로). 넣은 사용자 id 를 돌려준다 */
async function fill(vid: string, upTo: number): Promise<string[]> {
  const c = await count(vid);
  const stmts = [];
  const ids: string[] = [];
  for (let i = c; i < upTo; i++) {
    const uid = crypto.randomUUID();
    ids.push(uid);
    stmts.push(
      env.DB.prepare("INSERT INTO users (id, username, nickname, password_hash, recovery_hash, created_at) VALUES (?, ?, '채움', 'x', 'x', 0)").bind(uid, `fill_${uid.slice(0, 12)}`),
      env.DB.prepare("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES (?, ?, ?, 1, 0, ?)").bind(crypto.randomUUID(), uid, vid, i + 1),
    );
  }
  // D1 batch 는 한 번에 너무 많이 넣지 않는다
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  return ids;
}
/** 정원(20명)이 다 찬 빌라 + 방장 + 입주민 한 명(가입한 사람) */
async function fullVilla(name = "땀빌라") {
  const owner = await signup("방장");
  const mate = await signup("짝꿍");
  const v = await create(owner, name);
  expect((await join(mate, v.inviteToken)).status).toBe(200);
  await fill(v.id, VILLA_CAPACITY);
  return { owner, mate, ...v };
}

describe("기본값 (0014 마이그레이션)", () => {
  it("new_and_existing_villas_are_villas_of_20", async () => {
    const owner = await signup();
    const v = await create(owner);
    expect(await villaRow(v.id)).toEqual({ kind: "villa", capacity: VILLA_CAPACITY });
    // 예전 서버처럼 kind · capacity 를 빼고 넣어도 기본값
    await env.DB.prepare("INSERT INTO villas (id, name, owner_id, invite_token, created_at) VALUES ('legacy-v', '예전빌라', ?, 'legacy-tok', 0)").bind(owner.id).run();
    expect(await villaRow("legacy-v")).toEqual({ kind: "villa", capacity: 20 });
    // 화면에 보내는 모양
    expect(await get(owner, `/api/villas/${v.id}`)).toMatchObject({ kind: "villa", capacity: 20 });
    expect((await get<MyVilla[]>(owner, "/api/me/villas"))[0]).toMatchObject({ kind: "villa", capacity: 20 });
    expect(await get(owner, `/api/invite/${v.inviteToken}`)).toMatchObject({ kind: "villa", capacity: 20, memberCount: 1 });
  });
});

describe("아파트로 승격", () => {
  it("owner_only_and_only_when_full", async () => {
    const owner = await signup("방장");
    const mate = await signup("짝꿍");
    const out = await signup("남남");
    const v = await create(owner);
    await join(mate, v.inviteToken);
    await fill(v.id, 17);

    // 아직 17명: 409 not_full (지금 인원 · 정원을 함께 알려 준다)
    const early = await promote(owner, v.id);
    expect(early.status).toBe(409);
    expect(await body(early)).toMatchObject({ reason: "not_full", memberCount: 17, capacity: 20, error: "입주민이 20명 모여야 아파트로 바꿀 수 있어요 (지금 17명)" });

    await fill(v.id, 20);
    // 입주민 · 빌라 밖 사람 · 로그인 안 한 사람은 못 한다
    expect((await promote(mate, v.id)).status).toBe(403);
    expect((await promote(out, v.id)).status).toBe(403);
    expect((await send("POST", `/api/villas/${v.id}/promote`)).status).toBe(401);
    expect((await promote(owner, "no-such-villa")).status).toBe(404);
    expect(await villaRow(v.id)).toEqual({ kind: "villa", capacity: 20 });

    const ok = await promote(owner, v.id);
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ ok: true, kind: "apartment", capacity: APARTMENT_CAPACITY });
    expect(await villaRow(v.id)).toEqual({ kind: "apartment", capacity: 50 });
    // 이름 · 방장 · 층 · 1등은 그대로
    expect(await get(mate, `/api/villas/${v.id}`)).toMatchObject({ name: "땀빌라", ownerId: owner.id, kind: "apartment", capacity: 50 });
    expect((await get<MyVilla[]>(mate, "/api/me/villas")).find((x) => x.id === v.id)).toMatchObject({ kind: "apartment", capacity: 50, memberCount: 20 });

    // 되돌릴 수 없고 두 번 바뀌지 않는다
    const again = await promote(owner, v.id);
    expect(again.status).toBe(409);
    expect(await body(again)).toMatchObject({ reason: "already", error: "이미 아파트예요" });
  });

  it("every_member_gets_one_celebration_card_with_fixed_key", async () => {
    const { owner, mate, id } = await fullVilla("햇살빌라");
    // 짝꿍은 빌라 2곳에 산다 → 카드에 빌라 이름을 붙인다 (multi)
    const other = await create(await signup("남의방장"), "둘째빌라");
    await join(mate, other.inviteToken);

    expect((await promote(owner, id)).status).toBe(200);
    const evs = await promotedEvents(id);
    expect(evs).toHaveLength(20);
    expect(new Set(evs.map((e) => e.userId)).size).toBe(20);
    const mine = evs.find((e) => e.userId === mate.id)!;
    expect(mine.id).toBe(`apartment:${id}:${mate.id}`);
    expect(JSON.parse(mine.payload)).toEqual({ villaId: id, villaName: "햇살빌라", capacity: 50, multi: true });
    expect(JSON.parse(evs.find((e) => e.userId === owner.id)!.payload)).toMatchObject({ multi: false });
    // 입주민이 받는 알림 (카드)
    const seen = (await get<{ type: string; payload: Record<string, unknown> }[]>(owner, "/api/events")).filter((e) => e.type === "apartment_promoted");
    expect(seen).toHaveLength(1);
    expect(seen[0].payload).toMatchObject({ villaName: "햇살빌라", capacity: 50 });

    // 다시 눌러도 카드가 늘지 않는다
    await promote(owner, id);
    expect(await promotedEvents(id)).toHaveLength(20);
    // 승격 뒤에 들어온 사람은 승격 카드를 받지 않는다 (입주 카드만)
    const late = await signup("늦게");
    const tok = (await get(owner, `/api/villas/${id}`)).inviteToken as string;
    expect((await join(late, tok)).status).toBe(200);
    expect((await promotedEvents(id)).some((e) => e.userId === late.id)).toBe(false);
  });

  it("double_click_promotes_once", async () => {
    const { owner, id } = await fullVilla();
    const res = await Promise.all([promote(owner, id), promote(owner, id), promote(owner, id)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await promotedEvents(id)).toHaveLength(20);
  });

  it("races_with_leave_transfer_and_dissolve_are_guarded", async () => {
    // 누가 나가 19명이 되면 승격되지 않는다 (승격 문장 안에서 다시 센다)
    const a = await fullVilla();
    expect((await send("POST", `/api/villas/${a.id}/leave`, undefined, a.mate.cookie)).status).toBe(200);
    const r1 = await promote(a.owner, a.id);
    expect(r1.status).toBe(409);
    expect(await body(r1)).toMatchObject({ reason: "not_full", memberCount: 19 });
    expect(await promotedEvents(a.id)).toHaveLength(0);

    // 방장을 넘긴 뒤 예전 방장은 못 하고, 새 방장은 할 수 있다
    const b = await fullVilla();
    expect((await send("POST", `/api/villas/${b.id}/transfer`, { userId: b.mate.id }, b.owner.cookie)).status).toBe(200);
    expect((await promote(b.owner, b.id)).status).toBe(403);
    expect((await promote(b.mate, b.id)).status).toBe(200);

    // 해체된 빌라는 404
    const c = await fullVilla("없어질빌라");
    expect((await send("POST", `/api/villas/${c.id}/dissolve`, { confirmName: "없어질빌라" }, c.owner.cookie)).status).toBe(200);
    expect((await promote(c.owner, c.id)).status).toBe(404);
    expect(await promotedEvents(c.id)).toHaveLength(0);
  });
});

describe("정원은 빌라마다 (아파트 50명)", () => {
  it("invite_join_uses_the_villas_own_capacity", async () => {
    const { owner, id, inviteToken } = await fullVilla();
    // 빌라일 때는 21번째가 못 들어온다
    const x = await signup("스물하나");
    const full = await join(x, inviteToken);
    expect(full.status).toBe(409);
    expect((await body(full)).error).toBe("빌라가 꽉 찼어요");

    expect((await promote(owner, id)).status).toBe(200);
    expect((await join(x, inviteToken)).status).toBe(200);
    expect(await get(owner, `/api/invite/${inviteToken}`)).toMatchObject({ kind: "apartment", capacity: 50, memberCount: 21 });
    await fill(id, APARTMENT_CAPACITY - 1);
    const last = await signup("오십");
    expect((await join(last, inviteToken)).status).toBe(200);
    expect(await count(id)).toBe(50);
    const over = await join(await signup("오십하나"), inviteToken);
    expect(over.status).toBe(409);
    expect((await body(over)).error).toBe("아파트가 꽉 찼어요");
    expect(await count(id)).toBe(50);
  });

  it("recruit_apply_approve_and_auto_off_use_capacity_50", async () => {
    const { owner, id } = await fullVilla();
    expect((await send("PUT", `/api/villas/${id}/public`, { public: true }, owner.cookie)).status).toBe(200);
    // 빌라 20/20: 모집을 켤 수 없다
    const no = await send("PUT", `/api/villas/${id}/recruit`, { open: true, intro: "같이 해요" }, owner.cookie);
    expect(no.status).toBe(409);
    expect((await body(no)).error).toBe("빌라가 꽉 차서 지금은 모집할 수 없어요");

    expect((await promote(owner, id)).status).toBe(200);
    // 아파트 20/50: 켤 수 있고 모집 글에 정원이 실린다
    expect((await send("PUT", `/api/villas/${id}/recruit`, { open: true, intro: "같이 해요" }, owner.cookie)).status).toBe(200);
    expect(await get<RecruitPost>(owner, `/api/villas/${id}/recruit`)).toMatchObject({ open: true, memberCount: 20, kind: "apartment", capacity: 50 });

    // 신청 · 승인: 48명에서 두 사람이 신청 → 49명째 승인 → 50명째 승인 (꽉 참 → 모집 꺼짐, 남은 신청 취소)
    await fill(id, 48);
    const a = await signup("신청1");
    const b = await signup("신청2");
    const c = await signup("신청3");
    const appA = ((await (await send("POST", `/api/villas/${id}/apply`, {}, a.cookie)).json()) as { pending: { id: string } }).pending.id;
    const appB = ((await (await send("POST", `/api/villas/${id}/apply`, {}, b.cookie)).json()) as { pending: { id: string } }).pending.id;
    const appC = ((await (await send("POST", `/api/villas/${id}/apply`, {}, c.cookie)).json()) as { pending: { id: string } }).pending.id;
    expect((await send("POST", `/api/villas/${id}/applications/${appA}/approve`, undefined, owner.cookie)).status).toBe(200);
    expect(await count(id)).toBe(49);
    expect((await send("POST", `/api/villas/${id}/applications/${appB}/approve`, undefined, owner.cookie)).status).toBe(200);
    expect(await count(id)).toBe(50);
    const r = await env.DB.prepare("SELECT open FROM villa_recruits WHERE villa_id = ?").bind(id).first<{ open: number }>();
    expect(r?.open).toBe(0);
    const left = await env.DB.prepare("SELECT status, reason FROM villa_applications WHERE id = ?").bind(appC).first<{ status: string; reason: string }>();
    expect(left).toEqual({ status: "cancelled", reason: "full" });
    // 50/50: 신청도 모집도 안 된다
    expect((await send("PUT", `/api/villas/${id}/recruit`, { open: true }, owner.cookie)).status).toBe(409);
  });

  it("approve_refuses_when_apartment_is_full", async () => {
    const { owner, id } = await fullVilla();
    await send("PUT", `/api/villas/${id}/public`, { public: true }, owner.cookie);
    expect((await promote(owner, id)).status).toBe(200);
    await send("PUT", `/api/villas/${id}/recruit`, { open: true }, owner.cookie);
    await fill(id, 49);
    const a = await signup("신청1");
    const appA = ((await (await send("POST", `/api/villas/${id}/apply`, {}, a.cookie)).json()) as { pending: { id: string } }).pending.id;
    // 그 사이 초대 링크로 50명째가 들어왔다 (모집 꺼짐, 신청 취소)
    await fill(id, 50);
    const res = await send("POST", `/api/villas/${id}/applications/${appA}/approve`, undefined, owner.cookie);
    expect(res.status).toBe(409);
    expect((await body(res)).error).toBe("아파트가 꽉 차서 승인할 수 없어요");
    expect(await count(id)).toBe(50);
  });

  it("city_and_ranking_show_kind_capacity_and_vacancies", async () => {
    const { owner, id } = await fullVilla("하늘빌라");
    await send("PUT", `/api/villas/${id}/public`, { public: true }, owner.cookie);
    expect((await promote(owner, id)).status).toBe(200);
    await send("PUT", `/api/villas/${id}/recruit`, { open: true, intro: "아파트 입주자 모집" }, owner.cookie);
    await fill(id, 30);

    const viewer = await signup("구경꾼");
    const city = await get<CityResponse>(viewer, "/api/city");
    const v = city.villas.find((x) => x.id === id)!;
    expect(v).toMatchObject({ kind: "apartment", capacity: 50, memberCount: 30, recruit: { intro: "아파트 입주자 모집", vacancies: 20 } });
    // 다른 빌라 입주민 정보는 여전히 보내지 않는다
    const allowed = ["battleWin", "capacity", "id", "inBattle", "kind", "litCount", "memberCount", "name", "penthouseNickname", "price", "priceChange", "recruit", "slot", "topFloor", "trophy"];
    expect(Object.keys(v).filter((k) => !allowed.includes(k))).toEqual([]);
    const plain = await create(await signup("옆집"), "옆집빌라");
    const ranking = await get<RankingResponse>(viewer, "/api/ranking");
    expect(ranking.villas.find((x) => x.id === id)).toMatchObject({ kind: "apartment", memberCount: 30 });
    // 공개 안 한 빌라는 순위에 없다 (그대로)
    expect(ranking.villas.some((x) => x.id === plain.id)).toBe(false);
  });
});
