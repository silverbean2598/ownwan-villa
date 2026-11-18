import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { setNow } from "../clock";

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
  const username = `ch${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await send("POST", "/api/signup", undefined, { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie, nickname };
}
type U = Awaited<ReturnType<typeof signup>>;
let h = 0;
async function photo(u: U) {
  const fd = new FormData();
  const bytes = new Uint8Array(500).fill(7);
  bytes.set([0xff, 0xd8, 0xff]);
  fd.set("file", new File([bytes], "a.jpg", { type: "image/jpeg" }));
  // 서로 멀리 떨어진 해시: 중복 사진으로 판정되지 않게
  fd.set("dhash", (h++ % 2 ? "ffffffffffffffff" : "0000000000000000"));
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env);
  return ((await r.json()) as { certId: string }).certId;
}
async function routine(u: U, body = "스쿼트 5x5") {
  return ((await (await send("POST", "/api/certs/routine", u.cookie, { body })).json()) as { certId: string }).certId;
}
async function villaOf(owner: U, ...members: U[]) {
  const v = (await (await send("POST", "/api/villas", owner.cookie, { name: "빌라" })).json()) as { id: string; inviteToken: string };
  for (const m of members) await send("POST", `/api/invite/${v.inviteToken}/join`, m.cookie, {});
  return v;
}
type Ev = { id: string; type: string; payload: Record<string, unknown> };
const events = async (u: U) => (await (await send("GET", "/api/events", u.cookie)).json()) as Ev[];
const ofType = async (u: U, type: string) => (await events(u)).filter((e) => e.type === type);
async function clear(u: U) {
  const ids = (await events(u)).map((e) => e.id);
  if (ids.length) await send("POST", "/api/events/seen", u.cookie, { ids });
}
const cheer = (u: U, certId: string) => send("POST", `/api/certs/${certId}/cheer`, u.cookie);
const comment = (u: U, certId: string, body: unknown) => send("POST", `/api/certs/${certId}/comments`, u.cookie, { body });
const comments = (u: U, certId: string) => send("GET", `/api/certs/${certId}/comments`, u.cookie);
const delComment = (u: U, id: string) => send("DELETE", `/api/comments/${id}`, u.cookie);
type Item = { id: string; cheerCount: number; cheeredByMe: boolean; commentCount: number };
const board = async (viewer: U, owner: U) => (await (await send("GET", `/api/users/${owner.id}/board`, viewer.cookie)).json()) as Item[];
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;
const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())!.n;

/** 방장(owner) · 기록 주인(author) · 이웃(friend)이 같은 빌라, stranger 는 다른 빌라 */
async function setup() {
  const owner = await signup("방장");
  const author = await signup("작가");
  const friend = await signup("이웃");
  const stranger = await signup("남남");
  await villaOf(owner, author, friend);
  await villaOf(stranger);
  const certId = await photo(author);
  await clear(author);
  return { owner, author, friend, stranger, certId };
}

afterEach(() => setNow(null));

describe("POST /api/certs/:id/cheer", () => {
  it("requires_login", async () => {
    expect((await send("POST", "/api/certs/x/cheer")).status).toBe(401);
  });

  it("toggles_and_counts", async () => {
    const { owner, friend, certId } = await setup();
    expect(await (await cheer(friend, certId)).json()).toEqual({ cheered: true, count: 1 });
    expect(await (await cheer(owner, certId)).json()).toEqual({ cheered: true, count: 2 });
    expect(await (await cheer(friend, certId)).json()).toEqual({ cheered: false, count: 1 });
    expect(await (await cheer(friend, certId)).json()).toEqual({ cheered: true, count: 2 });
  });

  it("concurrent_double_tap_stays_consistent", async () => {
    const { friend, certId } = await setup();
    const rs = await Promise.all([cheer(friend, certId), cheer(friend, certId)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    // 두 번 눌렀으니 결국 꺼진 상태, 행이 둘 생기지 않는다
    expect(await count("SELECT COUNT(*) AS n FROM cheers WHERE cert_id = ?", certId)).toBe(0);
  });

  it("own_cert_400", async () => {
    const { author, certId } = await setup();
    const r = await cheer(author, certId);
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe("내 기록에는 응원할 수 없어요");
  });

  it("other_villa_403", async () => {
    const { stranger, certId } = await setup();
    expect((await cheer(stranger, certId)).status).toBe(403);
  });

  it("missing_hidden_deleted_404", async () => {
    const { owner, author, friend, certId } = await setup();
    expect((await cheer(friend, "nope")).status).toBe(404);
    await env.DB.prepare("UPDATE certs SET hidden = 1 WHERE id = ?").bind(certId).run();
    expect((await cheer(friend, certId)).status).toBe(404);
    const other = await routine(author);
    await send("DELETE", `/api/certs/${other}`, owner.cookie);
    expect((await cheer(friend, other)).status).toBe(404);
  });

  it("cheered_event_once_per_cert_and_cheerer_even_after_toggle", async () => {
    const { owner, author, friend, certId } = await setup();
    await cheer(friend, certId);
    await cheer(friend, certId);
    await cheer(friend, certId);
    await cheer(owner, certId);
    const evs = await ofType(author, "cheered");
    expect(evs.map((e) => e.payload.nickname).sort()).toEqual(["방장", "이웃"]);
    expect(evs[0].payload.certId).toBe(certId);
    // 이미 본 뒤에 다시 눌러도 또 생기지 않는다
    await clear(author);
    await cheer(friend, certId);
    await cheer(friend, certId);
    expect(await ofType(author, "cheered")).toEqual([]);
    expect(await ofType(friend, "cheered")).toEqual([]);
  });
});

describe("comments", () => {
  it("post_and_list_oldest_first", async () => {
    const { owner, author, friend, certId } = await setup();
    let t = Date.parse("2026-11-18T10:00:00+09:00");
    setNow(() => (t += 1000));
    const r = await comment(friend, certId, "  멋져요!  ");
    expect(r.status).toBe(200);
    const c1 = (await r.json()) as Record<string, unknown>;
    expect(c1).toMatchObject({ userId: friend.id, nickname: "이웃", body: "멋져요!", canDelete: true });
    expect(typeof c1.id).toBe("string");
    expect(typeof c1.avatar).toBe("object");
    await comment(author, certId, "고마워요");
    const list = (await (await comments(owner, certId)).json()) as { body: string; canDelete: boolean; nickname: string }[];
    expect(list.map((x) => x.body)).toEqual(["멋져요!", "고마워요"]);
    // 방장은 모두 지울 수 있다
    expect(list.map((x) => x.canDelete)).toEqual([true, true]);
    const asFriend = (await (await comments(friend, certId)).json()) as { canDelete: boolean }[];
    expect(asFriend.map((x) => x.canDelete)).toEqual([true, false]);
    const asAuthor = (await (await comments(author, certId)).json()) as { canDelete: boolean }[];
    expect(asAuthor.map((x) => x.canDelete)).toEqual([true, true]);
  });

  it("length_rules", async () => {
    const { friend, certId } = await setup();
    for (const body of ["", "   ", "가".repeat(101), 3, null]) {
      const r = await comment(friend, certId, body);
      expect(r.status).toBe(400);
      expect(await errorOf(r)).toBe("댓글은 1~100자로 써 주세요");
    }
    expect((await comment(friend, certId, "가".repeat(100))).status).toBe(200);
  });

  it("access_rules", async () => {
    const { friend, stranger, certId } = await setup();
    expect((await comment(stranger, certId, "안녕")).status).toBe(403);
    expect((await comments(stranger, certId)).status).toBe(403);
    expect((await comment(friend, "nope", "안녕")).status).toBe(404);
    await env.DB.prepare("UPDATE certs SET hidden = 1 WHERE id = ?").bind(certId).run();
    expect((await comment(friend, certId, "안녕")).status).toBe(404);
    expect((await comments(friend, certId)).status).toBe(404);
  });

  it("daily_limit_20_kst", async () => {
    const { friend, certId } = await setup();
    let t = Date.parse("2026-11-18T23:00:00+09:00");
    setNow(() => (t += 1000));
    for (let i = 0; i < 20; i++) expect((await comment(friend, certId, `댓글${i}`)).status).toBe(200);
    const r = await comment(friend, certId, "21번째");
    expect(r.status).toBe(429);
    expect(await errorOf(r)).toBe("오늘은 댓글을 너무 많이 썼어요");
    // 한국 시간 자정이 지나면 다시 쓸 수 있다
    t = Date.parse("2026-11-19T00:00:01+09:00");
    expect((await comment(friend, certId, "새 날")).status).toBe(200);
  });

  it("commented_event_to_owner_not_self", async () => {
    const { author, friend, certId } = await setup();
    await comment(friend, certId, "오늘도 멋진 오운완이에요 최고");
    await comment(author, certId, "고마워요");
    const evs = await ofType(author, "commented");
    expect(evs.length).toBe(1);
    expect(evs[0].payload).toMatchObject({ nickname: "이웃", body: "오늘도 멋진 오운완이에요 최고", certId });
    expect(await ofType(friend, "commented")).toEqual([]);
  });

  it("delete_permissions", async () => {
    const { owner, author, friend, stranger, certId } = await setup();
    const mk = async () => ((await (await comment(friend, certId, "와")).json()) as { id: string }).id;
    const a = await mk();
    const b = await mk();
    const c = await mk();
    const d = await mk();
    const other = await signup("또다른");
    const v = (await (await send("GET", "/api/villas/mine", owner.cookie)).json()) as { id: string };
    const inv = (await env.DB.prepare("SELECT invite_token FROM villas WHERE id = ?").bind(v.id).first<{ invite_token: string }>())!;
    await send("POST", `/api/invite/${inv.invite_token}/join`, other.cookie, {});
    expect((await delComment(other, a)).status).toBe(403);
    expect((await delComment(stranger, a)).status).toBe(403);
    expect((await delComment(friend, a)).status).toBe(200);
    expect((await delComment(author, b)).status).toBe(200);
    expect((await delComment(owner, c)).status).toBe(200);
    expect((await delComment(owner, "nope")).status).toBe(404);
    expect((await delComment(friend, a)).status).toBe(404);
    const left = (await (await comments(friend, certId)).json()) as { id: string }[];
    expect(left.map((x) => x.id)).toEqual([d]);
  });

  it("deleting_comment_drops_its_unseen_event", async () => {
    const { author, friend, certId } = await setup();
    const id = ((await (await comment(friend, certId, "지울 댓글")).json()) as { id: string }).id;
    await delComment(friend, id);
    expect(await ofType(author, "commented")).toEqual([]);
  });
});

describe("board counts", () => {
  it("counts_and_cheered_by_me", async () => {
    const { owner, author, friend, certId } = await setup();
    const r = await routine(author);
    await cheer(friend, certId);
    await cheer(owner, certId);
    await comment(friend, certId, "하나");
    await comment(owner, certId, "둘");
    await comment(friend, r, "루틴 좋아요");
    const asFriend = await board(friend, author);
    const p = asFriend.find((x) => x.id === certId)!;
    expect(p).toMatchObject({ cheerCount: 2, cheeredByMe: true, commentCount: 2 });
    expect(asFriend.find((x) => x.id === r)).toMatchObject({ cheerCount: 0, cheeredByMe: false, commentCount: 1 });
    expect((await board(author, author)).find((x) => x.id === certId)).toMatchObject({ cheerCount: 2, cheeredByMe: false });
    await env.DB.prepare("UPDATE certs SET hidden = 1 WHERE id = ?").bind(certId).run();
    expect((await board(friend, author)).find((x) => x.id === certId)).toMatchObject({ cheerCount: 0, cheeredByMe: false, commentCount: 0 });
  });
});

describe("cleanup", () => {
  it("cert_delete_removes_cheers_and_comments", async () => {
    const { author, friend, certId } = await setup();
    await cheer(friend, certId);
    await comment(friend, certId, "와");
    expect((await send("DELETE", `/api/certs/${certId}`, author.cookie)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM cheers WHERE cert_id = ?", certId)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM comments WHERE cert_id = ?", certId)).toBe(0);
    expect(await ofType(author, "commented")).toEqual([]);
  });

  it("account_deletion_removes_my_cheers_and_comments_everywhere_and_those_on_my_certs", async () => {
    const { owner, author, friend, certId } = await setup();
    const ownerCert = await routine(owner);
    await cheer(friend, certId);
    await comment(friend, certId, "와");
    await cheer(friend, ownerCert);
    await comment(friend, ownerCert, "멋져요");
    await cheer(author, ownerCert);
    await comment(author, ownerCert, "나도");
    await comment(author, certId, "고마워요");
    expect((await send("DELETE", "/api/me", friend.cookie)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM cheers WHERE user_id = ?", friend.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM comments WHERE user_id = ?", friend.id)).toBe(0);
    expect((await board(owner, owner)).find((x) => x.id === ownerCert)).toMatchObject({ cheerCount: 1, commentCount: 1 });
    expect((await send("DELETE", "/api/me", author.cookie)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM cheers WHERE cert_id = ? OR user_id = ?", certId, author.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM comments WHERE cert_id = ? OR user_id = ?", certId, author.id)).toBe(0);
  });
});
