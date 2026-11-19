import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./index";
import { setNow } from "./clock";
import { settle } from "./cron/settle";
import { kstDay, prevDay } from "../shared/rules/day";

// 0010(여러 빌라에 살기)을 지금 운영 데이터 모양(빌라 1곳씩)에 적용해도 예전과 똑같이 움직이는지 본다.
// 빈 D1(MIGTEST)에 0001~0009 만 적용 → 예전 서버처럼 데이터를 넣고 → 0010 적용 → 새 서버로 확인

const all = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
const DB = (env as unknown as { MIGTEST: D1Database }).MIGTEST;
const E = { ...env, DB };

const T0 = Date.parse("2026-11-18T20:00:00+09:00");
const TODAY = kstDay(T0);
const YESTERDAY = prevDay(TODAY);

const send = (method: string, path: string, cookie?: string) => app.request(path, { method, headers: cookie ? { cookie } : {} }, E);
async function signup(username: string) {
  const res = await app.request(
    "/api/signup",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: "password1", nickname: username.slice(0, 10), over14: true, agree: true }) },
    E,
  );
  expect(res.status).toBe(201);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie };
}

afterEach(() => setNow(null));

describe("0010 마이그레이션", () => {
  it("existing_single_villa_data_behaves_exactly_as_before", async () => {
    setNow(() => T0);
    await applyD1Migrations(DB, all.filter((m) => m.name < "0010"));
    // 예전 스키마: 사용자 1명 = 빌라 1곳
    expect(
      await DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'one_active_villa'").first(),
    ).not.toBeNull();

    const owner = await signup("mgowner");
    const mate = await signup("mgmate");
    const mover = await signup("mgmover");
    const loner = await signup("mgloner");
    const other = await signup("mgother");
    const q = (sql: string, ...args: unknown[]) => DB.prepare(sql).bind(...args);
    await DB.batch([
      q("UPDATE users SET streak = 13, miss_run = 0, created_at = 0, points = 300 WHERE id = ?", owner.id),
      q("UPDATE users SET streak = 2, miss_run = 0, created_at = 0 WHERE id = ?", mate.id),
      q("UPDATE users SET streak = 0, miss_run = 6, created_at = 0 WHERE id = ?", mover.id),
      q("UPDATE users SET streak = 3, created_at = 0 WHERE id = ?", loner.id),
      q("INSERT INTO villas (id, name, owner_id, invite_token, penthouse_user_id, created_at) VALUES ('V', '우리빌라', ?, 'tokV', ?, 0)", owner.id, owner.id),
      q("INSERT INTO villas (id, name, owner_id, invite_token, penthouse_user_id, created_at) VALUES ('X', '전빌라', ?, 'tokX', ?, 0)", other.id, other.id),
      q("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES ('m1', ?, 'V', 2, 50, 0)", owner.id),
      q("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES ('m2', ?, 'V', 1, 10, 1)", mate.id),
      q("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at, left_at) VALUES ('m3', ?, 'X', 3, 10, 0, 5)", mover.id),
      q("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES ('m4', ?, 'V', 2, 10, 6)", mover.id),
      q("INSERT INTO memberships (id, user_id, villa_id, floor, floor_reached_at, joined_at) VALUES ('m5', ?, 'X', 1, 10, 0)", other.id),
      // 방장은 오늘 사진(14일째), 짝꿍은 어제 사진, 옮긴 사람은 전 빌라에 살 때 올린 사진, 혼자인 사람도 사진
      q("INSERT INTO certs (id, user_id, day, kind, r2_key, points, duplicate, created_at) VALUES ('c1', ?, ?, 'photo', 'photos/c1.jpg', 20, 0, ?)", owner.id, TODAY, T0 - 1000),
      q("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES ('c2', ?, ?, 'photo', 20, 0, ?)", mate.id, YESTERDAY, T0 - 86_400_000),
      q("INSERT INTO certs (id, user_id, day, kind, body, points, duplicate, created_at) VALUES ('c3', ?, ?, 'routine', '런지', 10, 0, 3)", mover.id, "2026-10-01"),
      q("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES ('c4', ?, ?, 'photo', 20, 0, ?)", loner.id, TODAY, T0 - 500),
      q("INSERT INTO certs (id, user_id, day, kind, points, duplicate, deleted, created_at) VALUES ('c5', ?, ?, 'photo', 20, 0, 1, ?)", mate.id, TODAY, T0 - 400),
    ]);

    // 0010 적용 (앞의 9개는 건너뛴다)
    await applyD1Migrations(DB, all);

    // 기록은 지금 사는 빌라로. 빌라 없는 사람의 기록은 어디에도 없다
    const links = (await DB.prepare("SELECT cert_id AS c, villa_id AS v FROM cert_villas ORDER BY cert_id").all<{ c: string; v: string }>()).results;
    expect(links).toEqual([
      { c: "c1", v: "V" },
      { c: "c2", v: "V" },
      { c: "c3", v: "V" },
      { c: "c5", v: "V" },
    ]);
    // 지금 사는 빌라의 입주 기록은 사용자 연속 기록 · 쉰 날을 그대로 가져온다. 나간 기록은 0
    const ms = (await DB.prepare("SELECT id, streak, miss_run AS missRun FROM memberships ORDER BY id").all()).results;
    expect(ms).toEqual([
      { id: "m1", streak: 13, missRun: 0 },
      { id: "m2", streak: 2, missRun: 0 },
      { id: "m3", streak: 0, missRun: 0 },
      { id: "m4", streak: 0, missRun: 6 },
      { id: "m5", streak: 0, missRun: 0 },
    ]);
    const indexes = (await DB.prepare("SELECT name FROM sqlite_master WHERE type IN ('index', 'trigger')").all<{ name: string }>()).results.map((r) => r.name);
    expect(indexes).not.toContain("one_active_villa");
    expect(indexes).toEqual(expect.arrayContaining(["one_active_membership", "cert_villas_default"]));

    // 빌라 화면: 방장은 오늘 14일째라 바로 3층(+1), 1등 그대로
    const villa = (await (await send("GET", "/api/villas/V", mate.cookie)).json()) as any;
    const byId = Object.fromEntries(villa.members.map((m: any) => [m.userId, m]));
    expect(byId[owner.id]).toMatchObject({ floor: 3, floorUpToday: true, streak: 13, userStreak: 13, certifiedToday: true });
    expect(byId[mate.id]).toMatchObject({ floor: 1, certifiedToday: false });
    expect(villa.penthouseUserId).toBe(owner.id);
    // 예전처럼 같은 빌라 입주민은 옮긴 사람의 예전 기록까지 본다
    const board = (await (await send("GET", `/api/users/${mover.id}/board`, mate.cookie)).json()) as any[];
    expect(board.map((b) => b.id)).toEqual(["c3"]);
    expect((await send("GET", "/api/photos/c1", mate.cookie)).status).toBe(404); // 파일은 없지만 권한은 통과 (403 아님)
    expect((await send("GET", "/api/photos/c1", loner.cookie)).status).toBe(403);
    expect((await send("GET", `/api/users/${loner.id}/board`, mate.cookie)).status).toBe(403);
    // 예전 화면용 /api/villas/mine 도 그대로
    expect(((await (await send("GET", "/api/villas/mine", mate.cookie)).json()) as any).id).toBe("V");

    // 자정 정산: 예전 규칙과 같은 결과 (방장 14일째 → 3층, 짝꿍 끊김 → 1층 유지, 옮긴 사람은 쉰 지 7일째 → 그대로)
    await DB.prepare("DELETE FROM settings WHERE key = 'last_settled_day'").run();
    expect((await settle(E, TODAY)).settled).toBe(true);
    const after = (await DB.prepare("SELECT id, floor, streak, miss_run AS missRun FROM memberships WHERE id IN ('m1','m2','m4') ORDER BY id").all()).results;
    expect(after).toEqual([
      { id: "m1", floor: 3, streak: 14, missRun: 0 },
      { id: "m2", floor: 1, streak: 0, missRun: 1 },
      { id: "m4", floor: 2, streak: 0, missRun: 7 },
    ]);
    const users = (await DB.prepare("SELECT id, streak, miss_run AS missRun FROM users WHERE id IN (?, ?, ?)").bind(owner.id, mate.id, mover.id).all()).results;
    expect(Object.fromEntries(users.map((u: any) => [u.id, [u.streak, u.missRun]]))).toEqual({
      [owner.id]: [14, 0],
      [mate.id]: [0, 1],
      [mover.id]: [0, 7],
    });
    // 포인트는 건드리지 않는다
    expect((await DB.prepare("SELECT points FROM users WHERE id = ?").bind(owner.id).first<{ points: number }>())!.points).toBe(300);

    // 배포 사이 예전 서버가 빌라를 고르지 않고 넣은 기록은 안전망 트리거가 지금 사는 빌라에 올린다
    await DB.prepare("INSERT INTO certs (id, user_id, day, kind, points, duplicate, created_at) VALUES ('c6', ?, ?, 'photo', 20, 0, ?)").bind(mate.id, TODAY, T0).run();
    expect((await DB.prepare("SELECT villa_id AS v FROM cert_villas WHERE cert_id = 'c6'").all()).results).toEqual([{ v: "V" }]);
  });
});
