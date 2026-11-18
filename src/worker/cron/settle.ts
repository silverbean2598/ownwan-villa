import type { Env } from "../env";
import { now } from "../clock";
import { settleDay } from "../../shared/rules/floor";
import { nextDay } from "../../shared/rules/day";
import { recomputePenthouse } from "../villa/service";
import { CERTIFIED_PHOTO } from "../cert/certified";

type Row = {
  id: string;
  streak: number;
  missRun: number;
  membershipId: string | null;
  floor: number | null;
  certified: number;
};

/** day(KST, YYYY-MM-DD)를 정산한다. 이미 정산된 날이면 아무것도 하지 않는다. 동시에 호출돼도 한 번만 반영된다. */
export async function settle(env: Env, day: string): Promise<{ settled: boolean }> {
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_settled_day'").first<{ value: string }>();
  if (last && last.value.slice(0, 10) >= day) return { settled: false };
  if (!(await applySettlement(env, day))) return { settled: false };

  const t = now();
  const { results: villas } = await env.DB.prepare(
    `SELECT DISTINCT v.id FROM villas v JOIN memberships m ON m.villa_id = v.id
     WHERE v.dissolved_at IS NULL AND m.left_at IS NULL`,
  ).all<{ id: string }>();
  for (const v of villas) await recomputePenthouse(env, v.id);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();
  return { settled: true };
}

const MAX_CATCH_UP_DAYS = 7;

/**
 * 크론 진입점: 마지막 정산일 다음 날부터 target 까지 밀린 날을 오래된 순서로 정산한다 (한 번에 최대 7일).
 * 정산 기록이 없으면(첫 실행) target 하루만. 실패하면 로그를 남기고 다시 던져 실행이 실패로 보이게 한다.
 */
export async function settleThrough(env: Env, target: string): Promise<string[]> {
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_settled_day'").first<{ value: string }>();
  const days: string[] = [];
  if (!last) days.push(target);
  else for (let d = nextDay(last.value.slice(0, 10)); d <= target && days.length < MAX_CATCH_UP_DAYS; d = nextDay(d)) days.push(d);
  const done: string[] = [];
  for (const day of days) {
    try {
      if ((await settle(env, day)).settled) done.push(day);
    } catch (e) {
      console.error(`settle ${day} failed (target ${target}, settled so far: ${done.join(",") || "none"})`, e);
      throw e;
    }
  }
  return done;
}

/** KST 날짜가 끝나는 시각(다음 날 00:00 KST)의 UTC ms */
function dayEndMs(day: string): number {
  return Date.parse(`${nextDay(day)}T00:00:00+09:00`);
}

/** 사전 확인 없이 하루치 변경을 한 batch로 쓴다. 날짜를 선점(claim)한 경우에만 true. (테스트용으로 export) */
export async function applySettlement(env: Env, day: string): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.streak, u.miss_run AS missRun, m.id AS membershipId, m.floor,
            EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.day = ?1 AND ${CERTIFIED_PHOTO}) AS certified
     FROM users u
     LEFT JOIN (
       SELECT m.id, m.user_id, m.floor FROM memberships m
       JOIN villas v ON v.id = m.villa_id
       WHERE m.left_at IS NULL AND v.dissolved_at IS NULL
     ) m ON m.user_id = u.id
     -- 그날이 끝난 뒤 가입한 사람은 그날 정산 대상이 아니다 (밀린 날을 몰아서 정산할 때)
     WHERE u.created_at < ?2`,
  )
    .bind(day, dayEndMs(day))
    .all<Row>();

  const t = now();
  const token = `${day}:${crypto.randomUUID()}`;
  const guard = "(SELECT value FROM settings WHERE key = 'last_settled_day') = ?";
  const stmts = [
    env.DB.prepare(
      `INSERT INTO settings(key, value) VALUES('last_settled_day', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE substr(settings.value, 1, 10) < ?`,
    ).bind(token, day),
  ];
  for (const r of results) {
    const { next, floorChanged } = settleDay({ streak: r.streak, missRun: r.missRun, floor: r.floor }, !!r.certified);
    stmts.push(
      env.DB.prepare(`UPDATE users SET streak = ?, miss_run = ? WHERE id = ? AND ${guard}`).bind(next.streak, next.missRun, r.id, token),
    );
    if (floorChanged && r.membershipId) {
      stmts.push(
        env.DB.prepare(`UPDATE memberships SET floor = ?, floor_reached_at = ? WHERE id = ? AND ${guard}`).bind(next.floor, t, r.membershipId, token),
      );
    }
  }
  await env.DB.batch(stmts);

  const won = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_settled_day'").first<{ value: string }>();
  return won?.value === token;
}
