import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";

// 식단 신고 · 가리기 · 방장 댓글 정리: 인증 사진(report.test.ts · cheer.test.ts)과 같은 규칙인지 본다

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
  const username = `mr${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await send("POST", "/api/signup", undefined, { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie };
}
type U = Awaited<ReturnType<typeof signup>>;
async function villaOf(owner: U, ...members: U[]) {
  const v = (await (await send("POST", "/api/villas", owner.cookie, { name: "식당아파트" })).json()) as { id: string; inviteToken: string };
  for (const m of members) await send("POST", `/api/invite/${v.inviteToken}/join`, m.cookie, {});
  return v;
}
let h = 0;
async function meal(u: U) {
  const fd = new FormData();
  const bytes = new Uint8Array(400).fill(5);
  bytes.set([0xff, 0xd8, 0xff]);
  fd.set("file", new File([bytes], "m.jpg", { type: "image/jpeg" }));
  fd.set("dhash", h++ % 2 ? "ffffffffffffffff" : "0000000000000000");
  fd.set("mealType", "lunch");
  fd.set("memo", "샐러드");
  const r = await app.request("/api/meals", { method: "POST", headers: { cookie: u.cookie }, body: fd }, env);
  expect(r.status).toBe(200);
  return ((await r.json()) as { mealId: string }).mealId;
}
const report = (u: U, id: string) => send("POST", `/api/meals/${id}/report`, u.cookie);
const hidden = async (id: string) => (await env.DB.prepare("SELECT hidden FROM meals WHERE id = ?").bind(id).first<{ hidden: number }>())!.hidden;
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

/** 방장 + 식단 올린 사람 + 일반 입주민 3명이 있는 아파트 */
async function setup() {
  const owner = await signup("방장");
  const author = await signup("작가");
  const others = [await signup("이웃"), await signup("이웃"), await signup("이웃")];
  const v = await villaOf(owner, author, ...others);
  return { owner, author, others, villaId: v.id, mealId: await meal(author) };
}

describe("POST /api/meals/:id/report", () => {
  it("requires_login", async () => {
    expect((await send("POST", "/api/meals/x/report")).status).toBe(401);
  });

  it("three_reports_hide_meal", async () => {
    const { owner, others, mealId } = await setup();
    expect(await (await report(others[0], mealId)).json()).toEqual({ hidden: false });
    expect(await (await report(others[1], mealId)).json()).toEqual({ hidden: false });
    expect(await hidden(mealId)).toBe(0);
    expect(await (await report(owner, mealId)).json()).toEqual({ hidden: true });
    expect(await hidden(mealId)).toBe(1);
  });

  it("concurrent_three_reports_hide", async () => {
    const { others, mealId } = await setup();
    const rs = await Promise.all(others.map((o) => report(o, mealId)));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await hidden(mealId)).toBe(1);
  });

  it("same_person_twice_counts_once", async () => {
    const { others, mealId } = await setup();
    await report(others[0], mealId);
    expect((await report(others[0], mealId)).status).toBe(200);
    await report(others[0], mealId);
    expect(await env.DB.prepare("SELECT COUNT(*) AS c FROM meal_reports WHERE meal_id = ?").bind(mealId).first()).toEqual({ c: 1 });
    expect(await hidden(mealId)).toBe(0);
  });

  it("other_villa_own_and_missing_rejected_with_cert_wording", async () => {
    const { author, mealId } = await setup();
    const stranger = await signup();
    await villaOf(stranger);
    const r = await report(stranger, mealId);
    expect(r.status).toBe(403);
    expect(await errorOf(r)).toBe("같은 아파트 입주민만 신고할 수 있어요");
    const loner = await signup();
    expect((await report(loner, mealId)).status).toBe(403);
    const own = await report(author, mealId);
    expect(own.status).toBe(400);
    expect(await errorOf(own)).toBe("내 사진은 신고할 수 없어요");
    const none = await report(author, "nope");
    expect(none.status).toBe(404);
    expect(await errorOf(none)).toBe("사진을 찾을 수 없어요");
    // 지운 식단도 찾을 수 없다
    expect((await send("DELETE", `/api/meals/${mealId}`, author.cookie)).status).toBe(200);
    expect((await report(stranger, mealId)).status).toBe(404);
  });
});

describe("hidden meal", () => {
  async function hiddenSetup() {
    const s = await setup();
    await send("POST", `/api/meals/${s.mealId}/cheer`, s.others[0].cookie);
    await send("POST", `/api/meals/${s.mealId}/comments`, s.others[0].cookie, { body: "맛있겠다" });
    for (const o of s.others) await report(o, s.mealId);
    return s;
  }

  it("list_hides_photo_memo_and_counts_for_everyone_including_author", async () => {
    const { author, others, villaId, mealId } = await hiddenSetup();
    for (const viewer of [author, others[0]]) {
      const { meals } = (await (await send("GET", `/api/meals?villa=${villaId}`, viewer.cookie)).json()) as { meals: Record<string, unknown>[] };
      const m = meals.find((x) => x.id === mealId)!;
      expect(m).toMatchObject({ hidden: true, memo: null, cheerCount: 0, cheeredByMe: false, commentCount: 0, edited: false });
      expect(m.photoUrl).toBeUndefined();
    }
    const one = (await (await send("GET", `/api/meals/${mealId}`, author.cookie)).json()) as Record<string, unknown>;
    expect(one).toMatchObject({ hidden: true, memo: null });
    expect(one.photoUrl).toBeUndefined();
  });

  it("photo_cheer_and_comments_are_closed", async () => {
    const { author, others, mealId } = await hiddenSetup();
    expect((await send("GET", `/api/meals/${mealId}/photo`, others[1].cookie)).status).toBe(404);
    expect((await send("GET", `/api/meals/${mealId}/photo`, author.cookie)).status).toBe(404);
    expect((await send("POST", `/api/meals/${mealId}/cheer`, others[1].cookie)).status).toBe(404);
    expect((await send("GET", `/api/meals/${mealId}/comments`, others[1].cookie)).status).toBe(404);
    expect((await send("POST", `/api/meals/${mealId}/comments`, others[1].cookie, { body: "또" })).status).toBe(404);
    // 다른 아파트 사람에게는 여전히 403 (가려졌는지도 알려 주지 않는다)
    const stranger = await signup();
    await villaOf(stranger);
    expect((await send("GET", `/api/meals/${mealId}/photo`, stranger.cookie)).status).toBe(403);
  });

  it("author_can_still_delete_and_reports_are_cleared", async () => {
    const { author, mealId } = await hiddenSetup();
    expect((await send("DELETE", `/api/meals/${mealId}`, author.cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM meal_reports WHERE meal_id = ?").bind(mealId).first()).toBeNull();
  });
});

describe("villa owner moderates meal comments", () => {
  it("owner_sees_can_delete_and_deletes_any_comment", async () => {
    const { owner, author, others, mealId } = await setup();
    const c = (await (await send("POST", `/api/meals/${mealId}/comments`, others[0].cookie, { body: "안녕" })).json()) as { id: string };
    const asOwner = (await (await send("GET", `/api/meals/${mealId}/comments`, owner.cookie)).json()) as { canDelete: boolean }[];
    expect(asOwner[0].canDelete).toBe(true);
    const asOther = (await (await send("GET", `/api/meals/${mealId}/comments`, others[1].cookie)).json()) as { canDelete: boolean }[];
    expect(asOther[0].canDelete).toBe(false);
    expect((await send("DELETE", `/api/meal-comments/${c.id}`, others[1].cookie)).status).toBe(403);
    expect((await send("DELETE", `/api/meal-comments/${c.id}`, owner.cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM meal_comments WHERE id = ?").bind(c.id).first()).toBeNull();
    // 작가 본인도 자기 식단 댓글을 지울 수 있다 (그대로)
    const c2 = (await (await send("POST", `/api/meals/${mealId}/comments`, others[0].cookie, { body: "다시" })).json()) as { id: string };
    expect((await send("DELETE", `/api/meal-comments/${c2.id}`, author.cookie)).status).toBe(200);
  });

  it("owner_of_other_villa_or_after_author_left_cannot", async () => {
    const { owner, author, others, villaId, mealId } = await setup();
    const stranger = await signup();
    await villaOf(stranger);
    const c = (await (await send("POST", `/api/meals/${mealId}/comments`, others[0].cookie, { body: "안녕" })).json()) as { id: string };
    expect((await send("DELETE", `/api/meal-comments/${c.id}`, stranger.cookie)).status).toBe(403);
    // 작가가 그 아파트를 나가면 방장 권한도 없다 (인증 기록과 같다)
    await send("POST", `/api/villas/${villaId}/leave`, author.cookie, {});
    expect((await send("DELETE", `/api/meal-comments/${c.id}`, owner.cookie)).status).toBe(403);
  });

  it("owner_cannot_delete_the_meal_itself", async () => {
    const { owner, mealId } = await setup();
    expect((await send("DELETE", `/api/meals/${mealId}`, owner.cookie)).status).toBe(403);
  });
});

describe("withdrawal", () => {
  it("removes_my_reports_and_reports_on_my_meals", async () => {
    const { author, others, mealId } = await setup();
    const theirs = await meal(others[1]);
    await report(others[0], mealId);
    await report(author, theirs);
    expect((await send("DELETE", "/api/me", author.cookie)).status).toBe(200);
    const c = async (sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).first<{ c: number }>())!.c;
    expect(await c("SELECT COUNT(*) AS c FROM meal_reports WHERE meal_id = ?", mealId)).toBe(0);
    expect(await c("SELECT COUNT(*) AS c FROM meal_reports WHERE reporter_id = ?", author.id)).toBe(0);
  });
});
