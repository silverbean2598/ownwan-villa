import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireUser } from "../http";
import { pendingApprovals } from "../recovery/routes";

export const badges = new Hono<AppEnv>();

badges.get("/api/badges", requireUser, async (c) =>
  c.json({ recoveryApprovals: (await pendingApprovals(c.env, c.get("userId"))).length }),
);
