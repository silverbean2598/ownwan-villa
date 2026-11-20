import type { Env } from "../env";
import { now } from "../clock";
import { queueEventPushes } from "../push/service";

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
  | "bought"
  | "kicked"
  | "owner_in"
  | "owner_changed"
  | "dissolved"
  | "cheered"
  | "commented"
  // 빈방 모집 · 입주 신청: 방장에게 신청 옴(토스트), 신청한 사람에게 거절(카드) · 신청이 끝남(모집 끔 · 꽉 참 · 해체 · 만료, 토스트)
  | "application_received"
  | "application_rejected"
  | "application_closed"
  // 집값 대결: 리그 1~3위(카드), 대결 신청 받음(카드, 상대 방장), 시작 · 거절 · 만료 · 취소(토스트), 결과(카드)
  | "league_rank"
  | "battle_challenged"
  | "battle_started"
  | "battle_declined"
  | "battle_expired"
  | "battle_cancelled"
  | "battle_result"
  // 아파트 승격: 그때 사는 입주민 모두에게 축하 카드 (고정 키 apartment:{빌라}:{사람}, 승격 문장과 같은 batch 에서 쓴다)
  | "apartment_promoted";

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
  let res: D1Result[];
  try {
    res = await env.DB.batch(
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
    return;
  }
  // 새로 쓴 알림만(고정 키로 무시된 것은 빼고) 휴대폰 푸시로도 보낸다. 따로 돌고 실패해도 던지지 않는다
  try {
    queueEventPushes(env, events.filter((_, i) => (res[i]?.meta.changes ?? 0) > 0));
  } catch (err) {
    console.error("push queue failed", err);
  }
}

/**
 * 알림 하나를 쓰는 문장 (batch 에 함께 넣는다). 보상과 같은 batch 에 넣어 "포인트는 받았는데 카드는 없다"가 생기지 않게 한다.
 * key 는 꼭 고정 키 (INSERT OR IGNORE 라 다시 돌아도 한 번만). guard: 쓸 조건(SQL, 뒤의 값은 args)
 */
export function eventStatement(env: Env, e: NewEvent & { key: string }, t: number, guard = "", args: unknown[] = []): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO events (id, user_id, type, payload, created_at) SELECT ?, ?, ?, ?, ?${guard ? ` WHERE ${guard}` : ""}`,
  ).bind(e.key, e.userId, e.type, JSON.stringify(e.payload ?? {}), t, ...args);
}
