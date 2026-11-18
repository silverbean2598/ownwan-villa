import type { Env } from "../env";
import { VILLA_CAPACITY } from "../../shared/villa";
import { now } from "../clock";
import { CERTIFIED_PHOTO } from "../cert/certified";
import { kstDay } from "../../shared/rules/day";
import { displayFloor, displayStreak } from "../../shared/rules/streak";
import { pickPenthouse } from "../../shared/rules/penthouse";

export const MAX_MEMBERS = VILLA_CAPACITY;

export function newInviteToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...raw)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function recomputePenthouse(env: Env, villaId: string): Promise<string | null> {
  const { results } = await env.DB.prepare(
    `SELECT m.user_id AS userId, m.floor, u.streak, m.floor_reached_at AS floorReachedAt,
       EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.day = ? AND ${CERTIFIED_PHOTO}) AS certifiedToday,
       (SELECT MIN(c.created_at) FROM certs c WHERE c.user_id = u.id AND c.day = ? AND ${CERTIFIED_PHOTO}) AS firstCertAt
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.villa_id = ? AND m.left_at IS NULL`,
  )
    .bind(kstDay(now()), kstDay(now()), villaId)
    .all<{ userId: string; floor: number; streak: number; floorReachedAt: number; certifiedToday: number; firstCertAt: number | null }>();
  // 오늘 인증까지 친 연속 기록과 층(7일째면 바로 +1)으로 비교한다. 저장된 층은 자정 정산 때만 바뀐다
  const id = pickPenthouse(
    results.map((r) => {
      const cert = !!r.certifiedToday;
      const floor = displayFloor(r.floor, r.streak, cert);
      // 오늘 올라간 층은 첫 사진 인증 시각에 도달한 것으로 본다
      const floorReachedAt = floor > r.floor && r.firstCertAt !== null ? r.firstCertAt : r.floorReachedAt;
      return { userId: r.userId, floor, streak: displayStreak(r.streak, cert), floorReachedAt };
    }),
  );
  await env.DB.prepare("UPDATE villas SET penthouse_user_id = ? WHERE id = ?").bind(id, villaId).run();
  return id;
}

/** 지금 사는(해체되지 않은) 빌라의 1등을 다시 계산한다. 빌라가 없으면 건너뛴다 */
export async function recomputeUserPenthouse(env: Env, userId: string): Promise<void> {
  const v = await env.DB.prepare(
    `SELECT m.villa_id AS villaId FROM memberships m JOIN villas v ON v.id = m.villa_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND v.dissolved_at IS NULL`,
  )
    .bind(userId)
    .first<{ villaId: string }>();
  if (v) await recomputePenthouse(env, v.villaId);
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
