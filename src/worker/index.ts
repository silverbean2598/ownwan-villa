import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { auth } from "./auth/routes";
import { recovery } from "./recovery/routes";
import { villa } from "./villa/routes";
import { profile } from "./profile/routes";

export const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/", auth);
app.route("/", recovery);
app.route("/", villa);
app.route("/", profile);

// 자정(KST) 정산은 이후 태스크에서 구현
async function scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {}

export default { fetch: app.fetch, scheduled };
