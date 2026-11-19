import type { Env } from "../env";
import { now } from "../clock";
import { logEvents } from "../events/log";
import { APPLY_KEEP_MS, APPLY_TTL_MS } from "../../shared/recruit";
import { VILLA_CAPACITY } from "../../shared/villa";

/**
 * 빈방 모집 · 입주 신청 [확정 — 기획자 결정, 2026-11-19]: 빌라 쪽 일(해체 · 내보내기 · 정원 참 · 모집 끔)에 따라
 * 기다리는 신청을 정리하는 함수들. 모두 "status = 'pending'" 조건이 붙은 문장이라 동시에 불려도 한 번만 바뀐다.
 */

/** 왜 신청이 끝났는지 (villa_applications.reason, 알림 payload.reason) */
export type CloseReason = "recruit_off" | "hidden" | "full" | "dissolved" | "expired";

/** 7일이 지나지 않은 신청만 (?자리 = now() - TTL) */
export const FRESH = (alias: string, cutoff: string) => `${alias}.status = 'pending' AND ${alias}.created_at > ${cutoff}`;
export const cutoffOf = (t: number) => t - APPLY_TTL_MS;

/** 이 빌라의 지금 입주민 수 (?자리 = 빌라 id) */
export const MEMBER_COUNT = (villa: string) => `(SELECT COUNT(*) FROM memberships WHERE villa_id = ${villa} AND left_at IS NULL)`;

const villaName = async (env: Env, villaId: string) =>
  (await env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(villaId).first<{ name: string }>())?.name ?? "";

/**
 * 이 빌라에 기다리는 신청을 모두 취소하고 신청한 사람에게 살짝 알린다.
 * when: 추가 조건(SQL, 뒤의 값은 args). 그 조건이 참일 때만 취소된다 (예: 모집이 지금 꺼져 있을 때만)
 */
export async function closeApplications(env: Env, villaId: string, reason: CloseReason, when = "", args: unknown[] = []): Promise<number> {
  const t = now();
  const { results } = await env.DB.prepare(
    `UPDATE villa_applications SET status = 'cancelled', reason = ?, decided_at = ?
     WHERE villa_id = ? AND status = 'pending'${when} RETURNING id, user_id AS userId, created_at AS createdAt`,
  )
    .bind(reason, t, villaId, ...args)
    .all<{ id: string; userId: string; createdAt: number }>();
  // 이미 7일이 지난 신청은 조용히 정리만 한다 (신청한 사람에게는 만료로 보였다)
  const live = results.filter((r) => r.createdAt > cutoffOf(t));
  if (live.length) {
    const name = await villaName(env, villaId);
    await logEvents(
      env,
      live.map((r) => ({ userId: r.userId, type: "application_closed" as const, payload: { villaId, villaName: name, reason }, key: `apply_closed:${r.id}` })),
    );
  }
  return results.length;
}

/** 정원이 찼으면 모집을 끄고 기다리는 신청을 취소한다 (초대 링크 입주 · 신청 승인 뒤) */
export async function closeIfFull(env: Env, villaId: string): Promise<void> {
  const full = `${MEMBER_COUNT("?")} >= ?`;
  await env.DB.prepare(`UPDATE villa_recruits SET open = 0, updated_at = ? WHERE villa_id = ? AND open = 1 AND ${full}`)
    .bind(now(), villaId, villaId, VILLA_CAPACITY)
    .run();
  await closeApplications(env, villaId, "full", ` AND ${full}`, [villaId, VILLA_CAPACITY]);
}

/** 빌라가 해체됐으면(방장 해체 · 마지막 입주민이 나감 · 탈퇴) 모집을 끄고 기다리는 신청을 취소한다 */
export async function closeIfDissolved(env: Env, villaId: string): Promise<void> {
  const gone = " AND EXISTS (SELECT 1 FROM villas WHERE id = ? AND dissolved_at IS NOT NULL)";
  await env.DB.prepare(`UPDATE villa_recruits SET open = 0, updated_at = ? WHERE villa_id = ? AND open = 1${gone}`).bind(now(), villaId, villaId).run();
  await closeApplications(env, villaId, "dissolved", gone, [villaId]);
}

/** 빌라를 지도에서 내리면 모집도 끈다 (지도에 없으면 아무도 신청할 수 없으므로) */
export async function closeIfHidden(env: Env, villaId: string): Promise<void> {
  const hidden = " AND EXISTS (SELECT 1 FROM villas WHERE id = ? AND public = 0)";
  await env.DB.prepare(`UPDATE villa_recruits SET open = 0, updated_at = ? WHERE villa_id = ? AND open = 1${hidden}`).bind(now(), villaId, villaId).run();
  await closeApplications(env, villaId, "hidden", hidden, [villaId]);
}

/**
 * 매일 크론: 7일이 지난 신청을 expired 로 바꾸고 신청한 사람에게 알린다. 끝난 지 30일 지난 기록과 해체된 빌라의 모집 글은 지운다.
 */
export async function purgeApplications(env: Env): Promise<{ expired: number; deleted: number }> {
  const t = now();
  const [exp, del] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE villa_applications SET status = 'expired', reason = 'expired', decided_at = ?
       WHERE status = 'pending' AND created_at <= ? RETURNING id, villa_id AS villaId, user_id AS userId`,
    ).bind(t, cutoffOf(t)),
    env.DB.prepare("DELETE FROM villa_applications WHERE status != 'pending' AND COALESCE(decided_at, created_at) < ?").bind(t - APPLY_KEEP_MS),
    env.DB.prepare("DELETE FROM villa_recruits WHERE villa_id IN (SELECT id FROM villas WHERE dissolved_at IS NOT NULL)"),
  ]);
  const rows = exp.results as { id: string; villaId: string; userId: string }[];
  if (rows.length) {
    const ids = [...new Set(rows.map((r) => r.villaId))];
    const { results } = await env.DB.prepare(`SELECT id, name FROM villas WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string; name: string }>();
    const names = new Map(results.map((r) => [r.id, r.name]));
    await logEvents(
      env,
      rows.map((r) => ({
        userId: r.userId,
        type: "application_closed" as const,
        payload: { villaId: r.villaId, villaName: names.get(r.villaId) ?? "", reason: "expired" },
        key: `apply_closed:${r.id}`,
      })),
    );
  }
  return { expired: rows.length, deleted: del.meta.changes };
}
