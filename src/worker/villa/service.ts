import type { Env } from "../env";
import { VILLA_CAPACITY } from "../../shared/villa";
import { now } from "../clock";
import { certifiedInVilla, firstCertInVilla } from "../cert/certified";
import { kstDay } from "../../shared/rules/day";
import { displayFloor, displayStreak } from "../../shared/rules/streak";
import { pickPenthouse } from "../../shared/rules/penthouse";
import { logEvents } from "../events/log";
import { myVillaIds, tagVilla } from "./membership";
import { closeApplications, closeIfDissolved } from "../recruit/service";

export const MAX_MEMBERS = VILLA_CAPACITY;

export function newInviteToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...raw)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * 한 빌라의 1등을 다시 계산한다. 층 · 연속 기록은 이 빌라 입주 기록의 값(이 빌라에 올린 날로 센다)이고,
 * 오늘 이 빌라에 올린 사진이 있으면 그것까지 친다.
 */
export async function recomputePenthouse(env: Env, villaId: string): Promise<string | null> {
  const prev = await env.DB.prepare("SELECT penthouse_user_id AS id FROM villas WHERE id = ?").bind(villaId).first<{ id: string | null }>();
  const { results } = await env.DB.prepare(
    `SELECT m.user_id AS userId, u.nickname, m.floor, m.streak, m.floor_reached_at AS floorReachedAt,
       ${certifiedInVilla("m.user_id", "?1", "m.villa_id")} AS certifiedToday,
       ${firstCertInVilla("m.user_id", "?1", "m.villa_id")} AS firstCertAt
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.villa_id = ?2 AND m.left_at IS NULL`,
  )
    .bind(kstDay(now()), villaId)
    .all<{ userId: string; nickname: string; floor: number; streak: number; floorReachedAt: number; certifiedToday: number; firstCertAt: number | null }>();
  // 오늘 인증까지 친 연속 기록과 층(7일째면 바로 +1)으로 비교한다. 저장된 층은 자정 정산 때만 바뀐다
  const id = pickPenthouse(
    results.map((r) => {
      const cert = !!r.certifiedToday;
      const floor = displayFloor(r.floor, r.streak, cert);
      // 오늘 올라간 층은 이 빌라에 첫 사진 인증이 올라간 시각에 도달한 것으로 본다
      const floorReachedAt = floor > r.floor && r.firstCertAt !== null ? r.firstCertAt : r.floorReachedAt;
      return { userId: r.userId, floor, streak: displayStreak(r.streak, cert), floorReachedAt };
    }),
  );
  // 실제로 바뀐 경우에만 changes = 1 → 동시에 다시 계산해도 알림은 한 번
  const res = await env.DB.prepare("UPDATE villas SET penthouse_user_id = ?1 WHERE id = ?2 AND penthouse_user_id IS NOT ?1")
    .bind(id, villaId)
    .run();
  if (res.meta.changes === 1 && id) {
    const prevId = prev?.id ?? null;
    const holder = results.find((r) => r.userId === id)!;
    await logEvents(
      env,
      await tagVilla(env, villaId, [
        { userId: id, type: "penthouse_in" },
        // 빌라를 나간 전 1등에게는 알리지 않는다
        ...(prevId && prevId !== id && results.some((r) => r.userId === prevId)
          ? [{ userId: prevId, type: "penthouse_out" as const, payload: { nickname: holder.nickname, userId: id } }]
          : []),
      ]),
    );
  }
  return id;
}

/** 이 사람이 사는(해체되지 않은) 빌라 모두의 1등을 다시 계산한다. 빌라가 없으면 건너뛴다 */
export async function recomputeUserPenthouse(env: Env, userId: string): Promise<void> {
  for (const id of await myVillaIds(env, userId)) await recomputePenthouse(env, id);
}

/** 지금 사는 입주민 (나가기 · 승계 · 해체 판단에 쓴다) */
const ACTIVE = "SELECT user_id FROM memberships WHERE villa_id = ? AND left_at IS NULL";
/** 이 사람이 아직 이 빌라에 산다 (?, ? = villaId, userId) */
const STILL_IN = "SELECT 1 FROM memberships WHERE villa_id = ? AND user_id = ? AND left_at IS NULL";

/**
 * 한 사람이 빌라를 떠나는 문장들 (한 batch 안에서 쓴다): 나가기 → 방장 승계(남은 입주민 중 가장 먼저 입주한 사람)
 * → 아무도 없으면 해체. guard 를 주면 나가기 자체가 그 조건(SQL, 뒤에 붙는 값은 guardArgs)일 때만 일어난다.
 */
function leaveStatements(env: Env, villaId: string, userId: string, t: number, guard = "", guardArgs: unknown[] = []) {
  return [
    env.DB.prepare(`UPDATE memberships SET left_at = ? WHERE user_id = ? AND villa_id = ? AND left_at IS NULL${guard}`).bind(
      t, userId, villaId, ...guardArgs,
    ),
    // 승계 · 해체는 이 사람이 실제로 나갔을 때만 (guard 때문에 나가기가 안 일어났는데 방장이 바뀌면 안 된다)
    env.DB.prepare(
      `UPDATE villas SET owner_id = COALESCE((${ACTIVE} ORDER BY joined_at ASC, rowid ASC LIMIT 1), owner_id)
       WHERE id = ? AND owner_id = ? AND NOT EXISTS (${STILL_IN})`,
    ).bind(villaId, villaId, userId, villaId, userId),
    env.DB.prepare(
      `UPDATE villas SET dissolved_at = ?, penthouse_user_id = NULL, map_slot = NULL
       WHERE id = ? AND dissolved_at IS NULL AND NOT EXISTS (${ACTIVE}) AND NOT EXISTS (${STILL_IN})`,
    ).bind(t, villaId, villaId, villaId, userId),
  ];
}

/** 한 빌라에서 나간다. 다른 빌라에는 아무 영향이 없다 */
export async function leaveVilla(env: Env, userId: string, villaId: string): Promise<void> {
  const m = await env.DB.prepare("SELECT 1 AS x FROM memberships WHERE user_id = ? AND villa_id = ? AND left_at IS NULL")
    .bind(userId, villaId)
    .first();
  if (!m) throw new NotInVillaError();
  const [res] = await env.DB.batch(leaveStatements(env, villaId, userId, now()));
  // 그 사이 내보내졌거나 다른 요청으로 이미 나갔다
  if (res.meta.changes !== 1) throw new NotInVillaError();
  await recomputePenthouse(env, villaId);
  // 마지막 입주민이 나가 해체됐으면 모집 · 기다리는 신청도 끝낸다
  await closeIfDissolved(env, villaId).catch((e) => console.error("recruit cleanup failed", e));
}

/** 사는 빌라 모두에서 나간다 (탈퇴) */
export async function leaveAllVillas(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare("SELECT villa_id AS id FROM memberships WHERE user_id = ? AND left_at IS NULL")
    .bind(userId)
    .all<{ id: string }>();
  for (const r of results) {
    await env.DB.batch(leaveStatements(env, r.id, userId, now()));
    await recomputePenthouse(env, r.id);
    await closeIfDissolved(env, r.id).catch((e) => console.error("recruit cleanup failed", e));
  }
}

export class NotInVillaError extends Error {}
export class NotOwnerError extends Error {}
export class NotMemberError extends Error {}
export class NameMismatchError extends Error {}
export class VillaGoneError extends Error {}

/** 이 사람이 지금 이 (해체되지 않은) 빌라의 방장일 때만 참. batch 안 문장의 조건으로 붙인다 (?, ? = villaId, ownerId) */
const IS_OWNER = "EXISTS (SELECT 1 FROM villas WHERE id = ? AND owner_id = ? AND dissolved_at IS NULL)";
const IS_MEMBER = "EXISTS (SELECT 1 FROM memberships WHERE villa_id = ? AND user_id = ? AND left_at IS NULL)";

/** 왜 실패했는지: 빌라가 없으면 VillaGone, 방장이 아니면 NotOwner, 아니면 NotMember */
async function whyNot(env: Env, villaId: string, ownerId: string): Promise<Error> {
  const v = await env.DB.prepare("SELECT owner_id FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(villaId).first<{ owner_id: string }>();
  if (!v) return new VillaGoneError();
  if (v.owner_id !== ownerId) return new NotOwnerError();
  return new NotMemberError();
}

/**
 * 방장이 입주민을 내보낸다: 그 사람이 나간 것과 똑같고(연속 기록 · 포인트 · 가구 그대로, 다음 입주 때 1층),
 * 방장이 풀어 줄 때까지 다시 입주할 수 없게 막는다. 한 batch 안에서 "아직 방장인가 · 아직 사는가"를 함께 본다
 * (방장 넘기기 · 나가기와 동시에 일어나도 예전 방장이 내보내거나, 이미 나간 사람에게 금지만 남지 않는다).
 */
export async function kickMember(env: Env, villaId: string, ownerId: string, targetId: string): Promise<void> {
  const m = await env.DB.prepare("SELECT id FROM memberships WHERE villa_id = ? AND user_id = ? AND left_at IS NULL")
    .bind(villaId, targetId)
    .first<{ id: string }>();
  if (!m) throw await whyNot(env, villaId, ownerId);
  const t = now();
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO villa_bans (villa_id, user_id, created_at) SELECT ?, ?, ? WHERE ${IS_OWNER} AND ${IS_MEMBER}`,
    ).bind(villaId, targetId, t, villaId, ownerId, villaId, targetId),
    ...leaveStatements(env, villaId, targetId, t, ` AND ${IS_OWNER}`, [villaId, ownerId]),
  ]);
  if (res[1].meta.changes !== 1) throw await whyNot(env, villaId, ownerId);
  const v = await env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(villaId).first<{ name: string }>();
  // 내보낸 사람에게만 알린다 (다른 입주민에게는 알리지 않는다)
  await logEvents(env, [{ userId: targetId, type: "kicked", payload: { villaName: v?.name ?? "" }, key: `kicked:${m.id}` }]);
  await recomputePenthouse(env, villaId);
  // 내보낸 사람이 이 빌라에 보내 둔 입주 신청이 남아 있으면 거절로 끝낸다 (내보냄 알림을 이미 받았으니 따로 알리지 않는다)
  await env.DB.prepare(
    "UPDATE villa_applications SET status = 'rejected', reason = 'kicked', decided_at = ? WHERE villa_id = ? AND user_id = ? AND status = 'pending'",
  )
    .bind(now(), villaId, targetId)
    .run();
}

/** 방장을 다른 입주민에게 바로 넘긴다. 아직 방장이고 상대가 아직 살 때만 바뀐다 (한 문장) */
export async function transferOwner(env: Env, villaId: string, ownerId: string, targetId: string): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE villas SET owner_id = ?1 WHERE id = ?2 AND owner_id = ?3 AND dissolved_at IS NULL
       AND EXISTS (SELECT 1 FROM memberships WHERE villa_id = ?2 AND user_id = ?1 AND left_at IS NULL)`,
  )
    .bind(targetId, villaId, ownerId)
    .run();
  if (res.meta.changes !== 1) throw await whyNot(env, villaId, ownerId);
  const [target, others] = await env.DB.batch([
    env.DB.prepare("SELECT nickname, avatar FROM users WHERE id = ?").bind(targetId),
    env.DB.prepare("SELECT user_id AS userId FROM memberships WHERE villa_id = ? AND left_at IS NULL AND user_id != ?").bind(villaId, targetId),
  ]);
  const u = target.results[0] as { nickname: string; avatar: string } | undefined;
  let avatar: unknown = null;
  try {
    avatar = JSON.parse(u?.avatar ?? "null");
  } catch {}
  await logEvents(
    env,
    await tagVilla(env, villaId, [
      { userId: targetId, type: "owner_in" },
      ...(others.results as { userId: string }[]).map((o) => ({
        userId: o.userId,
        type: "owner_changed" as const,
        payload: { nickname: u?.nickname ?? "", userId: targetId, avatar },
      })),
    ]),
  );
}

/**
 * 빌라 해체: 입주민 모두 나가기 + 빌라 해체(초대 링크는 해체된 빌라라 못 쓴다) + 내보낸 사람 목록 지우기를 한 batch 로.
 * 빌라 이름이 맞고 아직 방장일 때만 해체되고, 해체가 일어난 경우에만 나머지가 따라간다. 도시 지도 자리도 비운다.
 */
export async function dissolveVilla(env: Env, villaId: string, ownerId: string, confirmName: string): Promise<void> {
  const v = await env.DB.prepare("SELECT name, owner_id FROM villas WHERE id = ? AND dissolved_at IS NULL").bind(villaId).first<{ name: string; owner_id: string }>();
  if (!v) throw new VillaGoneError();
  if (v.owner_id !== ownerId) throw new NotOwnerError();
  if (confirmName.trim() !== v.name) throw new NameMismatchError();
  const t = now();
  const dissolvedNow = "EXISTS (SELECT 1 FROM villas WHERE id = ? AND dissolved_at = ?)";
  const [res, left] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE villas SET dissolved_at = ?, penthouse_user_id = NULL, map_slot = NULL WHERE id = ? AND owner_id = ? AND name = ? AND dissolved_at IS NULL",
    ).bind(t, villaId, ownerId, v.name),
    env.DB.prepare(`UPDATE memberships SET left_at = ? WHERE villa_id = ? AND left_at IS NULL AND ${dissolvedNow} RETURNING user_id AS userId`).bind(
      t, villaId, villaId, t,
    ),
    env.DB.prepare(`DELETE FROM villa_bans WHERE villa_id = ? AND ${dissolvedNow}`).bind(villaId, villaId, t),
  ]);
  if (res.meta.changes !== 1) {
    const why = await whyNot(env, villaId, ownerId);
    // 아직 방장인데 해체되지 않았다면 그 사이 이름이 바뀐 것
    throw why instanceof NotMemberError ? new NameMismatchError() : why;
  }
  await logEvents(
    env,
    (left.results as { userId: string }[]).map((m) => ({
      userId: m.userId,
      type: "dissolved" as const,
      payload: { villaName: v.name },
      key: `dissolved:${villaId}:${m.userId}`,
    })),
  );
  // 모집 글을 끄고 기다리던 입주 신청을 취소한다 (신청한 사람에게 살짝 알림)
  await env.DB.prepare("UPDATE villa_recruits SET open = 0, updated_at = ? WHERE villa_id = ?").bind(t, villaId).run();
  await closeApplications(env, villaId, "dissolved");
}
