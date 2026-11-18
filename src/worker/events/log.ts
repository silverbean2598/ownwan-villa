import type { Env } from "../env";
import { now } from "../clock";

export type EventType =
  | "certified"
  | "streak6"
  | "streak7"
  | "floor_up"
  | "penthouse_in"
  | "penthouse_out"
  | "floor_down"
  | "welcome"
  | "friend_joined"
  | "bought";

/**
 * key: 한 번만 생겨야 하는 일은 고정 키(예: "certified:{user}:{day}")를 준다. 같은 키는 INSERT OR IGNORE 로 무시돼
 * 동시에 올린 사진 · 지웠다 다시 올린 사진 · 다시 연 초대 링크에도 한 번만 남는다. 없으면 매번 새 id.
 */
export type NewEvent = { userId: string; type: EventType; payload?: Record<string, unknown>; key?: string };

/**
 * 알림 이벤트를 쓴다. 본 동작(인증 · 입주 · 구매 · 정산)이 이미 끝난 뒤 따로 쓰고, 실패해도 던지지 않는다:
 * 알림 하나 못 남기는 것보다 본 동작이 실패하는 쪽이 훨씬 나쁘다.
 */
export async function logEvents(env: Env, events: NewEvent[]): Promise<void> {
  if (!events.length) return;
  const t = now();
  try {
    await env.DB.batch(
      events.map((e) =>
        env.DB.prepare("INSERT OR IGNORE INTO events (id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(
          e.key ?? crypto.randomUUID(),
          e.userId,
          e.type,
          JSON.stringify(e.payload ?? {}),
          t,
        ),
      ),
    );
  } catch (err) {
    console.error(`event log failed (${events.map((e) => e.type).join(",")})`, err);
  }
}
