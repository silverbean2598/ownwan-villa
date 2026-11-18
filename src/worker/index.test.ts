import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "./index";

describe("GET /api/health", () => {
  it("returns { ok: true }", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("has migrations applied to D1", async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
    ).first();
    expect(row).not.toBeNull();
  });
});
