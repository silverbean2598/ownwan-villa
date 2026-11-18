import type { Env } from "../env";
import { now } from "../clock";

const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
export const LOCKED_MSG = "로그인을 5번 실패해서 15분 동안 잠겼어요";

export function isLocked(user: { locked_until: number | null }): boolean {
  return !!user.locked_until && user.locked_until > now();
}

// 동시 요청에도 횟수가 유실되지 않도록 SQL 한 문장으로 원자적으로 갱신한다.
// 잠금이 풀린 뒤의 첫 실패는 1로 새로 센다.
export async function recordFailure(env: Env, userId: string): Promise<void> {
  const t = now();
  const expired = "(locked_until IS NOT NULL AND locked_until <= ?)";
  const count = `CASE WHEN ${expired} THEN 1 ELSE failed_logins + 1 END`;
  await env.DB.prepare(
    `UPDATE users SET failed_logins = ${count},
       locked_until = CASE WHEN ${count} >= ? THEN ? WHEN ${expired} THEN NULL ELSE locked_until END
     WHERE id = ?`,
  )
    .bind(t, t, MAX_FAILS, t + LOCK_MS, t, userId)
    .run();
}

export async function resetFailures(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(userId).run();
}
