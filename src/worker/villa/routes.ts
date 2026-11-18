import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { kstDay } from "../../shared/rules/day";
import { MAX_MEMBERS, NotInVillaError, leaveVilla, newInviteToken, recomputePenthouse } from "./service";

export const villa = new Hono<AppEnv>();

const BAD_NAME = "빌라 이름은 1~20자로 지어 주세요";
const IN_VILLA = "지금 빌라를 먼저 나가야 해요";
const EXPIRED = "초대 링크가 만료됐어요";

function cleanName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= 1 && s.length <= 20 ? s : null;
}
const isUnique = (e: unknown) => String((e as Error)?.message ?? e).includes("UNIQUE");

villa.post("/api/villas", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  const name = cleanName(b?.name);
  if (!name) return jsonError(c, 400, BAD_NAME);
  const id = crypto.randomUUID();
  const inviteToken = newInviteToken();
  const t = now();
  try {
    await c.env.DB.batch([
      // 이미 빌라에 살면 one_active_villa 위반으로 전체가 취소된다
      c.env.DB.prepare(
        "INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES (?, ?, ?, 1, ?, ?)",
      ).bind(crypto.randomUUID(), userId, id, t, t),
      c.env.DB.prepare(
        "INSERT INTO villas (id, name, owner_id, invite_token, penthouse_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, name, userId, inviteToken, userId, t),
    ]);
  } catch (e) {
    if (isUnique(e)) return jsonError(c, 409, IN_VILLA);
    throw e;
  }
  return c.json({ id, inviteToken }, 201);
});

villa.get("/api/villas/mine", requireUser, async (c) => {
  const userId = c.get("userId");
  const v = await c.env.DB.prepare(
    `SELECT v.id, v.name, v.owner_id AS ownerId, v.penthouse_user_id AS penthouseUserId, v.invite_token AS inviteToken
     FROM memberships m JOIN villas v ON v.id = m.villa_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND v.dissolved_at IS NULL`,
  )
    .bind(userId)
    .first<{ id: string; name: string; ownerId: string; penthouseUserId: string | null; inviteToken: string }>();
  if (!v) return c.json(null);
  const { results } = await c.env.DB.prepare(
    `SELECT u.id AS userId, u.nickname, u.sport, u.avatar, m.floor, u.streak,
       EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.kind = 'photo' AND c.duplicate = 0 AND c.day = ?) AS certifiedToday
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.villa_id = ? AND m.left_at IS NULL ORDER BY m.joined_at ASC, m.rowid ASC`,
  )
    .bind(kstDay(now()), v.id)
    .all<{ userId: string; nickname: string; sport: string | null; avatar: string; floor: number; streak: number; certifiedToday: number }>();
  const pl = await c.env.DB.prepare(
    `SELECT p.user_id AS userId, p.slot, p.item_id AS itemId FROM placements p
     JOIN memberships m ON m.user_id = p.user_id AND m.left_at IS NULL WHERE m.villa_id = ?`,
  )
    .bind(v.id)
    .all<{ userId: string; slot: string; itemId: string }>();
  const members = results.map((r) => ({
    ...r,
    avatar: JSON.parse(r.avatar),
    certifiedToday: !!r.certifiedToday,
    placements: pl.results.filter((p) => p.userId === r.userId).map((p) => ({ slot: p.slot, itemId: p.itemId })),
  }));
  // 초대 링크는 방장만 받는다
  const { inviteToken, ...rest } = v;
  return c.json({ ...rest, ...(v.ownerId === userId ? { inviteToken } : {}), members });
});

villa.post("/api/villas/leave", requireUser, async (c) => {
  try {
    await leaveVilla(c.env, c.get("userId"));
  } catch (e) {
    if (e instanceof NotInVillaError) return jsonError(c, 409, "살고 있는 빌라가 없어요");
    throw e;
  }
  return c.json({ ok: true });
});

async function ownedVilla(c: { env: AppEnv["Bindings"] }, id: string) {
  return c.env.DB.prepare("SELECT owner_id FROM villas WHERE id = ? AND dissolved_at IS NULL")
    .bind(id)
    .first<{ owner_id: string }>();
}

villa.patch("/api/villas/:id", requireUser, async (c) => {
  const v = await ownedVilla(c, c.req.param("id"));
  if (!v) return jsonError(c, 404, "빌라를 찾을 수 없어요");
  if (v.owner_id !== c.get("userId")) return jsonError(c, 403, "방장만 할 수 있어요");
  const b = await c.req.json().catch(() => null);
  const name = cleanName(b?.name);
  if (!name) return jsonError(c, 400, BAD_NAME);
  await c.env.DB.prepare("UPDATE villas SET name = ? WHERE id = ?").bind(name, c.req.param("id")).run();
  return c.json({ ok: true });
});

villa.post("/api/villas/:id/invite/rotate", requireUser, async (c) => {
  const v = await ownedVilla(c, c.req.param("id"));
  if (!v) return jsonError(c, 404, "빌라를 찾을 수 없어요");
  if (v.owner_id !== c.get("userId")) return jsonError(c, 403, "방장만 할 수 있어요");
  const inviteToken = newInviteToken();
  await c.env.DB.prepare("UPDATE villas SET invite_token = ? WHERE id = ?").bind(inviteToken, c.req.param("id")).run();
  return c.json({ inviteToken });
});

villa.get("/api/invite/:token", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT v.name AS villaName,
       (SELECT COUNT(*) FROM memberships m WHERE m.villa_id = v.id AND m.left_at IS NULL) AS memberCount
     FROM villas v WHERE v.invite_token = ? AND v.dissolved_at IS NULL`,
  )
    .bind(c.req.param("token"))
    .first();
  if (!row) return jsonError(c, 404, EXPIRED);
  return c.json(row);
});

villa.post("/api/invite/:token/join", requireUser, async (c) => {
  const userId = c.get("userId");
  const v = await c.env.DB.prepare("SELECT id FROM villas WHERE invite_token = ? AND dissolved_at IS NULL")
    .bind(c.req.param("token"))
    .first<{ id: string }>();
  if (!v) return jsonError(c, 404, EXPIRED);
  const t = now();
  let changes = 0;
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at)
       SELECT ?, ?, ?, 1, ?, ? WHERE (SELECT COUNT(*) FROM memberships WHERE villa_id = ? AND left_at IS NULL) < ?
         AND EXISTS (SELECT 1 FROM villas WHERE id = ? AND dissolved_at IS NULL)`,
    )
      .bind(crypto.randomUUID(), userId, v.id, t, t, v.id, MAX_MEMBERS, v.id)
      .run();
    changes = res.meta.changes;
  } catch (e) {
    if (isUnique(e)) return jsonError(c, 409, IN_VILLA);
    throw e;
  }
  if (changes === 0) {
    const alive = await c.env.DB.prepare("SELECT 1 AS x FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(v.id).first();
    return alive ? jsonError(c, 409, "빌라가 꽉 찼어요") : jsonError(c, 404, EXPIRED);
  }
  await recomputePenthouse(c.env, v.id);
  return c.json({ ok: true });
});
