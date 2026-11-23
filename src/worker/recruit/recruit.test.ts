import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";
import { settleThrough } from "../cron/settle";
import { purgeApplications } from "./service";
import { kstDay } from "../../shared/rules/day";
import { VILLA_LIMIT_MSG } from "../../shared/villa";
import { APPLY_BLOCKED_MSG, APPLY_ONE_AT_A_TIME_MSG, APPLY_TTL_MS, RECRUIT_NEED_PUBLIC_MSG } from "../../shared/recruit";
import type { CityResponse } from "../../shared/city";

// 빈방 모집 · 입주 신청 [확정 — 기획자 결정, 2026-11-19]

let n = 0;
const uname = () => `rc${Date.now().toString(36)}${n++}`.slice(0, 16);
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
async function create(u: U, name = "모집아파트") {
  const res = await send("POST", "/api/villas", { name }, u.cookie);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; inviteToken: string };
}
const join = (u: U, token: string) => send("POST", `/api/invite/${token}/join`, undefined, u.cookie);
const setPublic = (u: U, vid: string, value: boolean) => send("PUT", `/api/villas/${vid}/public`, { public: value }, u.cookie);
const putRecruit = (u: U, vid: string, body: unknown) => send("PUT", `/api/villas/${vid}/recruit`, body, u.cookie);
const apply = (u: U, vid: string, message?: string) => send("POST", `/api/villas/${vid}/apply`, message === undefined ? {} : { message }, u.cookie);
const approve = (u: U, vid: string, appId: string) => send("POST", `/api/villas/${vid}/applications/${appId}/approve`, undefined, u.cookie);
const reject = (u: U, vid: string, appId: string) => send("POST", `/api/villas/${vid}/applications/${appId}/reject`, undefined, u.cookie);
const get = async <T = any>(u: U, path: string) => (await (await send("GET", path, undefined, u.cookie)).json()) as T;
const err = async (r: Response) => ((await r.json()) as { error: string }).error;
type Ev = { id: string; type: string; payload: Record<string, unknown> };
const ofType = async (u: U, type: string) => (await get<Ev[]>(u, "/api/events")).filter((e) => e.type === type);
const appRow = (id: string) =>
  env.DB.prepare("SELECT status, reason FROM villa_applications WHERE id = ?").bind(id).first<{ status: string; reason: string | null }>();
const membership = (uid: string, vid: string) =>
  env.DB.prepare("SELECT floor, streak FROM memberships WHERE user_id = ? AND villa_id = ? AND left_at IS NULL").bind(uid, vid).first<{ floor: number; streak: number }>();
const recruitOpen = async (vid: string) =>
  !!(await env.DB.prepare("SELECT open FROM villa_recruits WHERE villa_id = ?").bind(vid).first<{ open: number }>())?.open;

/** 방장 + 공개 + 모집 중인 아파트 */
async function recruiting(name = "모집아파트", body: Record<string, unknown> = { intro: "아침 운동 같이 해요", sports: ["running", "gym"] }) {
  const owner = await signup("방장");
  const v = await create(owner, name);
  expect((await setPublic(owner, v.id, true)).status).toBe(200);
  expect((await putRecruit(owner, v.id, { open: true, ...body })).status).toBe(200);
  return { owner, ...v };
}
/** 신청하고 신청 id 를 돌려준다 */
async function applied(u: U, vid: string, message?: string) {
  const res = await apply(u, vid, message);
  expect(res.status).toBe(201);
  return ((await res.json()) as { pending: { id: string } }).pending.id;
}
/** 아파트를 입주민으로 채운다 (가입 없이 DB 에 바로) */
async function fill(vid: string, upTo: number) {
  const { c } = (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE villa_id = ? AND left_at IS NULL").bind(vid).first<{ c: number }>())!;
  const stmts = [];
  for (let i = c; i < upTo; i++) {
    const uid = crypto.randomUUID();
    stmts.push(
      env.DB.prepare("INSERT INTO users (id, username, nickname, password_hash, recovery_hash, created_at) VALUES (?, ?, '채움', 'x', 'x', 0)").bind(uid, `fill_${uid.slice(0, 12)}`),
      env.DB.prepare("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES (?, ?, ?, 1, 0, 0)").bind(crypto.randomUUID(), uid, vid),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
}

afterEach(() => setNow(null));

describe("모집 글", () => {
  it("only_owner_writes_and_members_read_it", async () => {
    const owner = await signup("방장");
    const mate = await signup("짝꿍");
    const out = await signup("남남");
    const v = await create(owner);
    await join(mate, v.inviteToken);

    // 신규입력: 아직 글이 없다
    expect(await get(owner, `/api/villas/${v.id}/recruit`)).toMatchObject({ open: false, intro: "", sports: [], updatedAt: null, public: false, pendingCount: 0 });
    // 지도에 공개하지 않았으면 켤 수 없다
    const priv = await putRecruit(owner, v.id, { open: true, intro: "같이 해요", sports: [] });
    expect(priv.status).toBe(409);
    expect(await err(priv)).toBe(RECRUIT_NEED_PUBLIC_MSG);
    // 꺼진 채로 글만 써 둘 수는 있다
    expect((await putRecruit(owner, v.id, { open: false, intro: "같이 해요" })).status).toBe(200);

    await setPublic(owner, v.id, true);
    expect((await putRecruit(mate, v.id, { open: true })).status).toBe(403);
    expect((await putRecruit(out, v.id, { open: true })).status).toBe(403);
    const ok = await putRecruit(owner, v.id, { open: true, intro: "  저녁   러닝  같이  ", sports: ["running", "gym", "running"] });
    expect(ok.status).toBe(200);
    // 입주민은 읽기만 (받은 신청 수는 없다), 아파트 밖 사람은 못 본다
    const seen = await get(mate, `/api/villas/${v.id}/recruit`);
    expect(seen).toMatchObject({ open: true, intro: "저녁 러닝 같이", sports: ["gym", "running"], public: true, memberCount: 2 });
    expect(seen).not.toHaveProperty("pendingCount");
    expect((await send("GET", `/api/villas/${v.id}/recruit`, undefined, out.cookie)).status).toBe(404);
    // 켜고 끄기만 보내면 글은 그대로
    await putRecruit(owner, v.id, { open: false });
    expect(await get(owner, `/api/villas/${v.id}/recruit`)).toMatchObject({ open: false, intro: "저녁 러닝 같이", sports: ["gym", "running"] });
  });

  it("validates_intro_and_sports", async () => {
    const { owner, id } = await recruiting();
    expect((await putRecruit(owner, id, { open: true, intro: "가".repeat(61) })).status).toBe(400);
    expect((await putRecruit(owner, id, { open: true, intro: "😀".repeat(60) })).status).toBe(200);
    expect((await putRecruit(owner, id, { open: true, sports: ["swimming"] })).status).toBe(400);
    // 새 종목(요가 · 홈트)도 고를 수 있고 정해진 순서로 저장된다
    expect((await putRecruit(owner, id, { open: true, sports: ["hometraining", "gym", "yoga"] })).status).toBe(200);
    expect((await get(owner, `/api/villas/${id}/recruit`)).sports).toEqual(["gym", "yoga", "hometraining"]);
    expect((await putRecruit(owner, id, { open: true, sports: "gym" })).status).toBe(400);
    expect((await putRecruit(owner, id, { intro: "x" })).status).toBe(400);
    // 종목을 안 고르면 종목 상관없음
    expect((await putRecruit(owner, id, { open: true, sports: [] })).status).toBe(200);
    expect((await get(owner, `/api/villas/${id}/recruit`)).sports).toEqual([]);
  });

  it("cannot_open_when_full_and_turns_off_when_full_by_invite", async () => {
    const owner = await signup("방장");
    const v = await create(owner);
    await setPublic(owner, v.id, true);
    await fill(v.id, 20);
    const full = await putRecruit(owner, v.id, { open: true });
    expect(full.status).toBe(409);

    // 19명에서 모집 중 → 초대 링크로 20명째가 들어오면 모집이 꺼지고 기다리던 신청은 취소
    const r = await recruiting();
    const a = await signup("신청");
    const appId = await applied(a, r.id);
    await fill(r.id, 19);
    const last = await signup("막차");
    expect((await join(last, r.inviteToken)).status).toBe(200);
    expect(await recruitOpen(r.id)).toBe(false);
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "full" });
    expect((await ofType(a, "application_closed"))[0].payload).toMatchObject({ villaId: r.id, reason: "full" });
    expect((await get(r.owner, `/api/villas/${r.id}/recruit`)).open).toBe(false);
  });

  it("turning_off_or_hiding_from_map_cancels_pending", async () => {
    const r = await recruiting("끄는아파트");
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    expect((await putRecruit(r.owner, r.id, { open: false })).status).toBe(200);
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "recruit_off" });
    expect((await ofType(a, "application_closed"))[0].payload).toMatchObject({ villaName: "끄는아파트", reason: "recruit_off" });

    // 다시 켜고 신청 → 지도에서 내리면 모집도 꺼진다
    await putRecruit(r.owner, r.id, { open: true });
    const again = await applied(a, r.id);
    await setPublic(r.owner, r.id, false);
    expect(await recruitOpen(r.id)).toBe(false);
    expect(await appRow(again)).toEqual({ status: "cancelled", reason: "hidden" });
  });
});

describe("도시 지도의 모집 글", () => {
  it("shows_recruit_only_for_public_recruiting_villas_with_vacancies", async () => {
    const r = await recruiting("모집중아파트", { intro: "주말 등산 겸 클라이밍", sports: ["climbing"] });
    const quiet = await signup("조용");
    const qv = await create(quiet, "조용아파트");
    await setPublic(quiet, qv.id, true);
    const viewer = await signup("구경");

    const city = await get<CityResponse>(viewer, "/api/city");
    const rv = city.villas.find((v) => v.id === r.id)!;
    expect(rv.recruit).toEqual({ intro: "주말 등산 겸 클라이밍", sports: ["climbing"], vacancies: 19 });
    expect(city.villas.find((v) => v.id === qv.id)!.recruit).toBeUndefined();
    expect(city.myApplication).toBeNull();

    // 꽉 차면 숨긴다 (서버도 끈다)
    await fill(r.id, 20);
    expect((await get<CityResponse>(viewer, "/api/city")).villas.find((v) => v.id === r.id)!.recruit).toBeUndefined();
  });

  it("marks_blocked_for_banned_viewer_and_leaks_no_applicant_info", async () => {
    const r = await recruiting();
    const kicked = await signup("내보냄");
    await join(kicked, r.inviteToken);
    await send("POST", `/api/villas/${r.id}/members/${kicked.id}/kick`, undefined, r.owner.cookie);
    const applicant = await signup("비밀신청");
    await applied(applicant, r.id, "비밀스러운 한마디");

    const kc = await get<CityResponse>(kicked, "/api/city");
    expect(kc.villas.find((v) => v.id === r.id)!.recruit).toMatchObject({ blocked: true });
    // 다른 사람에게는 신청한 사람 · 남긴 말이 어디에도 없다
    const other = await signup("구경꾼");
    const raw = JSON.stringify(await get(other, "/api/city"));
    expect(raw).not.toContain("비밀신청");
    expect(raw).not.toContain("비밀스러운");
    expect(raw).not.toContain(applicant.id);
    expect((await get<CityResponse>(other, "/api/city")).villas.find((v) => v.id === r.id)!.recruit).not.toHaveProperty("blocked");
    // 신청한 사람은 자기 신청만 본다
    expect((await get<CityResponse>(applicant, "/api/city")).myApplication).toMatchObject({ villaId: r.id, message: "비밀스러운 한마디" });
  });
});

describe("입주 신청", () => {
  it("applies_with_message_and_notifies_owner", async () => {
    const r = await recruiting("신청아파트");
    const a = await signup("신청자");
    const res = await apply(a, r.id, "  매일 새벽 6시에 뛰어요  ");
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.pending).toMatchObject({ villaId: r.id, villaName: "신청아파트", message: "매일 새벽 6시에 뛰어요" });
    expect(body.pending.expiresAt - body.pending.createdAt).toBe(APPLY_TTL_MS);
    expect((await get(a, "/api/me/application")).pending.id).toBe(body.pending.id);
    const ev = await ofType(r.owner, "application_received");
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({ nickname: "신청자", villaId: r.id, multi: false });
    expect(await get(r.owner, "/api/badges")).toMatchObject({ applications: 1 });
    // 메시지 없이도 된다, 100자 넘으면 안 된다
    const b = await signup("비비");
    expect((await apply(b, r.id, "가".repeat(101))).status).toBe(400);
    expect((await apply(b, r.id)).status).toBe(201);
  });

  it("refuses_member_banned_not_recruiting_and_three_villa_limit", async () => {
    const r = await recruiting();
    const mate = await signup("짝꿍");
    await join(mate, r.inviteToken);
    const m = await apply(mate, r.id);
    expect(m.status).toBe(409);
    expect(await err(m)).toBe("이미 이 아파트에 살고 있어요");

    const kicked = await signup("내보냄");
    await join(kicked, r.inviteToken);
    await send("POST", `/api/villas/${r.id}/members/${kicked.id}/kick`, undefined, r.owner.cookie);
    const k = await apply(kicked, r.id);
    expect(k.status).toBe(403);
    expect(await err(k)).toBe(APPLY_BLOCKED_MSG);

    const quietOwner = await signup("조용");
    const qv = await create(quietOwner);
    await setPublic(quietOwner, qv.id, true);
    const q = await apply(mate, qv.id);
    expect(q.status).toBe(409);
    expect(await err(q)).toContain("모집하지 않는");

    // 아파트 3곳에 사는 사람
    const busy = await signup("바쁨");
    await create(busy, "하나");
    await create(busy, "둘");
    await create(busy, "셋");
    const l = await apply(busy, r.id);
    expect(l.status).toBe(409);
    expect(await err(l)).toBe(VILLA_LIMIT_MSG);
    expect((await send("POST", `/api/villas/${r.id}/apply`, {})).status).toBe(401);
  });

  it("allows_one_pending_at_a_time_and_cancel_frees_it", async () => {
    const r1 = await recruiting("첫째");
    const r2 = await recruiting("둘째");
    const a = await signup("에이");
    const first = await applied(a, r1.id);
    const same = await apply(a, r1.id);
    expect(same.status).toBe(409);
    expect(await err(same)).toContain("이미 이 아파트에 신청했어요");
    const other = await apply(a, r2.id);
    expect(other.status).toBe(409);
    expect(await err(other)).toBe(APPLY_ONE_AT_A_TIME_MSG);

    // 남의 신청은 취소할 수 없다
    const b = await signup("비비");
    expect((await send("POST", `/api/applications/${first}/cancel`, undefined, b.cookie)).status).toBe(409);
    expect((await send("POST", `/api/applications/${first}/cancel`, undefined, a.cookie)).status).toBe(200);
    expect(await appRow(first)).toEqual({ status: "cancelled", reason: "withdrawn" });
    expect((await get(a, "/api/me/application")).pending).toBeNull();
    expect(await get(r1.owner, `/api/villas/${r1.id}/applications`)).toEqual([]);
    await applied(a, r2.id);
  });

  it("concurrent_applies_to_two_villas_keep_only_one", async () => {
    const r1 = await recruiting("동시1");
    const r2 = await recruiting("동시2");
    const a = await signup("동시");
    const res = await Promise.all([apply(a, r1.id), apply(a, r2.id)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    const { c } = (await env.DB.prepare("SELECT COUNT(*) AS c FROM villa_applications WHERE user_id = ? AND status = 'pending'").bind(a.id).first<{ c: number }>())!;
    expect(c).toBe(1);
  });

  it("expired_application_is_ignored_on_read_and_frees_the_slot", async () => {
    const t0 = Date.parse("2026-11-19T10:00:00+09:00");
    setNow(() => t0);
    const r1 = await recruiting("만료1");
    const r2 = await recruiting("만료2");
    const a = await signup("에이");
    const old = await applied(a, r1.id);
    setNow(() => t0 + APPLY_TTL_MS + 1);
    expect((await get(a, "/api/me/application")).pending).toBeNull();
    expect(await get(r1.owner, `/api/villas/${r1.id}/applications`)).toEqual([]);
    expect(await get(r1.owner, "/api/badges")).toMatchObject({ applications: 0 });
    // 만료된 신청은 승인 · 거절할 수 없다
    const ap = await approve(r1.owner, r1.id, old);
    expect(ap.status).toBe(409);
    expect(await err(ap)).toContain("만료");
    expect(await appRow(old)).toEqual({ status: "expired", reason: "expired" });
    await applied(a, r2.id);
  });
});

describe("승인 · 거절", () => {
  it("approve_joins_like_invite_link", async () => {
    const r = await recruiting("승인아파트");
    const mate = await signup("짝꿍");
    await join(mate, r.inviteToken);
    const a = await signup("새식구");
    // 다른 아파트에 살면서 신청한다 (3곳 안)
    await create(a, "원래아파트");
    await env.DB.prepare("UPDATE users SET streak = 9 WHERE id = ?").bind(a.id).run();
    // 오늘 사진 인증도 했다 → 목록의 연속 기록은 아파트 화면처럼 오늘까지 친 10일
    await env.DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES (?, ?, ?, 'photo', 20, 0, 1)")
      .bind(crypto.randomUUID(), a.id, kstDay(Date.now()))
      .run();
    const appId = await applied(a, r.id, "잘 부탁해요");

    const list = await get<any[]>(r.owner, `/api/villas/${r.id}/applications`);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: appId, userId: a.id, nickname: "새식구", streak: 10, message: "잘 부탁해요" });
    expect(list[0].avatar).toBeTypeOf("object");
    // 방장이 아니면 목록을 못 본다
    expect((await send("GET", `/api/villas/${r.id}/applications`, undefined, mate.cookie)).status).toBe(403);
    expect((await send("GET", `/api/villas/${r.id}/applications`, undefined, a.cookie)).status).toBe(403);
    expect((await approve(mate, r.id, appId)).status).toBe(403);

    const ok = await approve(r.owner, r.id, appId);
    expect(ok.status).toBe(200);
    expect(await membership(a.id, r.id)).toEqual({ floor: 1, streak: 0 });
    expect(await appRow(appId)).toMatchObject({ status: "approved" });
    // 신청한 사람: 신청 승인 표시가 붙은 입주 카드, 원래 입주민: 새 이웃
    const welcome = (await ofType(a, "welcome")).find((e) => e.payload.villaId === r.id)!;
    expect(welcome.payload).toMatchObject({ villaName: "승인아파트", via: "recruit", multi: true });
    expect((await ofType(mate, "friend_joined")).some((e) => e.payload.nickname === "새식구")).toBe(true);
    expect((await ofType(r.owner, "friend_joined")).some((e) => e.payload.nickname === "새식구")).toBe(true);
    // 아파트 화면에 바로 나온다, 1등 계산도 돈다
    const villa = await get(a, `/api/villas/${r.id}`);
    expect(villa.members.map((m: any) => m.userId)).toContain(a.id);
    expect(villa.penthouseUserId).not.toBeNull();
    expect(await get(r.owner, `/api/villas/${r.id}/applications`)).toEqual([]);
    expect((await get(a, "/api/me/application")).pending).toBeNull();

    // 두 번 눌러도 입주는 한 번
    const again = await approve(r.owner, r.id, appId);
    expect(again.status).toBe(409);
    const { c } = (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE user_id = ? AND villa_id = ?").bind(a.id, r.id).first<{ c: number }>())!;
    expect(c).toBe(1);
  });

  it("double_approve_at_once_joins_once", async () => {
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    const res = await Promise.all([approve(r.owner, r.id, appId), approve(r.owner, r.id, appId)]);
    expect(res.map((x) => x.status).sort()).toEqual([200, 409]);
    const { c } = (await env.DB.prepare("SELECT COUNT(*) AS c FROM memberships WHERE user_id = ? AND villa_id = ?").bind(a.id, r.id).first<{ c: number }>())!;
    expect(c).toBe(1);
  });

  it("approve_turns_recruiting_off_at_capacity", async () => {
    const r = await recruiting();
    const a = await signup("마지막");
    const b = await signup("다음");
    const appA = await applied(a, r.id);
    // b 는 다른 아파트에 신청하지 않고 같은 아파트에 (한 사람 한 곳이라 a, b 각각)
    const appB = await applied(b, r.id);
    await fill(r.id, 19);
    expect((await approve(r.owner, r.id, appA)).status).toBe(200);
    expect(await recruitOpen(r.id)).toBe(false);
    expect(await appRow(appB)).toEqual({ status: "cancelled", reason: "full" });
    expect((await ofType(b, "application_closed"))[0].payload).toMatchObject({ reason: "full" });
  });

  it("approve_fails_when_applicant_reached_three_villas_meanwhile", async () => {
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    await create(a, "하나");
    await create(a, "둘");
    await create(a, "셋");
    const res = await approve(r.owner, r.id, appId);
    expect(res.status).toBe(409);
    expect(await err(res)).toContain("3곳");
    expect(await membership(a.id, r.id)).toBeNull();
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "limit" });
    expect((await ofType(a, "application_closed"))[0].payload).toMatchObject({ reason: "limit" });
  });

  it("approve_fails_when_villa_filled_meanwhile", async () => {
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    // 모집 글은 그대로 둔 채 (서버가 끄기 전에) 정원이 찼다
    await fill(r.id, 20);
    const res = await approve(r.owner, r.id, appId);
    expect(res.status).toBe(409);
    expect(await err(res)).toContain("꽉");
    expect(await membership(a.id, r.id)).toBeNull();
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "full" });
    expect(await recruitOpen(r.id)).toBe(false);
  });

  it("owner_change_moves_the_list_to_new_owner", async () => {
    const r = await recruiting();
    const mate = await signup("새방장");
    await join(mate, r.inviteToken);
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    expect((await send("POST", `/api/villas/${r.id}/transfer`, { userId: mate.id }, r.owner.cookie)).status).toBe(200);
    expect((await approve(r.owner, r.id, appId)).status).toBe(403);
    expect((await reject(r.owner, r.id, appId)).status).toBe(403);
    expect(await appRow(appId)).toMatchObject({ status: "pending" });
    expect((await get<any[]>(mate, `/api/villas/${r.id}/applications`)).map((x) => x.id)).toEqual([appId]);
    expect((await approve(mate, r.id, appId)).status).toBe(200);
  });

  it("approve_refuses_banned_applicant", async () => {
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    // 신청 뒤에 입주 금지가 생긴 경우 (예: 예전에 내보낸 기록을 되살림)
    await env.DB.prepare("INSERT INTO villa_bans (villa_id, user_id, created_at) VALUES (?, ?, 0)").bind(r.id, a.id).run();
    const res = await approve(r.owner, r.id, appId);
    expect(res.status).toBe(409);
    expect(await membership(a.id, r.id)).toBeNull();
    expect(await appRow(appId)).toEqual({ status: "rejected", reason: "banned" });
  });

  it("reject_notifies_gently_and_hides_from_list", async () => {
    const r = await recruiting("거절아파트");
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    expect((await reject(r.owner, r.id, appId)).status).toBe(200);
    expect(await appRow(appId)).toMatchObject({ status: "rejected" });
    expect(await get(r.owner, `/api/villas/${r.id}/applications`)).toEqual([]);
    const ev = await ofType(a, "application_rejected");
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({ villaName: "거절아파트" });
    expect((await reject(r.owner, r.id, appId)).status).toBe(409);
    expect((await approve(r.owner, r.id, appId)).status).toBe(409);
    // 거절된 뒤 다시 신청할 수 있다 (금지는 아니다)
    await applied(a, r.id);
  });
});

describe("아파트 일과 신청", () => {
  it("invite_join_closes_own_pending_and_kick_rejects_it", async () => {
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    await join(a, r.inviteToken);
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "joined" });

    // 안전망: 입주민인데 남아 있던 신청은 내보낼 때 거절로 끝난다
    const leftover = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO villa_applications (id, villa_id, user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(leftover, r.id, a.id, Date.now()).run();
    await send("POST", `/api/villas/${r.id}/members/${a.id}/kick`, undefined, r.owner.cookie);
    expect(await appRow(leftover)).toEqual({ status: "rejected", reason: "kicked" });
  });

  it("dissolve_cancels_pending_and_notifies", async () => {
    const r = await recruiting("해체아파트");
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    expect((await send("POST", `/api/villas/${r.id}/dissolve`, { confirmName: "해체아파트" }, r.owner.cookie)).status).toBe(200);
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "dissolved" });
    expect((await ofType(a, "application_closed"))[0].payload).toMatchObject({ villaName: "해체아파트", reason: "dissolved" });
    expect((await get(a, "/api/me/application")).pending).toBeNull();
  });

  it("last_member_leaving_cancels_pending", async () => {
    const r = await recruiting("혼자아파트");
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    expect((await send("POST", `/api/villas/${r.id}/leave`, undefined, r.owner.cookie)).status).toBe(200);
    expect(await appRow(appId)).toEqual({ status: "cancelled", reason: "dissolved" });
  });

  it("account_deletion_removes_applications", async () => {
    const r = await recruiting();
    const a = await signup("탈퇴");
    await applied(a, r.id);
    expect((await send("DELETE", "/api/me", undefined, a.cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 AS x FROM villa_applications WHERE user_id = ?").bind(a.id).first()).toBeNull();
  });
});

describe("크론 정리", () => {
  it("purges_expired_and_old_rows_and_notifies", async () => {
    const t0 = Date.parse("2026-11-01T10:00:00+09:00");
    setNow(() => t0);
    const r = await recruiting("오래된아파트");
    const a = await signup("에이");
    const b = await signup("비비");
    const stale = await applied(a, r.id);
    const decided = await applied(b, r.id);
    await reject(r.owner, r.id, decided);
    setNow(() => t0 + 31 * 24 * 3600_000);
    const fresh = await signup("씨씨");
    const freshApp = await applied(fresh, r.id);

    const res = await purgeApplications(env);
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect(await appRow(stale)).toEqual({ status: "expired", reason: "expired" });
    expect(await appRow(decided)).toBeNull(); // 끝난 지 30일 넘은 기록은 지운다
    expect(await appRow(freshApp)).toMatchObject({ status: "pending" });
    // (세션은 30일이라 만료됐으니 DB 로 본다)
    const ev = await env.DB.prepare("SELECT payload FROM events WHERE user_id = ? AND type = 'application_closed'").bind(a.id).first<{ payload: string }>();
    expect(JSON.parse(ev!.payload)).toMatchObject({ reason: "expired", villaName: "오래된아파트" });
  });

  it("settle_through_runs_application_purge", async () => {
    const t0 = Date.parse("2026-12-20T10:00:00+09:00");
    setNow(() => t0);
    const r = await recruiting();
    const a = await signup("에이");
    const appId = await applied(a, r.id);
    setNow(() => t0 + APPLY_TTL_MS + 60_000);
    await settleThrough(env, kstDay(t0 + APPLY_TTL_MS));
    expect(await appRow(appId)).toMatchObject({ status: "expired" });
  });
});
