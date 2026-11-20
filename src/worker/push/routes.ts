import { Hono } from "hono";
import type { AppEnv } from "../env";
import { now } from "../clock";
import { jsonError, requireUser } from "../http";
import { b64urlDecode, isP256Point } from "./webpush";
import { CATEGORIES, DEFAULT_PREFS, MAX_DEVICES, prefsOf, sendMessages, vapidOf, type PushCategory } from "./service";

export const push = new Hono<AppEnv>();

/**
 * 푸시 서비스 주소로 받는 곳 [제안]: 브라우저가 주는 endpoint 만 저장하고 서버가 그곳으로 요청을 보내므로,
 * 알려진 푸시 서비스(크롬 · 안드로이드 FCM, 사파리 · 아이폰, 파이어폭스, 엣지)만 받는다
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

export function allowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
    return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function validKeys(p256dh: unknown, auth: unknown): boolean {
  try {
    return typeof p256dh === "string" && typeof auth === "string" && p256dh.length <= 200 && auth.length <= 100
      && isP256Point(b64urlDecode(p256dh)) && b64urlDecode(auth).length === 16;
  } catch {
    return false;
  }
}

/** 브라우저가 구독할 때 쓰는 VAPID 공개키. 서버에 키가 없으면 null → 화면은 "알림 준비 중이에요" */
push.get("/api/push/key", (c) => c.json({ publicKey: vapidOf(c.env)?.publicKey ?? null }));

/** 내 알림 설정과 알림을 켠 기기 수 */
push.get("/api/push/prefs", requireUser, async (c) => {
  const userId = c.get("userId");
  const prefs = (await prefsOf(c.env, [userId])).get(userId) ?? DEFAULT_PREFS;
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").bind(userId).first<{ n: number }>();
  return c.json({ prefs, devices: row?.n ?? 0 });
});

/** 알림 종류별 켜고 끄기. 보낸 값만 바꾼다 */
push.put("/api/push/prefs", requireUser, async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object") return jsonError(c, 400, "요청이 올바르지 않아요");
  const keys = Object.keys(b);
  if (!keys.length || !keys.every((k) => (CATEGORIES as string[]).includes(k) && typeof b[k] === "boolean")) {
    return jsonError(c, 400, "요청이 올바르지 않아요");
  }
  const cur = (await prefsOf(c.env, [userId])).get(userId) ?? DEFAULT_PREFS;
  const next = { ...cur };
  for (const k of keys as PushCategory[]) next[k] = b[k];
  await c.env.DB.prepare(
    `INSERT INTO push_prefs (user_id, cheer, villa, apply, reminder, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(user_id) DO UPDATE SET cheer = ?2, villa = ?3, apply = ?4, reminder = ?5, updated_at = ?6`,
  )
    .bind(userId, +next.cheer, +next.villa, +next.apply, +next.reminder, now())
    .run();
  return c.json({ prefs: next });
});

/**
 * 이 기기 알림 켜기: 브라우저 구독(PushSubscription.toJSON())을 저장한다.
 * 같은 기기(endpoint)를 다른 계정이 쓰고 있었으면 지금 계정으로 옮긴다. 기기는 한 사람당 최근 5대까지
 */
push.post("/api/push/subscribe", requireUser, async (c) => {
  const userId = c.get("userId");
  if (!vapidOf(c.env)) return jsonError(c, 503, "알림 준비 중이에요");
  const b = await c.req.json().catch(() => null);
  const endpoint = b?.endpoint;
  const p256dh = b?.keys?.p256dh;
  const auth = b?.keys?.auth;
  if (!allowedEndpoint(endpoint) || !validKeys(p256dh, auth)) return jsonError(c, 400, "이 기기의 알림 정보를 확인하지 못했어요");
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         created_at = CASE WHEN push_subscriptions.user_id = excluded.user_id THEN push_subscriptions.created_at ELSE excluded.created_at END`,
    ).bind(crypto.randomUUID(), userId, endpoint, p256dh, auth, t),
    // 오래된 기기부터 정리 (최근 5대만)
    c.env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE user_id = ?1 AND id NOT IN
         (SELECT id FROM push_subscriptions WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?2)`,
    ).bind(userId, MAX_DEVICES),
  ]);
  return c.json({ ok: true });
});

/** 이 기기 알림 끄기 (로그아웃할 때도 부른다). 내 기기만 지운다 */
push.post("/api/push/unsubscribe", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  const endpoint = b?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 1000) return jsonError(c, 400, "요청이 올바르지 않아요");
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(c.get("userId"), endpoint).run();
  return c.json({ ok: true });
});

/** 시험 알림: 알림을 켠 내 기기 모두에 바로 하나 보낸다 (1분에 한 번) */
push.post("/api/push/test", requireUser, async (c) => {
  const userId = c.get("userId");
  if (!vapidOf(c.env)) return jsonError(c, 503, "알림 준비 중이에요");
  const t = now();
  const recent = await c.env.DB.prepare("SELECT 1 AS x FROM push_log WHERE user_id = ? AND category = 'test' AND sent_at > ?")
    .bind(userId, t - 60_000)
    .first();
  if (recent) return jsonError(c, 429, "시험 알림은 1분에 한 번 보낼 수 있어요");
  const r = await sendMessages(c.env, [{ userId, category: "test", body: "알림이 잘 와요! 이웃 소식을 여기로 알려 드릴게요", url: "/settings" }], t);
  if (!r.sent) return jsonError(c, 409, "알림을 보낼 기기가 없어요. 이 기기에서 알림을 다시 켜 주세요");
  return c.json({ sent: r.sent });
});
