import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "../index";
import { setNow } from "../clock";
import { applySettlement, settle } from "./settle";

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
  ).bind(id, "아파트", "o", id, dissolved ? 1 : null).run();
  return id;
}
async function member(userId: string, villaId: string, floor = 1, reachedAt = 100) {
  await env.DB.prepare(
    // 아파트 1곳에만 살던 기존 데이터처럼 사용자 연속 기록 · 쉰 날을 입주 기록에 그대로 둔다 (0010 마이그레이션과 같다)
    `INSERT INTO memberships(id, user_id, villa_id, floor, floor_reached_at, joined_at, streak, miss_run)
     SELECT ?, ?, ?, ?, ?, 0, streak, miss_run FROM users WHERE id = ?`,
  ).bind(`m${n++}`, userId, villaId, floor, reachedAt, userId).run();
}
async function cert(userId: string, day = DAY, duplicate = 0, deleted = 0) {
  await env.DB.prepare(
    "INSERT INTO certs(id, user_id, day, kind, points, duplicate, deleted, created_at) VALUES(?,?,?,'photo',1,?,?,0)",
  ).bind(`c${n++}`, userId, day, duplicate, deleted).run();
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

  it("guard_blocks_writes_when_day_already_claimed", async () => {
    const v = await villa();
    const a = await user(6, 0);
    await member(a, v, 1, 100);
    await cert(a);
    await env.DB.prepare("INSERT INTO settings VALUES('last_settled_day', ?)").bind(`${DAY}:other-token`).run();
    expect(await applySettlement(env, DAY)).toBe(false);
    expect(await getUser(a)).toEqual({ streak: 6, missRun: 0 });
    expect(await getM(a)).toEqual({ floor: 1, at: 100 });
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

  it("deleted_only_photo_counts_as_missed", async () => {
    const v = await villa();
    const a = await user(3);
    await member(a, v, 2);
    await cert(a, DAY, 0, 1);
    await settle(env, DAY);
    expect(await getUser(a)).toEqual({ streak: 0, missRun: 1 });
  });

  it("deletes_expired_sessions", async () => {
    await env.DB.prepare("INSERT INTO sessions VALUES('old','x',4000),('new','x',9000)").run();
    await settle(env, DAY);
    const { results } = await env.DB.prepare("SELECT token_hash AS t FROM sessions").all<{ t: string }>();
    expect(results.map((r) => r.t)).toEqual(["new"]);
  });
});

describe("scheduled", () => {
  const lastDay = async () =>
    (await env.DB.prepare("SELECT value FROM settings WHERE key='last_settled_day'").first<{ value: string }>())!.value.slice(0, 10);
  async function runScheduled(e: typeof env = env) {
    const ps: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => ps.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
    await worker.scheduled({} as ScheduledController, e, ctx);
    await Promise.all(ps);
  }

  it("exposes fetch and scheduled", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });

  it("settles the day that just ended", async () => {
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    const a = await user(1);
    await cert(a);
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-18");
    expect((await getUser(a))!.streak).toBe(2);
  });

  it("first_run_settles_only_target_day", async () => {
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    const a = await user(0, 0);
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-18");
    expect((await getUser(a))!.missRun).toBe(1);
  });

  it("catches_up_missed_days_in_order", async () => {
    await env.DB.prepare("INSERT INTO settings VALUES('last_settled_day', '2026-11-15:t')").run();
    const a = await user(5);
    await cert(a, "2026-11-16");
    await cert(a, "2026-11-17");
    await cert(a, "2026-11-18");
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-18");
    expect(await getUser(a)).toEqual({ streak: 8, missRun: 0 });
    // 순서대로: 16일 미인증 → 17·18일 인증이면 streak 2
    const b = await user(5);
    await cert(b, "2026-11-20");
    await cert(b, "2026-11-21");
    setNow(() => Date.parse("2026-11-21T15:00:00Z"));
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-21");
    expect(await getUser(b)).toEqual({ streak: 2, missRun: 0 });
  });

  it("catch_up_caps_at_7_days_per_run", async () => {
    await env.DB.prepare("INSERT INTO settings VALUES('last_settled_day', '2026-11-01:t')").run();
    const a = await user(0, 0);
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-08");
    expect((await getUser(a))!.missRun).toBe(7);
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-15");
    await runScheduled();
    expect(await lastDay()).toBe("2026-11-18");
    expect((await getUser(a))!.missRun).toBe(17);
  });

  it("user_created_after_day_is_not_settled_for_it", async () => {
    await env.DB.prepare("INSERT INTO settings VALUES('last_settled_day', '2026-11-16:t')").run();
    const late = `late${n++}`;
    // 11-18 09:00 KST 가입: 11-17 정산 대상이 아니다
    await env.DB.prepare(
      "INSERT INTO users(id, username, nickname, password_hash, recovery_hash, created_at) VALUES(?,?,?,?,?,?)",
    ).bind(late, late, "닉", "x", "x", Date.parse("2026-11-18T00:00:00Z")).run();
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    await runScheduled();
    expect((await getUser(late))!.missRun).toBe(1);
  });

  it("failure_is_logged_and_rethrown", async () => {
    setNow(() => Date.parse("2026-11-18T15:00:00Z"));
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      const broken = {
        prepare: (q: string) => env.DB.prepare(q),
        batch: () => Promise.reject(new Error("boom")),
      } as unknown as D1Database;
      await expect(runScheduled({ ...env, DB: broken })).rejects.toThrow("boom");
    } finally {
      console.error = orig;
    }
    expect(errors.length).toBe(1);
    expect(String(errors[0][0])).toContain("2026-11-18");
  });
});
