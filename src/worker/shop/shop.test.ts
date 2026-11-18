import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { CATALOG, SHOP_ITEMS, findItem } from "../../shared/catalog";
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

describe("꾸미기 확장: 가구 · 옷 · 소품", () => {
  const makeVilla = (cookie: string) => send(cookie, "/api/villas", { name: "빌라" });
  const villaOf = async (id: string) =>
    (await env.DB.prepare("SELECT villa_id FROM memberships WHERE user_id = ? AND left_at IS NULL").bind(id).first<{ villa_id: string }>())!.villa_id;

  it("new_furniture_can_be_bought_and_placed", async () => {
    const u = await signup(500);
    expect(await (await buy(u.cookie, "aquarium")).json()).toEqual({ points: 320 });
    expect((await place(u.cookie, "floor1", "aquarium")).status).toBe(200);
    await buy(u.cookie, "string-lights");
    expect((await place(u.cookie, "floor2", "string-lights")).status).toBe(400);
    expect((await place(u.cookie, "wall1", "string-lights")).status).toBe(200);
  });
  it("buying_outfit_or_accessory_adds_to_inventory_and_drops_points", async () => {
    const u = await signup(300);
    expect(await (await buy(u.cookie, "hoodie")).json()).toEqual({ points: 300 - findItemPrice("hoodie") });
    expect(await (await buy(u.cookie, "cap")).json()).toEqual({ points: 300 - findItemPrice("hoodie") - findItemPrice("cap") });
    const s = await shop(u.cookie);
    expect(s.owned).toEqual(["hoodie", "cap"]);
    const again = await buy(u.cookie, "cap");
    expect(again.status).toBe(409);
    expect((await again.json<any>()).error).toBe("이미 갖고 있는 소품이에요");
  });
  it("bought_event_carries_outfit_name", async () => {
    const u = await signup(300);
    await buy(u.cookie, "rashguard");
    const row = await env.DB.prepare("SELECT payload FROM events WHERE user_id = ? AND type = 'bought'").bind(u.id).first<{ payload: string }>();
    expect(JSON.parse(row!.payload)).toEqual({ itemId: "rashguard", itemName: "래시가드" });
  });
  it("placements_reject_outfits_and_accessories", async () => {
    const u = await signup(300);
    await buy(u.cookie, "singlet");
    await buy(u.cookie, "towel");
    for (const [slot, id] of [["floor1", "singlet"], ["wall1", "towel"]]) {
      const res = await place(u.cookie, slot, id);
      expect(res.status, id).toBe(400);
      expect((await res.json<any>()).error).toBe("방에 놓을 수 없는 물건이에요");
    }
    expect((await shop(u.cookie)).placements).toEqual([]);
  });
  it("gold_statue_needs_current_penthouse_holder", async () => {
    const u = await signup(1000);
    // 빌라 없음 → 403, 포인트 그대로
    let res = await buy(u.cookie, "gold-statue");
    expect(res.status).toBe(403);
    expect((await res.json<any>()).error).toBe("펜트하우스 주인만 살 수 있어요");
    expect((await shop(u.cookie)).penthouse).toBe(false);
    // 빌라를 만들면 펜트하우스 주인
    await makeVilla(u.cookie);
    expect((await shop(u.cookie)).penthouse).toBe(true);
    res = await buy(u.cookie, "gold-statue");
    expect(await res.json()).toEqual({ points: 700 });
    // 펜트하우스를 잃어도 계속 갖고 어디든 놓을 수 있다
    await env.DB.prepare("UPDATE villas SET penthouse_user_id = NULL WHERE id = ?").bind(await villaOf(u.id)).run();
    expect((await shop(u.cookie)).penthouse).toBe(false);
    expect((await shop(u.cookie)).owned).toEqual(["gold-statue"]);
    expect((await place(u.cookie, "floor3", "gold-statue")).status).toBe(200);
  });
  it("gold_statue_rejected_for_villa_member_who_is_not_penthouse", async () => {
    const owner = await signup(0);
    await makeVilla(owner.cookie);
    const u = await signup(1000);
    const vid = await villaOf(owner.id);
    await env.DB.prepare("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES (?, ?, ?, 1, 0, 0)")
      .bind(crypto.randomUUID(), u.id, vid)
      .run();
    const res = await buy(u.cookie, "gold-statue");
    expect(res.status).toBe(403);
    expect((await shop(u.cookie)).points).toBe(1000);
    // 펜트하우스가 바뀌면 살 수 있다
    await env.DB.prepare("UPDATE villas SET penthouse_user_id = ? WHERE id = ?").bind(u.id, vid).run();
    expect((await buy(u.cookie, "gold-statue")).status).toBe(200);
  });
  it("gold_statue_short_points_is_still_400_for_holder", async () => {
    const u = await signup(299);
    await makeVilla(u.cookie);
    const res = await buy(u.cookie, "gold-statue");
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toBe("포인트가 모자라요");
  });
});

function findItemPrice(id: string) {
  return SHOP_ITEMS.find((i) => i.id === id)!.price;
}
