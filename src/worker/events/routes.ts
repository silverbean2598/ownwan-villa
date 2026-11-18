import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";

export const events = new Hono<AppEnv>();

const LIMIT = 20;

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

/** 아직 안 본 내 이벤트, 오래된 것부터 */
events.get("/api/events", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, type, payload, created_at AS createdAt FROM events
     WHERE user_id = ? AND seen_at IS NULL ORDER BY created_at ASC, rowid ASC LIMIT ?`,
  )
    .bind(c.get("userId"), LIMIT)
    .all<{ id: string; type: string; payload: string; createdAt: number }>();
  return c.json(results.map((r) => ({ ...r, payload: parsePayload(r.payload) })));
});

/** 화면에 보여 준 이벤트를 본 것으로. 남의 이벤트 id는 조용히 무시한다 */
events.post("/api/events/seen", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  const ids = b?.ids;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every((x) => typeof x === "string" && x.length <= 200)) {
    return jsonError(c, 400, "요청이 올바르지 않아요");
  }
  if (ids.length) {
    await c.env.DB.prepare(
      `UPDATE events SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(now(), c.get("userId"), ...ids)
      .run();
  }
  return c.json({ ok: true });
});
