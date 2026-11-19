import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { auth } from "./auth/routes";
import { kakao } from "./auth/kakao";
import { recovery } from "./recovery/routes";
import { villa } from "./villa/routes";
import { profile } from "./profile/routes";
import { cert } from "./cert/routes";
import { shop } from "./shop/routes";
import { report } from "./report/routes";
import { badges } from "./badges/routes";
import { events } from "./events/routes";
import { cheer } from "./cheer/routes";
import { city } from "./city/routes";
import { settleThrough } from "./cron/settle";
import { now } from "./clock";
import { kstDay } from "../shared/rules/day";

export const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/", auth);
app.route("/", kakao);
app.route("/", recovery);
app.route("/", villa);
app.route("/", profile);
app.route("/", cert);
app.route("/", shop);
app.route("/", report);
app.route("/", badges);
app.route("/", events);
app.route("/", cheer);
app.route("/", city);

// 자정(KST) 정산: 방금 끝난 날까지, 밀린 날이 있으면 함께 정산한다.
// 끝까지 기다려 실패가 실행 결과(Workers Logs)에 그대로 드러나게 한다.
async function scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
  await settleThrough(env, kstDay(now() - 60_000));
}

export default { fetch: app.fetch, scheduled };
