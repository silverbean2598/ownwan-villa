import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";

let n = 0;
async function signup() {
  const username = `prem${Date.now().toString(36)}${n++}`.slice(0, 16);
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
const setTheme = (cookie: string, themeId: unknown) =>
  app.request("/api/theme", { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ themeId }) }, env);
const shop = async (cookie: string) => (await app.request("/api/shop", { headers: { cookie } }, env)).json<any>();
const grant = (id: string) => env.DB.prepare("INSERT INTO premium_owned (user_id, item_id, bought_at) VALUES (?, 'xmas', ?)").bind(id, Date.now()).run();

describe("premium theme", () => {
  it("shop_lists_no_premium_by_default", async () => {
    const u = await signup();
    const s = await shop(u.cookie);
    expect(s.premiumOwned).toEqual([]);
    expect(s.theme).toBeNull();
  });
  it("cannot_turn_on_a_theme_you_do_not_own", async () => {
    const u = await signup();
    const r = await setTheme(u.cookie, "xmas");
    expect(r.status).toBe(403);
    expect((await shop(u.cookie)).theme).toBeNull();
  });
  it("unknown_theme_is_400", async () => {
    const u = await signup();
    expect((await setTheme(u.cookie, "halloween")).status).toBe(400);
  });
  it("owned_theme_turns_on_and_off_and_stays_owned", async () => {
    const u = await signup();
    await grant(u.id);
    expect((await setTheme(u.cookie, "xmas")).status).toBe(200);
    let s = await shop(u.cookie);
    expect(s.premiumOwned).toEqual(["xmas"]);
    expect(s.theme).toBe("xmas");
    expect((await setTheme(u.cookie, null)).status).toBe(200);
    s = await shop(u.cookie);
    expect(s.theme).toBeNull();
    expect(s.premiumOwned).toEqual(["xmas"]);
  });
  it("villa_members_carry_theme_only_when_owned", async () => {
    const u = await signup();
    const v = await (
      await app.request("/api/villas", { method: "POST", headers: { "content-type": "application/json", cookie: u.cookie }, body: JSON.stringify({ name: "테마 아파트" }) }, env)
    ).json<any>();
    const theme = async () => (await (await app.request(`/api/villas/${v.id}`, { headers: { cookie: u.cookie } }, env)).json<any>()).members[0].theme;
    expect(await theme()).toBeNull();
    await grant(u.id);
    await setTheme(u.cookie, "xmas");
    expect(await theme()).toBe("xmas");
    // 보유 기록이 없어지면(환불 등) 켜 둔 값이 남아 있어도 보이지 않는다
    await env.DB.prepare("DELETE FROM premium_owned WHERE user_id = ?").bind(u.id).run();
    expect(await theme()).toBeNull();
  });
});
