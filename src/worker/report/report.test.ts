import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";

let n = 0;
async function signup() {
  const username = `rp${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await app.request(
    "/api/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "password1", nickname: "운동러", over14: true, agree: true }),
    },
    env,
  );
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const me = await (await app.request("/api/me", { headers: { cookie } }, env)).json<any>();
  return { cookie, id: me.id as string };
}
const json = (cookie: string, body: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify(body),
});
async function makeVilla(cookie: string) {
  const r = await app.request("/api/villas", json(cookie, { name: "아파트" }), env);
  return (await r.json<any>()).inviteToken as string;
}
const join = (cookie: string, token: string) => app.request(`/api/invite/${token}/join`, json(cookie, {}), env);
function jpeg(n: number, fill: number) {
  const b = new Uint8Array(n).fill(fill);
  b.set([0xff, 0xd8, 0xff]);
  return b;
}
async function photo(cookie: string) {
  const fd = new FormData();
  fd.set("file", new File([jpeg(500, 7)], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", "0000000000000000");
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, env);
  return (await r.json<any>()).certId as string;
}
const report = (cookie: string, id: string) => app.request(`/api/certs/${id}/report`, { method: "POST", headers: { cookie } }, env);
const del = (cookie: string, id: string) => app.request(`/api/certs/${id}`, { method: "DELETE", headers: { cookie } }, env);
const hidden = async (id: string) =>
  (await env.DB.prepare("SELECT hidden FROM certs WHERE id = ?").bind(id).first<{ hidden: number }>())!.hidden;

/** 방장 + 사진 올린 사람 + 일반 입주민 3명이 있는 아파트 */
async function setup() {
  const owner = await signup();
  const token = await makeVilla(owner.cookie);
  const author = await signup();
  await join(author.cookie, token);
  const others = [await signup(), await signup(), await signup()];
  for (const o of others) await join(o.cookie, token);
  return { owner, author, others, certId: await photo(author.cookie) };
}

describe("report", () => {
  it("three_reports_hide_photo", async () => {
    const { owner, others, certId } = await setup();
    const r1 = await (await report(others[0].cookie, certId)).json<any>();
    const r2 = await (await report(others[1].cookie, certId)).json<any>();
    expect(r1.hidden).toBe(false);
    expect(r2.hidden).toBe(false);
    expect(await hidden(certId)).toBe(0);
    expect((await (await report(owner.cookie, certId)).json<any>()).hidden).toBe(true);
    expect(await hidden(certId)).toBe(1);
  });

  it("concurrent_three_reports_hide", async () => {
    const { others, certId } = await setup();
    const rs = await Promise.all(others.map((o) => report(o.cookie, certId)));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await hidden(certId)).toBe(1);
  });

  it("same_person_twice_counts_once", async () => {
    const { others, certId } = await setup();
    await report(others[0].cookie, certId);
    const again = await report(others[0].cookie, certId);
    expect(again.status).toBe(200);
    await report(others[0].cookie, certId);
    const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM reports WHERE cert_id = ?").bind(certId).first<{ c: number }>();
    expect(c!.c).toBe(1);
    expect(await hidden(certId)).toBe(0);
  });

  it("other_villa_and_own_and_routine_rejected", async () => {
    const { author, certId } = await setup();
    const stranger = await signup();
    await makeVilla(stranger.cookie);
    expect((await report(stranger.cookie, certId)).status).toBe(403);
    const loner = await signup();
    expect((await report(loner.cookie, certId)).status).toBe(403);
    const own = await report(author.cookie, certId);
    expect(own.status).toBe(400);
    expect((await own.json<any>()).error).toBe("내 사진은 신고할 수 없어요");
    expect((await report(author.cookie, "nope")).status).toBe(404);

    const rr = await app.request("/api/certs/routine", json(author.cookie, { body: "달리기" }), env);
    const routineId = (await rr.json<any>()).certId;
    const owner2 = await signup();
    const tok = await makeVilla(owner2.cookie);
    const a2 = await signup();
    await join(a2.cookie, tok);
    const rr2 = await app.request("/api/certs/routine", json(a2.cookie, { body: "달리기" }), env);
    expect((await report(owner2.cookie, (await rr2.json<any>()).certId)).status).toBe(400);
    expect(routineId).toBeTruthy();
  });
});

describe("delete", () => {
  it("owner_deletes_photo_blob_rows_and_keeps_points", async () => {
    const { owner, author, others, certId } = await setup();
    const key = (await env.DB.prepare("SELECT r2_key FROM certs WHERE id = ?").bind(certId).first<{ r2_key: string }>())!.r2_key;
    expect(await env.PHOTOS.get(key)).not.toBeNull();
    await report(others[0].cookie, certId);
    const pts = async () => (await env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(author.id).first<{ points: number }>())!.points;
    const before = await pts();
    expect((await del(owner.cookie, certId)).status).toBe(200);
    expect(await env.PHOTOS.get(key)).toBeNull();
    // 행은 남기고(소프트 삭제) 표시만 한다: 같은 날 순번 · 중복 판정에 계속 쓰인다
    expect(await env.DB.prepare("SELECT deleted, body FROM certs WHERE id = ?").bind(certId).first()).toEqual({ deleted: 1, body: null });
    expect(await env.DB.prepare("SELECT 1 FROM reports WHERE cert_id = ?").bind(certId).first()).toBeNull();
    expect(await pts()).toBe(before);
    const again = await del(owner.cookie, certId);
    expect(again.status).toBe(404);
    expect((await again.json<any>()).error).toBe("사진을 찾을 수 없어요");
  });

  it("not_found_copy_photo_vs_routine", async () => {
    const { author } = await setup();
    const r = await app.request("/api/certs/routine", json(author.cookie, { body: "루틴" }), env);
    const routineId = (await r.json<any>()).certId as string;
    expect((await del(author.cookie, routineId)).status).toBe(200);
    const again = await del(author.cookie, routineId);
    expect(again.status).toBe(404);
    expect((await again.json<any>()).error).toBe("기록을 찾을 수 없어요");
    const none = await del(author.cookie, "nope");
    expect((await none.json<any>()).error).toBe("기록을 찾을 수 없어요");
    expect((await (await report(author.cookie, "nope")).json<any>()).error).toBe("사진을 찾을 수 없어요");
  });

  it("author_can_delete_own", async () => {
    const { author, certId } = await setup();
    expect((await del(author.cookie, certId)).status).toBe(200);
  });

  it("regular_member_cannot_delete_others_photo", async () => {
    const { others, certId } = await setup();
    expect((await del(others[0].cookie, certId)).status).toBe(403);
    expect(await env.DB.prepare("SELECT 1 FROM certs WHERE id = ?").bind(certId).first()).not.toBeNull();
  });

  it("owner_of_other_villa_cannot_delete", async () => {
    const { certId } = await setup();
    const stranger = await signup();
    await makeVilla(stranger.cookie);
    expect((await del(stranger.cookie, certId)).status).toBe(403);
  });
});

async function photoWith(cookie: string, dhash: string) {
  const fd = new FormData();
  fd.set("file", new File([jpeg(500, 9)], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", dhash);
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, env);
  return r.json<any>();
}

describe("soft delete", () => {
  it("reupload_same_photo_after_delete_is_duplicate", async () => {
    const { author } = await setup(); // setup 이 0000… 사진을 이미 올렸다
    const first = await photoWith(author.cookie, "ffffffffffffffff");
    expect(first.points).toBe(10);
    expect((await del(author.cookie, first.certId)).status).toBe(200);
    const again = await photoWith(author.cookie, "ffffffffffffffff");
    expect(again).toMatchObject({ duplicate: true, points: 0 });
  });

  it("delete_then_different_photo_keeps_numbering", async () => {
    const u = await signup();
    const a = await photoWith(u.cookie, "0000000000000000");
    expect(a.points).toBe(20);
    expect((await del(u.cookie, a.certId)).status).toBe(200);
    const b = await photoWith(u.cookie, "ffffffffffffffff");
    expect(b).toMatchObject({ duplicate: false, points: 10 });
    // 지운 뒤 아무 사진도 없으면 오늘 인증이 아니다
    const c = await signup();
    const only = await photoWith(c.cookie, "0000000000000000");
    await del(c.cookie, only.certId);
    const routine = await (await app.request("/api/certs/routine", json(c.cookie, { body: "루틴" }), env)).json<any>();
    await del(c.cookie, routine.certId);
    const r2 = await (await app.request("/api/certs/routine", json(c.cookie, { body: "다시" }), env)).json<any>();
    expect(r2.points).toBe(0); // 루틴 하루 1회 판정에도 지운 글이 남는다
  });

  it("deleted_photo_hidden_everywhere", async () => {
    const owner = await signup();
    const token = await makeVilla(owner.cookie);
    const u = await signup();
    await join(u.cookie, token);
    const p = await photoWith(u.cookie, "0000000000000000");
    expect((await del(u.cookie, p.certId)).status).toBe(200);
    const items = await (await app.request(`/api/users/${u.id}/board`, { headers: { cookie: owner.cookie } }, env)).json<any[]>();
    expect(items).toEqual([]);
    expect((await app.request(`/api/photos/${p.certId}`, { headers: { cookie: u.cookie } }, env)).status).toBe(404);
    const mine = await (await app.request("/api/villas/mine", { headers: { cookie: owner.cookie } }, env)).json<any>();
    expect(mine.members.find((m: any) => m.userId === u.id).certifiedToday).toBe(false);
    expect((await report(owner.cookie, p.certId)).status).toBe(404);
    // 사진 응답의 certifiedToday 도 지운 사진을 세지 않는다: 같은 사진 다시 올리면 중복이고 오늘 인증 아님
    const dup = await photoWith(u.cookie, "0000000000000000");
    expect(dup).toMatchObject({ duplicate: true, certifiedToday: false });
  });
});
