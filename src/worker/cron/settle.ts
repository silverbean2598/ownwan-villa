import type { Env } from "../env";
import { now } from "../clock";
import { settleDay } from "../../shared/rules/floor";
import { recomputePenthouse } from "../villa/service";

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

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.streak, u.miss_run AS missRun, m.id AS membershipId, m.floor,
            EXISTS (SELECT 1 FROM certs c WHERE c.user_id = u.id AND c.day = ?1 AND c.kind = 'photo' AND c.duplicate = 0) AS certified
     FROM users u
     LEFT JOIN (
       SELECT m.id, m.user_id, m.floor FROM memberships m
       JOIN villas v ON v.id = m.villa_id
       WHERE m.left_at IS NULL AND v.dissolved_at IS NULL
     ) m ON m.user_id = u.id`,
  )
    .bind(day)
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
  if (won?.value !== token) return { settled: false };

  const { results: villas } = await env.DB.prepare(
    `SELECT DISTINCT v.id FROM villas v JOIN memberships m ON m.villa_id = v.id
     WHERE v.dissolved_at IS NULL AND m.left_at IS NULL`,
  ).all<{ id: string }>();
  for (const v of villas) await recomputePenthouse(env, v.id);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();
  return { settled: true };
}
