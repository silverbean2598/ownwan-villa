import type { Env } from "../env";
import { now } from "../clock";
import { pickPenthouse } from "../../shared/rules/penthouse";

export const MAX_MEMBERS = 10;

export function newInviteToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...raw)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function recomputePenthouse(env: Env, villaId: string): Promise<string | null> {
  const { results } = await env.DB.prepare(
    `SELECT m.user_id AS userId, m.floor, u.streak, m.floor_reached_at AS floorReachedAt
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.villa_id = ? AND m.left_at IS NULL`,
  )
    .bind(villaId)
    .all<{ userId: string; floor: number; streak: number; floorReachedAt: number }>();
  const id = pickPenthouse(results);
  await env.DB.prepare("UPDATE villas SET penthouse_user_id = ? WHERE id = ?").bind(id, villaId).run();
  return id;
}

export async function leaveVilla(env: Env, userId: string): Promise<void> {
  const m = await env.DB.prepare(
    "SELECT villa_id AS villaId FROM memberships WHERE user_id = ? AND left_at IS NULL",
  )
    .bind(userId)
    .first<{ villaId: string }>();
  if (!m) throw new NotInVillaError();
  const t = now();
  const active = "SELECT user_id FROM memberships WHERE villa_id = ? AND left_at IS NULL";
  // 한 트랜잭션: 나가기 → 방장 승계(남은 입주민 중 가장 먼저 입주한 사람) → 아무도 없으면 해체
  await env.DB.batch([
    env.DB.prepare("UPDATE memberships SET left_at = ? WHERE user_id = ? AND villa_id = ? AND left_at IS NULL").bind(t, userId, m.villaId),
    env.DB.prepare(
      `UPDATE villas SET owner_id = COALESCE((${active} ORDER BY joined_at ASC, rowid ASC LIMIT 1), owner_id)
       WHERE id = ? AND owner_id = ?`,
    ).bind(m.villaId, m.villaId, userId),
    env.DB.prepare(
      `UPDATE villas SET dissolved_at = ?, penthouse_user_id = NULL
       WHERE id = ? AND dissolved_at IS NULL AND NOT EXISTS (${active})`,
    ).bind(t, m.villaId, m.villaId),
  ]);
  await recomputePenthouse(env, m.villaId);
}

export class NotInVillaError extends Error {}
