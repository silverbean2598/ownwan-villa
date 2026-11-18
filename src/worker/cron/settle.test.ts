import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "../index";
import { setNow } from "../clock";
import { settle } from "./settle";

const DAY = "2026-11-18";
let n = 0;

async function user(streak = 0, missRun = 0) {
  const id = `u${n++}`;
  await env.DB.prepare(
    "INSERT INTO users(id, username, nickname, password_hash, recovery_hash, streak, miss_run, created_at) VALUES(?,?,?,?,?,?,?,0)",
  ).bind(id, id, "닉", "x", "x", streak, missRun).run();
  return id;
}
async function villa(dissolved = false) {
  const id = `v${n++}`;
  await env.DB.prepare(
    "INSERT INTO villas(id, name, owner_id, invite_token, created_at, dissolved_at) VALUES(?,?,?,?,0,?)",
  ).bind(id, "빌라", "o", id, dissolved ? 1 : null).run();
  return id;
}
async function member(userId: string, villaId: string, floor = 1, reachedAt = 100) {
  await env.DB.prepare(
    "INSERT INTO memberships(id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES(?,?,?,?,?,0)",
  ).bind(`m${n++}`, userId, villaId, floor, reachedAt).run();
}
async function cert(userId: string, day = DAY, duplicate = 0) {
  await env.DB.prepare(
    "INSERT INTO certs(id, user_id, day, kind, points, duplicate, created_at) VALUES(?,?,?,'photo',1,?,0)",
  ).bind(`c${n++}`, userId, day, duplicate).run();
}
const getUser = (id: string) =>
  env.DB.prepare("SELECT streak, miss_run AS missRun FROM users WHERE id = ?").bind(id).first<{ streak: number; missRun: number }>();
const getM = (id: string) =>
  env.DB.prepare("SELECT floor, floor_reached_at AS at FROM memberships WHERE user_id = ?").bind(id).first<{ floor: number; at: number }>();

beforeEach(async () => {
  setNow(() => 5000);
  for (const t of ["users", "villas", "memberships", "certs", "settings", "sessions"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
});
afterEach(() => setNow(null));

describe("settle", () => {
  it("settles_all_users", async () => {
    const v = await villa();
    const a = await user(2);
    const b = await user(3);
    await member(a, v, 1);
    await member(b, v, 3);
    await cert(a);
    expect(await settle(env, DAY)).toEqual({ settled: true });
    expect(await getUser(a)).toEqual({ streak: 3, missRun: 0 });
    expect(await getUser(b)).toEqual({ streak: 0, missRun: 1 });
    expect((await getM(b))!.floor).toBe(2);
    expect((await getM(a))!.floor).toBe(1);
  });

  it("idempotent", async () => {
    const v = await villa();
    const a = await user(2);
    await member(a, v);
    await cert(a);
    expect((await settle(env, DAY)).settled).toBe(true);
    expect((await settle(env, DAY)).settled).toBe(false);
    expect((await settle(env, "2026-11-17")).settled).toBe(false);
    expect(await getUser(a)).toEqual({ streak: 3, missRun: 0 });
  });

  it("concurrent_settle_applies_once", async () => {
    const v = await villa();
    const a = await user(2);
    await member(a, v);
    await cert(a);
    const rs = await Promise.all([settle(env, DAY), settle(env, DAY)]);
    expect(rs.filter((r) => r.settled)).toHaveLength(1);
    expect(await getUser(a)).toEqual({ streak: 3, missRun: 0 });
  });

  it("floor_up_sets_floor_reached_at", async () => {
    const v = await villa();
    const a = await user(6);
    await member(a, v, 1, 100);
    await cert(a);
    await settle(env, DAY);
    expect(await getM(a)).toEqual({ floor: 2, at: 5000 });
  });

  it("floor_down_sets_floor_reached_at", async () => {
    const v = await villa();
    const a = await user(0, 0);
    await member(a, v, 3, 100);
    await settle(env, DAY);
    expect(await getM(a)).toEqual({ floor: 2, at: 5000 });
  });

  it("penthouse_recomputed_for_each_villa", async () => {
    const v1 = await villa();
    const v2 = await villa();
    const a = await user(6);
    const b = await user(0);
    await member(a, v1, 1);
    await member(b, v2, 1);
    await cert(a);
    await settle(env, DAY);
    const pent = (id: string) => env.DB.prepare("SELECT penthouse_user_id AS p FROM villas WHERE id = ?").bind(id).first<{ p: string }>();
    expect((await pent(v1))!.p).toBe(a);
    expect((await pent(v2))!.p).toBe(b);
  });

  it("user_without_villa_keeps_streak", async () => {
    const a = await user(4);
    const b = await user(4, 2);
    await cert(a);
    await settle(env, DAY);
    expect(await getUser(a)).toEqual({ streak: 5, missRun: 0 });
    expect(await getUser(b)).toEqual({ streak: 0, missRun: 3 });
  });

  it("dissolved_villa_member_has_no_floor", async () => {
    const v = await villa(true);
    const a = await user(0);
    await member(a, v, 3);
    await settle(env, DAY);
    expect((await getM(a))!.floor).toBe(3);
    expect((await getUser(a))!.missRun).toBe(1);
  });

  it("duplicate_only_day_counts_as_missed", async () => {
    const v = await villa();
    const a = await user(3);
    await member(a, v, 2);
    await cert(a, DAY, 1);
    await settle(env, DAY);
    expect(await getUser(a)).toEqual({ streak: 0, missRun: 1 });
    expect((await getM(a))!.floor).toBe(1);
  });

  it("deletes_expired_sessions", async () => {
    await env.DB.prepare("INSERT INTO sessions VALUES('old','x',4000),('new','x',9000)").run();
    await settle(env, DAY);
    const { results } = await env.DB.prepare("SELECT token_hash AS t FROM sessions").all<{ t: string }>();
    expect(results.map((r) => r.t)).toEqual(["new"]);
  });
});

describe("scheduled", () => {
  it("exposes fetch and scheduled", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });

  it("settles the day that just ended", async () => {
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    const a = await user(1);
    await cert(a);
    const ps: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => ps.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
    await worker.scheduled({} as ScheduledController, env, ctx);
    await Promise.all(ps);
    const s = await env.DB.prepare("SELECT value FROM settings WHERE key='last_settled_day'").first<{ value: string }>();
    expect(s!.value.slice(0, 10)).toBe("2026-11-18");
    expect((await getUser(a))!.streak).toBe(2);
  });
});
