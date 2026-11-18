import { kstDay } from "../../shared/rules/day";

/** GET /api/events 한 줄. night_reminder 는 서버가 아니라 화면에서 만든다 */
export type AppEvent = { id: string; type: string; payload: Record<string, unknown>; createdAt: number };

/** 전체 화면 카드 (그림 + 한 줄 + [좋아요]) */
export const CARD_TYPES = ["streak7", "floor_up", "penthouse_in", "penthouse_out", "floor_down", "welcome"] as const;
/** 위쪽 토스트 (3초 뒤 사라짐) */
export const TOAST_TYPES = ["certified", "streak6", "bought", "friend_joined", "night_reminder"] as const;
export type CardType = (typeof CARD_TYPES)[number];
export type ToastType = (typeof TOAST_TYPES)[number];

export const isCard = (t: string): t is CardType => (CARD_TYPES as readonly string[]).includes(t);
export const isToast = (t: string): t is ToastType => (TOAST_TYPES as readonly string[]).includes(t);

// 숫자를 한국어로 읽을 때 받침이 있는지 (영 일 이 삼 사 오 육 칠 팔 구)
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];

/** 목적격 조사: 받침 있으면 "을", 없으면 "를". 끝 글자를 읽을 수 없으면 "을(를)" */
export function objParticle(word: string): "을" | "를" | "을(를)" {
  // 끝의 따옴표 · 괄호 묶음 · 공백은 건너뛴다 ("짐볼(대)" → 짐볼)
  const w = word.replace(/\([^)]*\)\s*$/, "").replace(/["'”’」』)\]\s.!?]+$/u, "");
  const ch = w.at(-1);
  if (!ch) return "을(를)";
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을";
  if (/[0-9]/.test(ch)) return DIGIT_HAS_FINAL[Number(ch)] ? "을" : "를";
  return "을(를)";
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback);

/** 카드 · 토스트 한 줄 문구 */
export function eventCopy(e: AppEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "streak7":
      return `${str(p.streak)}일 연속 오운완! 대단해요`;
    case "floor_up":
      // 7일째 인증은 연속 기록 카드와 층 카드가 겹치므로 서버가 floor_up 하나에 streak 을 함께 담는다
      return p.streak !== undefined ? `${str(p.streak)}일 연속! ${str(p.floor)}층으로 올라왔어요` : `${str(p.floor)}층으로 올라왔어요`;
    case "penthouse_in":
      return "펜트하우스에 입주했어요";
    case "penthouse_out":
      return `${str(p.nickname, "이웃")} 님이 펜트하우스를 차지했어요`;
    case "floor_down":
      return `어제 쉬어서 ${str(p.floor)}층으로 내려왔어요`;
    case "welcome":
      return `${str(p.villaName, "빌라")}에 입주했어요`;
    case "certified":
      return `불이 켜졌어요 +${str(p.points, "0")}P`;
    case "streak6":
      return "내일 인증하면 한 층 올라가요";
    case "bought": {
      const name = str(p.itemName, "가구");
      return `${name}${objParticle(name)} 샀어요`;
    }
    case "friend_joined":
      return `${str(p.nickname, "새 이웃")} 님이 입주했어요`;
    case "night_reminder":
      return "오늘 아직 불이 꺼져 있어요";
    default:
      return "";
  }
}

/**
 * 받아 온 이벤트를 카드 · 토스트로 나눈다 (순서 유지).
 * 펜트하우스는 마지막 변경만 보여 준다(오래 안 들어온 사이 여러 번 뺏고 뺏겼을 때). 나머지와 모르는 종류는 drop → 바로 본 것으로.
 */
export function planEvents(list: AppEvent[]): { cards: AppEvent[]; toasts: AppEvent[]; drop: string[] } {
  const isPenthouse = (t: string) => t === "penthouse_in" || t === "penthouse_out";
  const lastPenthouse = [...list].reverse().find((e) => isPenthouse(e.type))?.id;
  const cards: AppEvent[] = [];
  const toasts: AppEvent[] = [];
  const drop: string[] = [];
  for (const e of list) {
    if (isPenthouse(e.type) && e.id !== lastPenthouse) drop.push(e.id);
    else if (isCard(e.type)) cards.push(e);
    else if (isToast(e.type)) toasts.push(e);
    else drop.push(e.id);
  }
  return { cards, toasts, drop };
}

/** 한국 시간 몇 시인지 (0~23) */
export function kstHour(ms: number): number {
  return new Date(ms + 9 * 3600_000).getUTCHours();
}

export const NIGHT_HOUR = 21;

/** 밤 알림: 21시(KST) 이후, 오늘 아직 인증하지 않았고, 오늘 보여 준 적이 없을 때 */
export function shouldNightRemind(nowMs: number, certifiedToday: boolean, lastShownDay: string | null): boolean {
  return kstHour(nowMs) >= NIGHT_HOUR && !certifiedToday && lastShownDay !== kstDay(nowMs);
}
