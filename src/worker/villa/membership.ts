import type { Env } from "../env";
import type { NewEvent } from "../events/log";

/** 지금 사는(해체되지 않은) 입주 기록. user = 사용자 id 자리(예: "?1"). 별칭 m(입주 기록), v(빌라). FROM 뒤에 붙인다 */
export const myActive = (user: string) => `memberships m JOIN villas v ON v.id = m.villa_id AND v.dissolved_at IS NULL
  WHERE m.user_id = ${user} AND m.left_at IS NULL`;

/** 사용자가 지금 사는 빌라 수를 세는 식 (?1 자리에 사용자 id). 입주 · 만들기 문장 안에서 3곳 제한을 본다 */
export const ACTIVE_COUNT = (param: string) =>
  `(SELECT COUNT(*) FROM memberships cm JOIN villas cv ON cv.id = cm.villa_id AND cv.dissolved_at IS NULL
    WHERE cm.user_id = ${param} AND cm.left_at IS NULL)`;

/** 내가 사는 빌라 id, 입주한 순서 */
export async function myVillaIds(env: Env, userId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT m.villa_id AS id FROM ${myActive("?1")} ORDER BY m.joined_at ASC, m.rowid ASC`)
    .bind(userId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/** 이 사람이 지금 이 (해체되지 않은) 빌라에 산다 */
export async function isMember(env: Env, villaId: string, userId: string): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT 1 AS x FROM ${myActive("?1")} AND m.villa_id = ?2`).bind(userId, villaId).first());
}

/**
 * 빌라에서 생긴 알림에 빌라 정보를 붙인다: villaId, villaName, multi(받는 사람이 지금 빌라 2곳 이상에 사는지).
 * 화면은 multi 일 때만 빌라 이름을 보여 준다 (빌라 1곳에 사는 사람에게는 지금과 같은 문구)
 */
export async function tagVilla(env: Env, villaId: string, events: NewEvent[]): Promise<NewEvent[]> {
  if (!events.length) return events;
  try {
    return await tag(env, villaId, events);
  } catch (e) {
    // 빌라 정보를 못 붙여도 알림은 그대로 보낸다
    console.error("tagVilla failed", e);
    return events;
  }
}

async function tag(env: Env, villaId: string, events: NewEvent[]): Promise<NewEvent[]> {
  const users = [...new Set(events.map((e) => e.userId))];
  const [name, counts] = await env.DB.batch([
    env.DB.prepare("SELECT name FROM villas WHERE id = ?").bind(villaId),
    env.DB.prepare(
      `SELECT m.user_id AS userId, COUNT(*) AS n FROM memberships m JOIN villas v ON v.id = m.villa_id AND v.dissolved_at IS NULL
       WHERE m.left_at IS NULL AND m.user_id IN (${users.map(() => "?").join(",")}) GROUP BY m.user_id`,
    ).bind(...users),
  ]);
  const villaName = (name.results[0] as { name: string } | undefined)?.name ?? "";
  const n = new Map((counts.results as { userId: string; n: number }[]).map((r) => [r.userId, r.n]));
  return events.map((e) => ({ ...e, payload: { ...e.payload, villaId, villaName, multi: (n.get(e.userId) ?? 0) > 1 } }));
}
