import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, scheduled, REMINDER_CRON } from "../index";
import { setNow } from "../clock";
import { logEvents } from "../events/log";
import { b64urlEncode, type Bytes } from "./webpush";
import { decryptPayload, newSubscriptionKeys, newVapidKeys } from "./test-helpers";
import { flushPushes, REMINDER_BODY, REMINDER_MAX_SENDS, setPushFetch } from "./service";

// 키는 테스트마다 새로 만든다 (저장소에 비밀키를 두지 않는다)
let E: Env;
beforeAll(async () => {
  const k = await newVapidKeys();
  E = { ...env, VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey } as Env;
});
type Env = typeof env;
/** 키가 없는 환경 (로컬 .dev.vars 에 키가 있어도 테스트는 없는 것으로) */
const NOKEY = { ...env, VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined } as Env;

// 2026-11-20 오후 2시 (KST) — 조용한 시간이 아님
const DAY_T = Date.parse("2026-11-20T14:00:00+09:00");

let n = 0;
const send = (method: string, path: string, cookie?: string, body?: unknown, e: Env = E) =>
  app.request(
    path,
    {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    e,
  );
async function signup(nickname = "운동러") {
  const username = `pu${Date.now().toString(36)}${n++}`.slice(0, 16);
  const res = await send("POST", "/api/signup", undefined, { username, password: "password1", nickname, over14: true, agree: true });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();
  return { id: row!.id, cookie, nickname, username };
}
type U = Awaited<ReturnType<typeof signup>>;
let h = 0;
async function photo(u: U) {
  const fd = new FormData();
  const bytes = new Uint8Array(500).fill(7);
  bytes.set([0xff, 0xd8, 0xff]);
  fd.set("file", new File([bytes], "a.jpg", { type: "image/jpeg" }));
  fd.set("dhash", h++ % 2 ? "ffffffffffffffff" : "0000000000000000");
  const r = await app.request("/api/certs/photo", { method: "POST", headers: { cookie: u.cookie }, body: fd }, E);
  return ((await r.json()) as { certId: string }).certId;
}
async function villaOf(owner: U, ...members: U[]) {
  const v = (await (await send("POST", "/api/villas", owner.cookie, { name: "아파트" })).json()) as { id: string; inviteToken: string };
  for (const m of members) await send("POST", `/api/invite/${v.inviteToken}/join`, m.cookie, {});
  return v;
}

/** 브라우저 구독 흉내: 서버에 저장하고, 받은 본문을 풀 수 있게 비밀키를 들고 있는다 */
let ep = 0;
async function device(u: U, host = "fcm.googleapis.com") {
  const k = await newSubscriptionKeys();
  const sub = { endpoint: `https://${host}/fcm/send/dev${ep++}`, keys: { p256dh: b64urlEncode(k.publicRaw), auth: b64urlEncode(k.auth) } };
  const r = await send("POST", "/api/push/subscribe", u.cookie, sub);
  expect(r.status).toBe(200);
  return { ...sub, k };
}
type Dev = Awaited<ReturnType<typeof device>>;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let status = 201;
beforeEach(() => {
  calls = [];
  status = 201;
  setPushFetch((async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: typeof status === "number" ? status : 201 });
  }) as unknown as typeof fetch);
  setNow(() => DAY_T);
});
afterEach(() => {
  setPushFetch(null);
  setNow(null);
});

const to = (d: Dev) => calls.filter((c) => c.url === d.endpoint);
async function payloadOf(c: Call, d: Dev) {
  return JSON.parse(await decryptPayload(c.init.body as Bytes, d.k.privateRaw, d.k.publicRaw, d.k.auth)) as { title: string; body: string; url: string; tag: string };
}
const count = async (sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())!.n;

describe("GET /api/push/key", () => {
  it("returns_public_key_or_null_when_missing", async () => {
    expect(await (await send("GET", "/api/push/key")).json()).toEqual({ publicKey: E.VAPID_PUBLIC_KEY });
    expect(await (await send("GET", "/api/push/key", undefined, undefined, NOKEY)).json()).toEqual({ publicKey: null });
    // 모양이 틀린 키도 없는 것으로
    expect(await (await send("GET", "/api/push/key", undefined, undefined, { ...NOKEY, VAPID_PUBLIC_KEY: "abc", VAPID_PRIVATE_KEY: "def" } as Env)).json()).toEqual({ publicKey: null });
  });
});

describe("구독 · 설정 API", () => {
  it("require_login", async () => {
    for (const [m, p] of [["GET", "/api/push/prefs"], ["PUT", "/api/push/prefs"], ["POST", "/api/push/subscribe"], ["POST", "/api/push/unsubscribe"], ["POST", "/api/push/test"]]) {
      expect((await send(m, p, undefined, m === "GET" ? undefined : {})).status).toBe(401);
    }
  });

  it("subscribe_without_keys_says_preparing", async () => {
    const u = await signup();
    const r = await send("POST", "/api/push/subscribe", u.cookie, { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } }, NOKEY);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toBe("알림 준비 중이에요");
  });

  it("subscribe_validates_endpoint_host_and_keys", async () => {
    const u = await signup();
    const k = await newSubscriptionKeys();
    const keys = { p256dh: b64urlEncode(k.publicRaw), auth: b64urlEncode(k.auth) };
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example.com/x", "https://fcm.googleapis.com.evil.com/x", "https://fcm.googleapis.com:8443/x", 5]) {
      expect((await send("POST", "/api/push/subscribe", u.cookie, { endpoint, keys })).status).toBe(400);
    }
    expect((await send("POST", "/api/push/subscribe", u.cookie, { endpoint: "https://web.push.apple.com/x", keys: { ...keys, auth: "AAAA" } })).status).toBe(400);
    expect((await send("POST", "/api/push/subscribe", u.cookie, { endpoint: "https://web.push.apple.com/x", keys: { ...keys, p256dh: keys.auth } })).status).toBe(400);
    // 아이폰 · 파이어폭스 · 엣지 주소는 된다
    for (const host of ["web.push.apple.com", "updates.push.services.mozilla.com", "wns2-par02p.notify.windows.com"]) await device(u, host);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", u.id)).toBe(3);
  });

  it("same_device_moves_to_new_account_and_unsubscribe_only_mine", async () => {
    const a = await signup();
    const b = await signup();
    const d = await device(a);
    expect((await send("POST", "/api/push/subscribe", b.cookie, { endpoint: d.endpoint, keys: d.keys })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", d.endpoint, b.id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", a.id)).toBe(0);
    // a 가 지우려 해도 b 의 기기는 남는다
    await send("POST", "/api/push/unsubscribe", a.cookie, { endpoint: d.endpoint });
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", d.endpoint)).toBe(1);
    await send("POST", "/api/push/unsubscribe", b.cookie, { endpoint: d.endpoint });
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", d.endpoint)).toBe(0);
  });

  it("keeps_only_latest_five_devices", async () => {
    const u = await signup();
    let t = DAY_T;
    setNow(() => t);
    const devs: Dev[] = [];
    for (let i = 0; i < 6; i++) {
      t += 1000;
      devs.push(await device(u));
    }
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", u.id)).toBe(5);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", devs[0].endpoint)).toBe(0);
  });

  it("prefs_default_on_and_partial_update", async () => {
    const u = await signup();
    expect(await (await send("GET", "/api/push/prefs", u.cookie)).json()).toEqual({ prefs: { cheer: true, villa: true, apply: true, reminder: true }, devices: 0 });
    expect((await send("PUT", "/api/push/prefs", u.cookie, { reminder: "no" })).status).toBe(400);
    expect((await send("PUT", "/api/push/prefs", u.cookie, { other: true })).status).toBe(400);
    expect((await send("PUT", "/api/push/prefs", u.cookie, {})).status).toBe(400);
    expect((await send("PUT", "/api/push/prefs", u.cookie, { reminder: false })).status).toBe(200);
    expect((await send("PUT", "/api/push/prefs", u.cookie, { villa: false })).status).toBe(200);
    await device(u);
    expect(await (await send("GET", "/api/push/prefs", u.cookie)).json()).toEqual({ prefs: { cheer: true, villa: false, apply: true, reminder: false }, devices: 1 });
  });
});

describe("앱 알림 → 휴대폰 푸시", () => {
  async function setup() {
    const author = await signup("작가");
    const friend = await signup("이웃");
    await villaOf(author, friend);
    const certId = await photo(author);
    await flushPushes();
    const d = await device(author);
    calls = [];
    return { author, friend, certId, d };
  }

  it("cheer_sends_encrypted_push_with_copy_url_and_tag", async () => {
    const { author, friend, certId, d } = await setup();
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    const p = await payloadOf(to(d)[0], d);
    expect(p).toEqual({ title: "오운완아파트", body: "이웃 님이 응원했어요", url: `/room/${author.id}/board`, tag: "ownwan-cheer" });
    const hd = to(d)[0].init.headers as Record<string, string>;
    expect(hd.topic).toBe("ownwan-cheer");
    expect(hd.authorization).toContain(`k=${E.VAPID_PUBLIC_KEY}`);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ? AND last_ok_at = ?", d.endpoint, DAY_T)).toBe(1);
  });

  it("repeated_fixed_key_event_does_not_push_again", async () => {
    const { certId, friend, d } = await setup();
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie); // 끄기
    setNow(() => DAY_T + 11 * 60_000);
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie); // 다시 켜도 같은 키라 알림 없음
    await flushPushes();
    expect(to(d)).toHaveLength(1);
  });

  it("respects_category_pref", async () => {
    const { author, certId, friend, d } = await setup();
    await send("PUT", "/api/push/prefs", author.cookie, { cheer: false });
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "멋져요" });
    await flushPushes();
    expect(to(d)).toHaveLength(0);
  });

  it("quiet_hours_skip_push_but_keep_in_app_event", async () => {
    const { author, certId, friend, d } = await setup();
    setNow(() => Date.parse("2026-11-20T23:30:00+09:00"));
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    setNow(() => Date.parse("2026-11-21T07:59:00+09:00"));
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "새벽 댓글" });
    await flushPushes();
    expect(to(d)).toHaveLength(0);
    const evs = (await (await send("GET", "/api/events", author.cookie)).json()) as { type: string }[];
    expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["cheered", "commented"]));
    // 8시가 되면 다시 보낸다
    setNow(() => Date.parse("2026-11-21T08:00:00+09:00"));
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "아침 댓글" });
    await flushPushes();
    expect(to(d)).toHaveLength(1);
  });

  it("rate_limits_one_per_category_per_ten_minutes", async () => {
    const { certId, friend, d } = await setup();
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await flushPushes();
    setNow(() => DAY_T + 5 * 60_000);
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "첫 댓글" });
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    setNow(() => DAY_T + 10 * 60_000 + 1);
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "두 번째 댓글" });
    await flushPushes();
    expect(to(d)).toHaveLength(2);
    // 잠금 화면에는 댓글 내용 없이
    expect((await payloadOf(to(d)[1], d)).body).toBe("새 댓글이 달렸어요");
  });

  it("other_category_is_not_rate_limited_by_cheer", async () => {
    const { author, certId, friend, d } = await setup();
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await logEvents(E, [{ userId: author.id, type: "friend_joined", payload: { nickname: "새 이웃" } }]);
    await flushPushes();
    expect(to(d)).toHaveLength(2);
    expect((await payloadOf(to(d)[1], d)).tag).toBe("ownwan-villa");
  });

  it("collapses_batch_to_latest_per_user_and_category", async () => {
    const { author, d } = await setup();
    await logEvents(E, [
      { userId: author.id, type: "cheered", payload: { nickname: "가" } },
      { userId: author.id, type: "cheered", payload: { nickname: "나" } },
      { userId: author.id, type: "certified", payload: { points: 10 } }, // 푸시 안 보내는 종류
    ]);
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    expect((await payloadOf(to(d)[0], d)).body).toBe("나 님이 응원했어요");
  });

  it("gone_subscription_is_removed_on_404_or_410", async () => {
    const { author, certId, friend, d } = await setup();
    const d2 = await device(author);
    status = 410;
    await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    expect(to(d2)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", author.id)).toBe(0);
  });

  it("push_failure_never_breaks_the_request", async () => {
    const { certId, friend, d } = await setup();
    setPushFetch((async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch);
    const r = await send("POST", `/api/certs/${certId}/cheer`, friend.cookie);
    expect(r.status).toBe(200);
    await flushPushes();
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", d.endpoint)).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("missing_keys_send_nothing", async () => {
    const { author, d } = await setup();
    await logEvents(NOKEY, [{ userId: author.id, type: "cheered", payload: { nickname: "가" } }]);
    await flushPushes();
    expect(to(d)).toHaveLength(0);
  });

  it("recruit_welcome_and_battle_challenge_map_to_apply", async () => {
    const { author, d } = await setup();
    await logEvents(E, [
      { userId: author.id, type: "welcome", payload: { villaName: "초록아파트", villaId: "v1" } }, // 초대 링크 입주: 안 보냄
      { userId: author.id, type: "battle_challenged", payload: { fromName: "파랑아파트", villaId: "v9" } },
    ]);
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    const p = await payloadOf(to(d)[0], d);
    expect(p.tag).toBe("ownwan-apply");
    expect(p.url).toBe("/battle/v9");
    expect(p.body).toContain("파랑아파트에서 집값 대결을 신청했어요");
  });
});

describe("저녁 9시 운동 알림", () => {
  const NINE_PM = Date.parse("2026-11-20T21:00:00+09:00");

  it("only_uncertified_users_with_reminder_on_once_a_day", async () => {
    const lazy = await signup("쉬는중");
    const done = await signup("했어요");
    const off = await signup("알림끔");
    const noDevice = await signup("기기없음");
    await photo(done);
    await flushPushes();
    const dl = await device(lazy);
    const dd = await device(done);
    const doff = await device(off);
    await send("PUT", "/api/push/prefs", off.cookie, { reminder: false });
    void noDevice;
    calls = [];
    setNow(() => NINE_PM);
    await scheduled({ cron: REMINDER_CRON }, E);
    expect(to(dl)).toHaveLength(1);
    expect(to(dd)).toHaveLength(0);
    expect(to(doff)).toHaveLength(0);
    const p = await payloadOf(to(dl)[0], dl);
    expect(p).toEqual({ title: "오운완아파트", body: REMINDER_BODY, url: "/certify", tag: "ownwan-reminder" });
    expect((to(dl)[0].init.headers as Record<string, string>).urgency).toBe("high");
    // 같은 날 다시 돌아도 한 번만
    setNow(() => NINE_PM + 30 * 60_000);
    await scheduled({ cron: REMINDER_CRON }, E);
    expect(to(dl)).toHaveLength(1);
    // 다음 날은 다시
    setNow(() => NINE_PM + 24 * 3600_000);
    await scheduled({ cron: REMINDER_CRON }, E);
    expect(to(dl)).toHaveLength(2);
  });

  it("reminder_without_keys_is_noop", async () => {
    const u = await signup();
    const d = await device(u);
    setNow(() => NINE_PM);
    await scheduled({ cron: REMINDER_CRON }, NOKEY);
    expect(to(d)).toHaveLength(0);
  });

  it("midnight_cron_prunes_old_push_log", async () => {
    const u = await signup();
    await env.DB.prepare("INSERT INTO push_log (user_id, category, sent_at) VALUES (?, 'cheer', ?), (?, 'cheer', ?)")
      .bind(u.id, DAY_T - 3 * 24 * 3600_000, u.id, DAY_T - 3600_000)
      .run();
    setNow(() => Date.parse("2026-11-21T00:00:30+09:00"));
    await scheduled({ cron: "0 15 * * *" }, E);
    expect(await count("SELECT COUNT(*) AS n FROM push_log WHERE user_id = ?", u.id)).toBe(1);
  });
});

describe("시험 알림 · 로그아웃 · 탈퇴", () => {
  it("test_push_goes_to_my_devices_once_a_minute", async () => {
    const u = await signup();
    expect((await send("POST", "/api/push/test", u.cookie)).status).toBe(409);
    const d = await device(u);
    expect((await send("POST", "/api/push/test", u.cookie)).status).toBe(200);
    expect((await payloadOf(to(d)[0], d)).body).toContain("알림이 잘 와요");
    expect((await send("POST", "/api/push/test", u.cookie)).status).toBe(429);
    expect((await send("POST", "/api/push/test", u.cookie, undefined, NOKEY)).status).toBe(503);
  });

  it("logout_removes_this_device_only", async () => {
    const u = await signup();
    const d1 = await device(u);
    const d2 = await device(u);
    await send("POST", "/api/logout", u.cookie, { pushEndpoint: d1.endpoint });
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", d1.endpoint)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", d2.endpoint)).toBe(1);
    // 본문 없는 로그아웃도 그대로 된다
    expect((await send("POST", "/api/logout")).status).toBe(200);
  });

  it("account_deletion_removes_push_rows", async () => {
    const u = await signup();
    await device(u);
    await send("PUT", "/api/push/prefs", u.cookie, { cheer: false });
    await send("POST", "/api/push/test", u.cookie);
    expect((await send("DELETE", "/api/me", u.cookie)).status).toBe(200);
    for (const t of ["push_subscriptions", "push_prefs", "push_log"]) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, u.id)).toBe(0);
    }
  });
});

describe("리뷰 반영: CPU · 기록 · 기기 수", () => {
  async function setup() {
    const author = await signup("작가");
    const friend = await signup("이웃");
    await villaOf(author, friend);
    const certId = await photo(author);
    await flushPushes();
    calls = [];
    return { author, friend, certId };
  }

  it("comment_push_hides_comment_text_on_lock_screen", async () => {
    const { author, friend, certId } = await setup();
    const d = await device(author);
    await send("POST", `/api/certs/${certId}/comments`, friend.cookie, { body: "비밀 이야기" });
    await flushPushes();
    const p = await payloadOf(to(d)[0], d);
    expect(p.body).toBe("새 댓글이 달렸어요");
    expect(JSON.stringify(p)).not.toContain("비밀");
  });

  it("sends_to_at_most_two_most_recently_ok_devices", async () => {
    const { author } = await setup();
    const a = await device(author);
    const b = await device(author);
    const c = await device(author);
    await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").bind(DAY_T - 1000, a.endpoint).run();
    await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").bind(DAY_T - 5000, c.endpoint).run();
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "가" } }]);
    await flushPushes();
    expect(to(a)).toHaveLength(1);
    expect(to(c)).toHaveLength(1);
    expect(to(b)).toHaveLength(0); // 한 번도 잘 받은 적 없는 기기는 뒤로
  });

  it("push_fetch_uses_manual_redirect_and_timeout_signal", async () => {
    const { author } = await setup();
    const d = await device(author);
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "가" } }]);
    await flushPushes();
    expect(to(d)[0].init.redirect).toBe("manual");
    expect(to(d)[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("total_failure_leaves_no_rate_limit_row_so_next_event_still_pushes", async () => {
    const { author } = await setup();
    const d = await device(author);
    status = 500;
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "가" } }]);
    await flushPushes();
    expect(to(d)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM push_log WHERE user_id = ?", author.id)).toBe(0);
    status = 201;
    setNow(() => DAY_T + 60_000);
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "나" } }]);
    await flushPushes();
    expect(to(d)).toHaveLength(2);
    expect(await count("SELECT COUNT(*) AS n FROM push_log WHERE user_id = ? AND category = 'cheer'", author.id)).toBe(1);
  });

  it("vapid_jwt_is_reused_per_origin_for_up_to_11_hours", async () => {
    const { author } = await setup();
    const d = await device(author);
    const jwtOf = (c: Call) => (c.init.headers as Record<string, string>).authorization.split(" ")[1];
    // 오전 10시에 시작해 11시간 뒤(밤 9시)도 조용한 시간이 아니게
    const T = DAY_T - 4 * 3600_000;
    setNow(() => T);
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "가" } }]);
    await flushPushes();
    setNow(() => T + 3600_000);
    await logEvents(E, [{ userId: author.id, type: "cheered", payload: { nickname: "나" } }]);
    await flushPushes();
    setNow(() => T + 11 * 3600_000 + 1000);
    await logEvents(E, [{ userId: author.id, type: "friend_joined", payload: { nickname: "다" } }]);
    await flushPushes();
    const c = to(d);
    expect(c).toHaveLength(3);
    // ECDSA 서명은 매번 달라지므로 같은 문자열이면 다시 쓴 것
    expect(jwtOf(c[1])).toBe(jwtOf(c[0]));
    expect(jwtOf(c[2])).not.toBe(jwtOf(c[0]));
  });

  it("reminder_cap_rotates_skipped_users_first_next_day", async () => {
    await env.DB.prepare("DELETE FROM push_subscriptions").run();
    const NINE_PM = Date.parse("2026-11-22T21:00:00+09:00");
    const devs: { u: U; d: Dev }[] = [];
    for (let i = 0; i < REMINDER_MAX_SENDS + 2; i++) {
      const u = await signup(`회원${i}`);
      devs.push({ u, d: await device(u) });
    }
    calls = [];
    setNow(() => NINE_PM);
    await scheduled({ cron: REMINDER_CRON }, E);
    expect(calls).toHaveLength(REMINDER_MAX_SENDS);
    const skipped = devs.filter((x) => to(x.d).length === 0);
    expect(skipped).toHaveLength(2);
    calls = [];
    setNow(() => NINE_PM + 24 * 3600_000);
    await scheduled({ cron: REMINDER_CRON }, E);
    expect(calls).toHaveLength(REMINDER_MAX_SENDS);
    for (const x of skipped) expect(to(x.d)).toHaveLength(1);
  });
});
