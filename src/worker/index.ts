import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { auth } from "./auth/routes";
import { recovery } from "./recovery/routes";
import { villa } from "./villa/routes";
import { profile } from "./profile/routes";
import { cert } from "./cert/routes";
import { shop } from "./shop/routes";
import { settle } from "./cron/settle";
import { now } from "./clock";
import { kstDay } from "../shared/rules/day";

export const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/", auth);
app.route("/", recovery);
app.route("/", villa);
app.route("/", profile);
app.route("/", cert);
app.route("/", shop);

// 자정(KST) 정산: 방금 끝난 날을 정산한다
async function scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(settle(env, kstDay(now() - 60_000)));
}

export default { fetch: app.fetch, scheduled };
