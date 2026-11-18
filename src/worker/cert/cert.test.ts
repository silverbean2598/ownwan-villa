import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";

let n = 0;
async function signup() {
  const username = `cert${Date.now().toString(36)}${n++}`.slice(0, 16);
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
const leave = (cookie: string) => app.request("/api/villas/leave", json(cookie, {}), env);

function hash(i: number, flip = 0) {
  // 서로 멀리 떨어진 16자 hex (i마다 비트가 크게 다름)
  const base = ["0000000000000000", "ffffffffffffffff", "00000000ffffffff", "ffffffff00000000", "0f0f0f0f0f0f0f0f"][i];
  if (!flip) return base;
  const last = (parseInt(base.slice(-1), 16) ^ ((1 << flip) - 1)) & 15;
  return base.slice(0, -1) + last.toString(16);
}
function upload(cookie: string, opts: { dhash?: string; type?: string; size?: number; noFile?: boolean; notJpeg?: boolean } = {}) {
  const fd = new FormData();
  if (!opts.noFile) {
    const bytes = new Uint8Array(opts.size ?? 1000).fill(7);
    if (!opts.notJpeg) bytes.set([0xff, 0xd8, 0xff]);
    fd.set("file", new File([bytes], "a.jpg", { type: opts.type ?? "image/jpeg" }));
  }
  if (opts.dhash !== undefined) fd.set("dhash", opts.dhash);
  return app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, env);
}
const board = (cookie: string, id: string, q = "") => app.request(`/api/users/${id}/board${q}`, { headers: { cookie } }, env);
const points = async (id: string) =>
  (await env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(id).first<{ points: number }>())!.points;

afterEach(() => setNow(null));

describe("photo cert", () => {
  it("points_decrease_per_photo", async () => {
    const u = await signup();
    const got: number[] = [];
    for (let i = 0; i < 4; i++) got.push((await (await upload(u.cookie, { dhash: hash(i) })).json<any>()).points);
    expect(got).toEqual([20, 10, 5, 0]);
    expect(await points(u.id)).toBe(35);
  });

  it("duplicate_photo_no_points_no_cert", async () => {
    const u = await signup();
    const first = await (await upload(u.cookie, { dhash: hash(0) })).json<any>();
    expect(first.certifiedToday).toBe(true);
    const u2 = await signup();
    // u2: 같은 사진을 두 번. 첫 사진은 인증으로 친다 → 새 사용자로 확인
    await upload(u2.cookie, { dhash: hash(1) });
    const dup = await (await upload(u2.cookie, { dhash: hash(1, 3) })).json<any>();
    expect(dup).toMatchObject({ duplicate: true, points: 0 });
    // 그날 다른 사진이 없으면 오늘 인증이 아니다: 전날 사진과 같은 사진
    const u3 = await signup();
    setNow(() => Date.UTC(2026, 10, 18, 3, 0, 0));
    await upload(u3.cookie, { dhash: hash(2) });
    setNow(() => Date.UTC(2026, 10, 19, 3, 0, 0));
    const d = await (await upload(u3.cookie, { dhash: hash(2, 2) })).json<any>();
    expect(d).toMatchObject({ duplicate: true, points: 0, certifiedToday: false });
    const row = await env.DB.prepare("SELECT duplicate, points, r2_key FROM certs WHERE id = ?").bind(d.certId).first<any>();
    expect(row.duplicate).toBe(1);
    expect(await env.PHOTOS.head(row.r2_key)).not.toBeNull();
  });

  it("hamming_6_is_not_duplicate", async () => {
    const u = await signup();
    await upload(u.cookie, { dhash: "0000000000000000" });
    const r = await (await upload(u.cookie, { dhash: "000000000000003f" })).json<any>();
    expect(r.duplicate).toBe(false);
    const r2 = await (await upload(u.cookie, { dhash: "0000000000000000" })).json<any>();
    expect(r2.duplicate).toBe(true);
  });

  it("concurrent_uploads_award_35_total", async () => {
    const u = await signup();
    const rs = await Promise.all([0, 1, 2].map((i) => upload(u.cookie, { dhash: hash(i) })));
    const pts = (await Promise.all(rs.map((r) => r.json<any>()))).map((b) => b.points).sort((a, b) => b - a);
    expect(pts).toEqual([20, 10, 5]);
    expect(await points(u.id)).toBe(35);
  });

  it("validates_input", async () => {
    const u = await signup();
    expect((await upload(u.cookie, { noFile: true, dhash: hash(0) })).status).toBe(400);
    expect((await upload(u.cookie, {})).status).toBe(400);
    expect((await upload(u.cookie, { dhash: "XYZ" })).status).toBe(400);
    expect((await upload(u.cookie, { dhash: "ABCDEF0123456789" })).status).toBe(400);
    const t = await upload(u.cookie, { dhash: hash(0), type: "image/png" });
    expect(t.status).toBe(415);
    expect((await t.json<any>()).error).toBe("JPEG 사진만 올릴 수 있어요");
    const big = await upload(u.cookie, { dhash: hash(0), size: 300 * 1024 + 1 });
    expect(big.status).toBe(413);
    expect((await big.json<any>()).error).toBe("사진이 너무 커요");
    expect((await upload(u.cookie, { dhash: hash(0), size: 300 * 1024 })).status).toBe(200);
    // image/jpeg 라고 해도 내용이 JPEG(FF D8 FF)가 아니면 받지 않는다
    const fake = await upload(u.cookie, { dhash: hash(1), notJpeg: true });
    expect(fake.status).toBe(415);
    expect((await fake.json<any>()).error).toBe("JPEG 사진만 올릴 수 있어요");
    expect((await app.request("/api/certs/photo", { method: "POST", body: new FormData() }, env)).status).toBe(401);
  });

  it("day_boundary_uses_upload_time", async () => {
    const u = await signup();
    setNow(() => Date.UTC(2026, 10, 18, 14, 59, 50));
    const a = await (await upload(u.cookie, { dhash: hash(0) })).json<any>();
    setNow(() => Date.UTC(2026, 10, 18, 15, 0, 5));
    const b = await (await upload(u.cookie, { dhash: hash(1) })).json<any>();
    const day = async (id: string) => (await env.DB.prepare("SELECT day FROM certs WHERE id = ?").bind(id).first<any>()).day;
    expect(await day(a.certId)).toBe("2026-11-18");
    expect(await day(b.certId)).toBe("2026-11-19");
    expect(b.points).toBe(20);
  });
});

describe("routine cert", () => {
  it("routine_once_per_day_points", async () => {
    const u = await signup();
    const a = await (await app.request("/api/certs/routine", json(u.cookie, { body: "스쿼트" }), env)).json<any>();
    const b = await (await app.request("/api/certs/routine", json(u.cookie, { body: "데드" }), env)).json<any>();
    expect([a.points, b.points]).toEqual([10, 0]);
    expect(await points(u.id)).toBe(10);
  });
  it("concurrent_routines_award_once", async () => {
    const u = await signup();
    const rs = await Promise.all([1, 2, 3].map((i) => app.request("/api/certs/routine", json(u.cookie, { body: `r${i}` }), env)));
    const pts = (await Promise.all(rs.map((r) => r.json<any>()))).map((b) => b.points).sort((a, b) => b - a);
    expect(pts).toEqual([10, 0, 0]);
    expect(await points(u.id)).toBe(10);
  });
  it("validates_body", async () => {
    const u = await signup();
    expect((await app.request("/api/certs/routine", json(u.cookie, { body: "   " }), env)).status).toBe(400);
    expect((await app.request("/api/certs/routine", json(u.cookie, { body: "가".repeat(1001) }), env)).status).toBe(400);
    expect((await app.request("/api/certs/routine", json(u.cookie, { body: "가".repeat(1000) }), env)).status).toBe(200);
  });
});

describe("board and photos", () => {
  it("owner_and_housemate_can_view_board", async () => {
    const a = await signup();
    const b = await signup();
    await join(b.cookie, await makeVilla(a.cookie));
    const cert = await (await upload(a.cookie, { dhash: hash(0) })).json<any>();
    await app.request("/api/certs/routine", json(a.cookie, { body: "루틴글" }), env);
    for (const viewer of [a, b]) {
      const res = await board(viewer.cookie, a.id);
      expect(res.status).toBe(200);
      const items = await res.json<any[]>();
      expect(items.map((i) => i.kind)).toEqual(["routine", "photo"]);
      expect(items[0].body).toBe("루틴글");
      expect(items[1].photoUrl).toBe(`/api/photos/${cert.certId}`);
      expect(items[1].hidden).toBe(false);
    }
    const p = await app.request(`/api/photos/${cert.certId}`, { headers: { cookie: b.cookie } }, env);
    expect(p.status).toBe(200);
    expect(p.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(p.headers.get("content-type")).toBe("image/jpeg");
    expect(p.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await p.arrayBuffer()).byteLength).toBe(1000);
  });

  it("board_paging", async () => {
    const a = await signup();
    let t = Date.UTC(2026, 10, 18, 3);
    setNow(() => t);
    for (let i = 0; i < 3; i++) {
      t += 1000;
      await app.request("/api/certs/routine", json(a.cookie, { body: `r${i}` }), env);
    }
    const all = await (await board(a.cookie, a.id)).json<any[]>();
    expect(all.map((i) => i.body)).toEqual(["r2", "r1", "r0"]);
    const page = await (await board(a.cookie, a.id, `?before=${all[0].createdAt}&limit=1`)).json<any[]>();
    expect(page.map((i) => i.body)).toEqual(["r1"]);
  });

  it("board_forbidden_to_other_villa", async () => {
    const a = await signup();
    const x = await signup();
    await makeVilla(a.cookie);
    await makeVilla(x.cookie);
    const cert = await (await upload(a.cookie, { dhash: hash(0) })).json<any>();
    const r = await board(x.cookie, a.id);
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toBe("같은 빌라 입주민만 볼 수 있어요");
    expect((await app.request(`/api/photos/${cert.certId}`, { headers: { cookie: x.cookie } }, env)).status).toBe(403);
    const loner = await signup();
    expect((await board(loner.cookie, a.id)).status).toBe(403);
    expect((await board(loner.cookie, loner.id)).status).toBe(200);
  });

  it("board_visible_after_move", async () => {
    const a = await signup(); // A 빌라 방장
    const m = await signup(); // 이동할 사람
    const x = await signup(); // B 빌라 방장
    const tokA = await makeVilla(a.cookie);
    const tokB = await makeVilla(x.cookie);
    await join(m.cookie, tokA);
    await upload(m.cookie, { dhash: hash(0) });
    expect((await board(a.cookie, m.id)).status).toBe(200);
    expect((await board(x.cookie, m.id)).status).toBe(403);
    await leave(m.cookie);
    await join(m.cookie, tokB);
    expect((await board(x.cookie, m.id)).status).toBe(200);
    expect((await board(a.cookie, m.id)).status).toBe(403);
  });

  it("hidden_items_omit_content", async () => {
    const a = await signup();
    const r = await (await app.request("/api/certs/routine", json(a.cookie, { body: "비밀루틴" }), env)).json<any>();
    const p = await (await upload(a.cookie, { dhash: hash(0) })).json<any>();
    await env.DB.prepare("UPDATE certs SET hidden = 1 WHERE id IN (?, ?)").bind(r.certId, p.certId).run();
    const res = await board(a.cookie, a.id);
    const text = await res.text();
    expect(text).not.toContain("비밀루틴");
    expect(text).not.toContain("photoUrl");
    const items = JSON.parse(text);
    expect(items).toHaveLength(2);
    expect(Object.keys(items[0]).sort()).toEqual(["createdAt", "day", "hidden", "id", "kind"]);
  });

  it("hidden_photo_is_404", async () => {
    const a = await signup();
    const cert = await (await upload(a.cookie, { dhash: hash(0) })).json<any>();
    await env.DB.prepare("UPDATE certs SET hidden = 1 WHERE id = ?").bind(cert.certId).run();
    expect((await app.request(`/api/photos/${cert.certId}`, { headers: { cookie: a.cookie } }, env)).status).toBe(404);
    const items = await (await board(a.cookie, a.id)).json<any[]>();
    expect(items[0].hidden).toBe(true);
    expect((await app.request(`/api/photos/nope`, { headers: { cookie: a.cookie } }, env)).status).toBe(404);
  });
});
