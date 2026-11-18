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
  const r = await app.request("/api/villas", json(cookie, { name: "빌라" }), env);
  return (await r.json<any>()).inviteToken as string;
}
const join = (cookie: string, token: string) => app.request(`/api/invite/${token}/join`, json(cookie, {}), env);
async function photo(cookie: string) {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(500).fill(7)], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", "0000000000000000");
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, env);
  return (await r.json<any>()).certId as string;
}
const report = (cookie: string, id: string) => app.request(`/api/certs/${id}/report`, { method: "POST", headers: { cookie } }, env);
const del = (cookie: string, id: string) => app.request(`/api/certs/${id}`, { method: "DELETE", headers: { cookie } }, env);
const hidden = async (id: string) =>
  (await env.DB.prepare("SELECT hidden FROM certs WHERE id = ?").bind(id).first<{ hidden: number }>())!.hidden;

/** 방장 + 사진 올린 사람 + 일반 입주민 3명이 있는 빌라 */
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
    expect(await env.DB.prepare("SELECT 1 FROM certs WHERE id = ?").bind(certId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM reports WHERE cert_id = ?").bind(certId).first()).toBeNull();
    expect(await pts()).toBe(before);
    expect((await del(owner.cookie, certId)).status).toBe(404);
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
