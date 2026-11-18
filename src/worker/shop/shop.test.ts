import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { CATALOG, findItem } from "../../shared/catalog";
import { SPORTS } from "../../shared/sports";

let n = 0;
async function signup(points = 0, sport = "gym") {
  const username = `shop${Date.now().toString(36)}${n++}`.slice(0, 16);
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
  await env.DB.prepare("UPDATE users SET points = ?, sport = ? WHERE id = ?").bind(points, sport, me.id).run();
  return { cookie, id: me.id as string };
}
const send = (cookie: string, path: string, body: unknown, method = "POST") =>
  app.request(path, { method, headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }, env);
const buy = (cookie: string, itemId: string) => send(cookie, "/api/shop/buy", { itemId });
const place = (cookie: string, slot: string, itemId: string | null) => send(cookie, "/api/placements", { slot, itemId }, "PUT");
const shop = async (cookie: string) => (await app.request("/api/shop", { headers: { cookie } }, env)).json<any>();

describe("catalog", () => {
  it("temporary_catalog_has_25_items_with_unique_ids", () => {
    expect(CATALOG).toHaveLength(25);
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(25);
    for (const i of CATALOG) {
      expect(i.price).toBeGreaterThanOrEqual(60);
      expect(i.price).toBeLessThanOrEqual(200);
    }
    for (const s of SPORTS) expect(CATALOG.filter((i) => i.sport === s).length).toBe(3);
    expect(CATALOG.filter((i) => i.sport === "common")).toHaveLength(7);
  });
});

describe("POST /api/shop/buy", () => {
  it("requires_login", async () => {
    expect((await app.request("/api/shop/buy", { method: "POST", body: "{}" }, env)).status).toBe(401);
  });
  it("rejects_when_points_are_short", async () => {
    const u = await signup(100);
    const res = await buy(u.cookie, "reformer"); // 200P
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toBe("포인트가 모자라요");
    const s = await shop(u.cookie);
    expect(s.points).toBe(100);
    expect(s.owned).toEqual([]);
  });
  it("deducts_points_and_adds_to_inventory", async () => {
    const u = await signup(300);
    const res = await buy(u.cookie, "bench"); // 120P
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ points: 180 });
    const s = await shop(u.cookie);
    expect(s.points).toBe(180);
    expect(s.owned).toEqual(["bench"]);
  });
  it("buying_twice_is_409_and_charges_once", async () => {
    const u = await signup(300);
    await buy(u.cookie, "plant");
    const res = await buy(u.cookie, "plant");
    expect(res.status).toBe(409);
    expect((await shop(u.cookie)).points).toBe(220);
  });
  it("can_buy_another_sports_item", async () => {
    const u = await signup(300, "gym");
    expect(findItem("sandbag")!.sport).toBe("taekwondo");
    expect((await buy(u.cookie, "sandbag")).status).toBe(200);
  });
  it("unknown_item_is_400", async () => {
    const u = await signup(300);
    expect((await buy(u.cookie, "sofa")).status).toBe(400);
  });
  it("concurrent_buys_never_overspend", async () => {
    const u = await signup(150);
    const rs = await Promise.all([buy(u.cookie, "bench"), buy(u.cookie, "sandbag")]); // 120P + 150P
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
    const s = await shop(u.cookie);
    expect(s.owned).toHaveLength(1);
    expect(s.points).toBe(150 - findItem(s.owned[0])!.price);
  });
  it("exact_points_are_enough", async () => {
    const u = await signup(60);
    expect(await (await buy(u.cookie, "foam-roller")).json()).toEqual({ points: 0 });
  });
});

describe("PUT /api/placements", () => {
  it("wall_item_on_floor_slot_is_400", async () => {
    const u = await signup(300);
    await buy(u.cookie, "wall-clock");
    expect((await place(u.cookie, "floor1", "wall-clock")).status).toBe(400);
    expect((await place(u.cookie, "wall2", "wall-clock")).status).toBe(200);
  });
  it("floor_item_on_wall_slot_is_400", async () => {
    const u = await signup(300);
    await buy(u.cookie, "plant");
    expect((await place(u.cookie, "wall1", "plant")).status).toBe(400);
  });
  it("unowned_item_is_400", async () => {
    const u = await signup(300);
    const res = await place(u.cookie, "floor1", "plant");
    expect(res.status).toBe(400);
    expect((await shop(u.cookie)).placements).toEqual([]);
  });
  it("invalid_slot_is_400", async () => {
    const u = await signup(300);
    await buy(u.cookie, "plant");
    expect((await place(u.cookie, "floor9", "plant")).status).toBe(400);
  });
  it("places_replaces_moves_and_removes", async () => {
    const u = await signup(500);
    await buy(u.cookie, "plant");
    await buy(u.cookie, "rug");
    await place(u.cookie, "floor1", "plant");
    expect((await shop(u.cookie)).placements).toEqual([{ slot: "floor1", itemId: "plant" }]);
    // 같은 자리에 다른 가구 → 바뀜
    await place(u.cookie, "floor1", "rug");
    // 이미 놓인 가구를 다른 자리로 → 옮겨짐(한 개만 있으므로)
    await place(u.cookie, "floor2", "rug");
    expect((await shop(u.cookie)).placements).toEqual([{ slot: "floor2", itemId: "rug" }]);
    const res = await place(u.cookie, "floor2", null);
    expect(res.status).toBe(200);
    expect((await shop(u.cookie)).placements).toEqual([]);
  });
  it("placements_show_up_in_villa", async () => {
    const u = await signup(500);
    await send(u.cookie, "/api/villas", { name: "빌라" });
    await buy(u.cookie, "trophy-shelf");
    await place(u.cookie, "wall1", "trophy-shelf");
    const v = await (await app.request("/api/villas/mine", { headers: { cookie: u.cookie } }, env)).json<any>();
    expect(v.members[0].placements).toEqual([{ slot: "wall1", itemId: "trophy-shelf" }]);
  });
});
