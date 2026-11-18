import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(c: Context, status: number, message: string) {
  return c.json({ error: message }, status as ContentfulStatusCode);
}

export { requireUser } from "./auth/session";
