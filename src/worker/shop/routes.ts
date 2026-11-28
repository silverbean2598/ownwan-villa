import { Hono } from "hono";
import type { AppEnv } from "../env";
import { jsonError, requireUser } from "../http";
import { KIND_NOUN, findItem, findShopItem, isSlot, slotType, type ShopItem } from "../../shared/catalog";
import { logEvents } from "../events/log";
import { findTheme } from "../../shared/premium";

export const shop = new Hono<AppEnv>();

// 지금 사는(해체되지 않은) 아파트의 펜트하우스 주인인지. ?1 = 사용자 id
const IS_PENTHOUSE = `EXISTS (SELECT 1 FROM memberships m JOIN villas v ON v.id = m.villa_id
  WHERE m.user_id = ?1 AND m.left_at IS NULL AND v.dissolved_at IS NULL AND v.penthouse_user_id = ?1)`;

const isPenthouseOnly = (item: ShopItem) => item.kind === "furniture" && !!item.penthouseOnly;
const noun = (item: ShopItem) => KIND_NOUN[item.kind];

/** 상점 · 배치 화면용: 내 포인트, 가진 가구 · 옷 · 소품, 놓은 가구, 지금 펜트하우스 주인인지 */
shop.get("/api/shop", requireUser, async (c) => {
  const userId = c.get("userId");
  const [u, inv, pl, prem] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT points, sport, theme, ${IS_PENTHOUSE} AS penthouse FROM users WHERE id = ?1`).bind(userId),
    c.env.DB.prepare("SELECT item_id AS itemId FROM inventory WHERE user_id = ? ORDER BY rowid").bind(userId),
    c.env.DB.prepare("SELECT slot, item_id AS itemId FROM placements WHERE user_id = ? ORDER BY slot").bind(userId),
    c.env.DB.prepare("SELECT item_id AS itemId FROM premium_owned WHERE user_id = ? ORDER BY bought_at").bind(userId),
  ]);
  const me = u.results[0] as { points: number; sport: string | null; theme: string | null; penthouse: number } | undefined;
  if (!me) return jsonError(c, 401, "로그인이 필요해요");
  const premiumIds = (prem.results as { itemId: string }[]).map((r) => r.itemId);
  return c.json({
    points: me.points,
    sport: me.sport,
    penthouse: !!me.penthouse,
    owned: (inv.results as { itemId: string }[]).map((r) => r.itemId),
    placements: pl.results as { slot: string; itemId: string }[],
    // 프리미엄: 가진 테마와 지금 켜 둔 테마 (가진 것만 켜져 있다고 본다)
    premiumOwned: premiumIds,
    theme: me.theme && premiumIds.includes(me.theme) ? me.theme : null,
  });
});

/**
 * 방 테마 켜기 · 끄기. themeId: 켤 테마 id, null 이면 끈다. 가진 테마만 켤 수 있다.
 * (프리미엄 구매는 결제를 연결한 뒤에 따로 연다. 지금은 상점이 "결제 준비 중" 안내만 한다)
 */
shop.put("/api/theme", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (b?.themeId === null) {
    await c.env.DB.prepare("UPDATE users SET theme = NULL WHERE id = ?").bind(userId).run();
    return c.json({ theme: null });
  }
  const theme = findTheme(b?.themeId);
  if (!theme) return jsonError(c, 400, "없는 테마예요");
  const r = await c.env.DB.prepare(
    "UPDATE users SET theme = ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM premium_owned WHERE user_id = ?1 AND item_id = ?2)",
  )
    .bind(userId, theme.id)
    .run();
  if (r.meta.changes !== 1) return jsonError(c, 403, "아직 갖고 있지 않은 테마예요");
  return c.json({ theme: theme.id });
});

shop.post("/api/shop/buy", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const item = findShopItem(b?.itemId);
  if (!item) return jsonError(c, 400, "없는 물건이에요");
  const ph = isPenthouseOnly(item);
  // 한 트랜잭션: 포인트가 충분하고 아직 없고 (펜트하우스 전용이면 지금 펜트하우스 주인일 때만) 차감하고, 차감했을 때만 넣는다
  const [charge] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET points = points - ?4 WHERE id = ?1 AND points >= ?4
         AND NOT EXISTS (SELECT 1 FROM inventory WHERE user_id = ?1 AND item_id = ?3)
         AND (?2 = 0 OR ${IS_PENTHOUSE})`,
    ).bind(userId, ph ? 1 : 0, item.id, item.price),
    c.env.DB.prepare("INSERT INTO inventory (user_id, item_id) SELECT ?1, ?2 WHERE changes() = 1").bind(userId, item.id),
  ]);
  if (charge.meta.changes !== 1) {
    const owned = await c.env.DB.prepare("SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?").bind(userId, item.id).first();
    if (owned) return jsonError(c, 409, `이미 갖고 있는 ${noun(item)}${item.kind === "furniture" ? "예요" : "이에요"}`);
    if (ph && !(await c.env.DB.prepare(`SELECT ${IS_PENTHOUSE} AS yes`).bind(userId).first<{ yes: number }>())?.yes) {
      return jsonError(c, 403, "펜트하우스 주인만 살 수 있어요");
    }
    return jsonError(c, 400, "포인트가 모자라요");
  }
  await logEvents(c.env, [{ userId, type: "bought", payload: { itemId: item.id, itemName: item.name }, key: `bought:${userId}:${item.id}` }]);
  const row = await c.env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(userId).first<{ points: number }>();
  return c.json({ points: row!.points });
});

shop.put("/api/placements", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (!isSlot(b?.slot)) return jsonError(c, 400, "자리가 올바르지 않아요");
  if (b.itemId === null) {
    await c.env.DB.prepare("DELETE FROM placements WHERE user_id = ? AND slot = ?").bind(userId, b.slot).run();
    return c.json({ ok: true });
  }
  const item = findItem(b.itemId);
  if (!item) return jsonError(c, 400, findShopItem(b.itemId) ? "방에 놓을 수 없는 물건이에요" : "없는 물건이에요");
  if (item.slotType !== slotType(b.slot)) {
    return jsonError(c, 400, item.slotType === "wall" ? "벽에 거는 가구예요" : "바닥에 놓는 가구예요");
  }
  const owned = await c.env.DB.prepare("SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?").bind(userId, item.id).first();
  if (!owned) return jsonError(c, 400, "아직 갖고 있지 않은 가구예요");
  // 가구는 하나씩만 있으므로 다른 자리에 놓여 있었다면 옮긴다
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM placements WHERE user_id = ? AND item_id = ?").bind(userId, item.id),
    c.env.DB.prepare("INSERT OR REPLACE INTO placements (user_id, slot, item_id) VALUES (?, ?, ?)").bind(userId, b.slot, item.id),
  ]);
  return c.json({ ok: true });
});
