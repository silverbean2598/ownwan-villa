import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireUser } from "../http";
import { pendingApprovals } from "../recovery/routes";
import { receivedCount } from "../recruit/routes";

export const badges = new Hono<AppEnv>();

// applications: 내가 방장인 빌라에 온, 기다리는 입주 신청 수
badges.get("/api/badges", requireUser, async (c) =>
  c.json({
    recoveryApprovals: (await pendingApprovals(c.env, c.get("userId"))).length,
    applications: await receivedCount(c.env, c.get("userId")),
  }),
);
