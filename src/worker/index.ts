import { Hono } from "hono";
import type { AppEnv, Env } from "./env";

export const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

// 자정(KST) 정산은 이후 태스크에서 구현
async function scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {}

export default { fetch: app.fetch, scheduled };
