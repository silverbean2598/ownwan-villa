import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { DEFAULT_AVATAR } from "../../shared/avatar";

let n = 0;
async function signup() {
  const username = `prof${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await app.request(
    "/api/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "password1", nickname: "운동러", over14: true, agree: true }),
    },
    env,
  );
  return res.headers.get("set-cookie")!.split(";")[0];
}
const patch = (cookie: string, body: unknown) =>
  app.request(
    "/api/me",
    { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) },
    env,
  );
const me = async (cookie: string) => (await app.request("/api/me", { headers: { cookie } }, env)).json<any>();

describe("PATCH /api/me", () => {
  it("requires_login", async () => {
    const res = await app.request("/api/me", { method: "PATCH", body: "{}" }, env);
    expect(res.status).toBe(401);
  });
  it("me_returns_default_avatar_for_new_user", async () => {
    const c = await signup();
    expect((await me(c)).avatar).toEqual(DEFAULT_AVATAR);
  });
  it("rejects_invalid_sport", async () => {
    const c = await signup();
    expect((await patch(c, { sport: "yoga" })).status).toBe(400);
  });
  it("accepts_sport_and_avatar", async () => {
    const c = await signup();
    const res = await patch(c, { sport: "climbing", avatar: { skin: 2, hair: "long", shirt: 5 } });
    expect(res.status).toBe(200);
    const m = await me(c);
    expect(m.sport).toBe("climbing");
    expect(m.avatar).toEqual({ skin: 2, hair: "long", shirt: 5 });
  });
  it("accepts_taekwondo_as_sixth_sport", async () => {
    const c = await signup();
    expect((await patch(c, { sport: "taekwondo" })).status).toBe(200);
    expect((await me(c)).sport).toBe("taekwondo");
    expect((await patch(c, { sport: "yoga" })).status).toBe(400);
  });
  it("rejects_invalid_avatar", async () => {
    const c = await signup();
    expect((await patch(c, { avatar: { skin: 9, hair: "short", shirt: 0 } })).status).toBe(400);
  });
  it("validates_nickname_like_signup", async () => {
    const c = await signup();
    expect((await patch(c, { nickname: "가" })).status).toBe(400);
    expect((await patch(c, { nickname: "가".repeat(11) })).status).toBe(400);
    expect((await patch(c, { nickname: "  새이름  " })).status).toBe(200);
    expect((await me(c)).nickname).toBe("새이름");
  });
});
