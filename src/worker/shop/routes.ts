import { Hono } from "hono";
import type { AppEnv } from "../env";
import { jsonError, requireUser } from "../http";
import { findItem, isSlot, slotType } from "../../shared/catalog";

export const shop = new Hono<AppEnv>();

/** 상점 · 배치 화면용: 내 포인트, 가진 가구, 놓은 가구 */
shop.get("/api/shop", requireUser, async (c) => {
  const userId = c.get("userId");
  const [u, inv, pl] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT points, sport FROM users WHERE id = ?").bind(userId),
    c.env.DB.prepare("SELECT item_id AS itemId FROM inventory WHERE user_id = ? ORDER BY rowid").bind(userId),
    c.env.DB.prepare("SELECT slot, item_id AS itemId FROM placements WHERE user_id = ? ORDER BY slot").bind(userId),
  ]);
  const me = u.results[0] as { points: number; sport: string | null } | undefined;
  if (!me) return jsonError(c, 401, "로그인이 필요해요");
  return c.json({
    points: me.points,
    sport: me.sport,
    owned: (inv.results as { itemId: string }[]).map((r) => r.itemId),
    placements: pl.results as { slot: string; itemId: string }[],
  });
});

shop.post("/api/shop/buy", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const item = findItem(b?.itemId);
  if (!item) return jsonError(c, 400, "없는 가구예요");
  // 한 트랜잭션: 포인트가 충분하고 아직 없을 때만 차감하고, 차감했을 때만 넣는다
  const [charge] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET points = points - ?1 WHERE id = ?2 AND points >= ?1
         AND NOT EXISTS (SELECT 1 FROM inventory WHERE user_id = ?2 AND item_id = ?3)`,
    ).bind(item.price, userId, item.id),
    c.env.DB.prepare("INSERT INTO inventory (user_id, item_id) SELECT ?1, ?2 WHERE changes() = 1").bind(userId, item.id),
  ]);
  if (charge.meta.changes !== 1) {
    const owned = await c.env.DB.prepare("SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?").bind(userId, item.id).first();
    return owned ? jsonError(c, 409, "이미 갖고 있는 가구예요") : jsonError(c, 400, "포인트가 모자라요");
  }
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
  if (!item) return jsonError(c, 400, "없는 가구예요");
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
