import { waitUntil } from "cloudflare:workers";
import type { Env } from "../env";
import type { EventType, NewEvent } from "../events/log";
import { now } from "../clock";
import { kstDay } from "../../shared/rules/day";
import { CERTIFIED_PHOTO } from "../cert/certified";
import { eventCopy } from "../../web/events/plan";
import { buildPushRequest, validVapid, type PushTarget, type VapidKeys } from "./webpush";

/**
 * 휴대폰 푸시 알림 [확정 — 기획자 결정, 2026-11-20]
 * 앱 안 알림(events)이 새로 생기면 받는 사람의 기기에도 보낸다. 본 동작이 끝난 뒤 waitUntil 로 따로 돌고, 실패해도 던지지 않는다.
 */

export type PushCategory = "cheer" | "villa" | "apply" | "reminder";
export const CATEGORIES: PushCategory[] = ["cheer", "villa", "apply", "reminder"];
export type PushPrefs = Record<PushCategory, boolean>;
export const DEFAULT_PREFS: PushPrefs = { cheer: true, villa: true, apply: true, reminder: true };

/** VAPID 연락처: 푸시 서비스가 문제 있을 때 연락할 곳 (URL 형식도 허용된다) [제안] */
export const DEFAULT_SUBJECT = "https://ownwan-villa.silverbin2598.workers.dev";

/** 앱 알림 종류 → 푸시 종류. 여기 없는 종류(인증 · 구매 · 층 내려감 · 내보내짐 등)는 푸시로 보내지 않는다 [제안] */
const EVENT_CATEGORY: Partial<Record<EventType, PushCategory>> = {
  cheered: "cheer",
  commented: "cheer",
  friend_joined: "villa",
  floor_up: "villa",
  streak7: "villa",
  penthouse_in: "villa",
  penthouse_out: "villa",
  owner_in: "villa",
  apartment_promoted: "villa",
  application_received: "apply",
  application_rejected: "apply",
  battle_challenged: "apply",
  battle_result: "apply",
  league_rank: "apply",
};

export function categoryOf(e: Pick<NewEvent, "type" | "payload">): PushCategory | null {
  // 입주 신청이 승인돼 들어온 경우만 (초대 링크로 직접 들어온 건 본인이 한 일이라 보내지 않는다)
  if (e.type === "welcome") return e.payload?.via === "recruit" ? "apply" : null;
  return EVENT_CATEGORY[e.type] ?? null;
}

/** 알림을 누르면 열 화면 */
export function urlOf(e: Pick<NewEvent, "type" | "payload" | "userId">): string {
  const p = e.payload ?? {};
  const villaId = typeof p.villaId === "string" ? p.villaId : "";
  if (e.type === "battle_challenged" || e.type === "battle_result") return villaId ? `/battle/${villaId}` : "/villa";
  if (e.type === "league_rank") return "/ranking";
  if (e.type === "cheered" || e.type === "commented") return `/room/${e.userId}/board`;
  return villaId ? `/villa/${villaId}` : "/villa";
}

export const TITLE = "오운완빌라";
export const REMINDER_BODY = "오늘 운동 인증 아직이에요! 자정 전까지 올리면 불이 켜져요";
/** 같은 사람 · 같은 종류는 10분에 한 번만 [확정] */
export const RATE_MS = 10 * 60_000;
/** 조용한 시간(KST 23시 ~ 다음 날 8시)에는 앱 알림만 남기고 푸시는 보내지 않는다 [확정] */
export const QUIET_START = 23;
export const QUIET_END = 8;
/** 한 번 실행에서 보내는 푸시 수 상한 (Workers 무료 요금제의 하위 요청 50개 한도 안에서) [제안] */
export const MAX_SENDS = 40;
/** 한 사람이 알림을 켤 수 있는 기기 수 [제안] */
export const MAX_DEVICES = 5;

export function kstHour(ms: number): number {
  return new Date(ms + 9 * 3600_000).getUTCHours();
}
export const isQuiet = (ms: number) => {
  const h = kstHour(ms);
  return h >= QUIET_START || h < QUIET_END;
};

export function vapidOf(env: Env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!validVapid(publicKey, privateKey)) return null;
  return { publicKey: publicKey!, privateKey: privateKey!, subject: env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT };
}

// ── 테스트용 자리: 푸시 서비스로 나가는 fetch, 기다리는 중인 발송 ──
let fetchOverride: typeof fetch | null = null;
export function setPushFetch(fn: typeof fetch | null): void {
  fetchOverride = fn;
}
const pending = new Set<Promise<void>>();
/** 지금 돌고 있는 발송이 모두 끝날 때까지 (테스트용) */
export async function flushPushes(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}

/** 본 동작과 따로 돌린다: 요청이 끝난 뒤에도 waitUntil 로 마저 보내고, 실패는 로그만 남긴다 */
function background(label: string, work: () => Promise<unknown>): void {
  const p: Promise<void> = work()
    .then(() => {}, (err) => console.error(`push ${label} failed`, err))
    .finally(() => pending.delete(p));
  pending.add(p);
  try {
    waitUntil(p);
  } catch {
    // 요청 밖(테스트 등)에서는 waitUntil 이 없을 수 있다. 그래도 promise 는 그대로 돈다
  }
}

/**
 * 새로 쌓인 앱 알림 중 푸시로 보낼 것을 골라 따로 보낸다 (logEvents 가 부른다).
 * 키가 없거나 보낼 종류가 없으면 아무것도 하지 않는다 (D1 조회도 없음)
 */
export function queueEventPushes(env: Env, events: NewEvent[]): void {
  if (!events.length || !vapidOf(env)) return;
  const pushable = events.filter((e) => categoryOf(e));
  if (!pushable.length) return;
  const t = now();
  // 조용한 시간에는 보내지 않는다 (앱 안 카드 · 토스트는 그대로 남는다)
  if (isQuiet(t)) return;
  background("events", () => dispatchEventPushes(env, pushable, t));
}

/** 아파트 승격 축하 카드(SQL 로 한 batch 에 쓴 것)를 다시 읽어 푸시로도 보낸다 */
export async function queueApartmentPushes(env: Env, villaId: string): Promise<void> {
  if (!vapidOf(env)) return;
  const { results } = await env.DB.prepare("SELECT user_id AS userId, payload FROM events WHERE id LIKE ? ESCAPE '\\'")
    .bind(`apartment:${villaId.replace(/[\\%_]/g, (c) => `\\${c}`)}:%`)
    .all<{ userId: string; payload: string }>();
  const evs: NewEvent[] = [];
  for (const r of results) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(r.payload);
    } catch {
      // 내용을 못 읽으면 기본 문구로
    }
    evs.push({ userId: r.userId, type: "apartment_promoted", payload });
  }
  queueEventPushes(env, evs);
}

/** 보낼 메시지 하나. category 는 보낸 기록 · 기기 알림 묶음(tag)에 쓴다 ("test" = 설정의 시험 알림) */
export type Msg = { userId: string; category: PushCategory | "test"; body: string; url: string };

/** 사람 · 종류마다 마지막 알림 하나로 묶고, 끈 종류 · 10분 안에 보낸 종류는 뺀 뒤 보낸다 */
export async function dispatchEventPushes(env: Env, events: NewEvent[], t: number): Promise<void> {
  const latest = new Map<string, Msg & { category: PushCategory }>();
  for (const e of events) {
    const category = categoryOf(e);
    if (!category) continue;
    const body = eventCopy({ id: "", type: e.type, payload: e.payload ?? {}, createdAt: t });
    if (!body) continue;
    latest.set(`${e.userId}:${category}`, { userId: e.userId, category, body, url: urlOf(e) });
  }
  if (!latest.size) return;
  const users = [...new Set([...latest.values()].map((m) => m.userId))];
  const prefs = await prefsOf(env, users);
  const recent = new Set<string>();
  for (const part of chunks(users, 90)) {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT user_id AS userId, category FROM push_log WHERE sent_at > ? AND user_id IN (${part.map(() => "?").join(",")})`,
    )
      .bind(t - RATE_MS, ...part)
      .all<{ userId: string; category: string }>();
    for (const r of results) recent.add(`${r.userId}:${r.category}`);
  }
  const msgs = [...latest.entries()].filter(([k, m]) => prefs.get(m.userId)?.[m.category] !== false && !recent.has(k)).map(([, m]) => m);
  await sendMessages(env, msgs, t);
}

/** 사람마다 알림 설정 (행이 없으면 모두 켜짐) */
export async function prefsOf(env: Env, users: string[]): Promise<Map<string, PushPrefs>> {
  const out = new Map<string, PushPrefs>();
  for (const part of chunks(users, 90)) {
    const { results } = await env.DB.prepare(
      `SELECT user_id AS userId, cheer, villa, apply, reminder FROM push_prefs WHERE user_id IN (${part.map(() => "?").join(",")})`,
    )
      .bind(...part)
      .all<{ userId: string } & Record<PushCategory, number>>();
    for (const r of results) out.set(r.userId, { cheer: !!r.cheer, villa: !!r.villa, apply: !!r.apply, reminder: !!r.reminder });
  }
  return out;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

type SubRow = PushTarget & { id: string; userId: string };

/**
 * 메시지를 그 사람의 기기 모두에 보낸다. 보내기 전에 보낸 기록(push_log)을 먼저 남겨 동시에 돌아도 겹쳐 보내지 않게 하고,
 * 404/410(구독이 사라짐)이면 그 기기 행을 지운다. 성공하면 last_ok_at 을 채운다
 */
export async function sendMessages(env: Env, msgs: Msg[], t: number): Promise<{ sent: number; removed: number }> {
  const keys = vapidOf(env);
  if (!keys || !msgs.length) return { sent: 0, removed: 0 };
  const users = [...new Set(msgs.map((m) => m.userId))];
  const subs = new Map<string, SubRow[]>();
  for (const part of chunks(users, 90)) {
    const { results } = await env.DB.prepare(
      `SELECT id, user_id AS userId, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${part.map(() => "?").join(",")})`,
    )
      .bind(...part)
      .all<SubRow>();
    for (const r of results) subs.set(r.userId, [...(subs.get(r.userId) ?? []), r]);
  }
  const jobs: { msg: Msg; sub: SubRow }[] = [];
  for (const msg of msgs) for (const sub of subs.get(msg.userId) ?? []) jobs.push({ msg, sub });
  if (!jobs.length) return { sent: 0, removed: 0 };
  if (jobs.length > MAX_SENDS) console.warn(`push: ${jobs.length} sends, capped at ${MAX_SENDS}`);
  const run = jobs.slice(0, MAX_SENDS);
  const logged = [...new Map(run.map((j) => [`${j.msg.userId}:${j.msg.category}`, j.msg])).values()];
  await env.DB.batch(logged.map((m) => env.DB.prepare("INSERT INTO push_log (user_id, category, sent_at) VALUES (?, ?, ?)").bind(m.userId, m.category, t)));

  const doFetch = fetchOverride ?? fetch;
  const ok: string[] = [];
  const gone: string[] = [];
  await Promise.all(
    run.map(async ({ msg, sub }) => {
      try {
        const payload = JSON.stringify({ title: TITLE, body: msg.body, url: msg.url, tag: `ownwan-${msg.category}` });
        const { url, init } = await buildPushRequest(sub, payload, keys, Math.floor(t / 1000), {
          topic: `ownwan-${msg.category}`,
          ttl: msg.category === "reminder" ? 3 * 3600 : 12 * 3600,
          urgency: msg.category === "reminder" ? "high" : "normal",
        });
        const res = await doFetch(url, init);
        if (res.status === 404 || res.status === 410) gone.push(sub.id);
        else if (res.ok) ok.push(sub.id);
        else console.warn(`push send ${res.status} (${new URL(sub.endpoint).host})`);
      } catch (err) {
        console.warn(`push send error (${msg.category})`, err);
      }
    }),
  );
  const stmts = [
    ...gone.map((id) => env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id)),
    ...ok.map((id) => env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?").bind(t, id)),
  ];
  if (stmts.length) await env.DB.batch(stmts);
  return { sent: ok.length, removed: gone.length };
}

/** KST 날짜가 시작되는 시각(00:00 KST)의 UTC ms */
function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00+09:00`);
}

/**
 * 저녁 9시(KST) 운동 알림 [확정]: 알림을 켠 기기가 있고 · 운동 알림을 끄지 않았고 · 오늘 사진 인증을 아직 안 했고 ·
 * 오늘 이미 받지 않은 사람에게 한 번. 크론(12:00 UTC)이 부른다
 */
export async function sendReminders(env: Env, t: number): Promise<{ sent: number; users: number }> {
  if (!vapidOf(env)) return { sent: 0, users: 0 };
  const day = kstDay(t);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.user_id AS userId FROM push_subscriptions s
     LEFT JOIN push_prefs p ON p.user_id = s.user_id
     WHERE COALESCE(p.reminder, 1) = 1
       AND NOT EXISTS (SELECT 1 FROM certs c WHERE c.user_id = s.user_id AND c.day = ?1 AND ${CERTIFIED_PHOTO})
       AND NOT EXISTS (SELECT 1 FROM push_log l WHERE l.user_id = s.user_id AND l.category = 'reminder' AND l.sent_at >= ?2)`,
  )
    .bind(day, dayStartMs(day))
    .all<{ userId: string }>();
  const msgs: Msg[] = results.map((r) => ({ userId: r.userId, category: "reminder", body: REMINDER_BODY, url: "/certify" }));
  const { sent } = await sendMessages(env, msgs, t);
  return { sent, users: msgs.length };
}

/** 보낸 기록 정리: 2일 지난 줄 (매일 밤 크론) */
export async function prunePushLog(env: Env, t: number): Promise<void> {
  await env.DB.prepare("DELETE FROM push_log WHERE sent_at < ?").bind(t - 2 * 24 * 3600_000).run();
}
