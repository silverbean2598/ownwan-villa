import { kstDay } from "../../shared/rules/day";

/** GET /api/events 한 줄. night_reminder 는 서버가 아니라 화면에서 만든다 */
export type AppEvent = { id: string; type: string; payload: Record<string, unknown>; createdAt: number };

/** 전체 화면 카드 (그림 + 한 줄 + [좋아요]) */
export const CARD_TYPES = [
  "streak7", "floor_up", "penthouse_in", "penthouse_out", "floor_down", "welcome", "kicked", "owner_in", "dissolved", "application_rejected",
] as const;
/** 위쪽 토스트 (3초 뒤 사라짐) */
export const TOAST_TYPES = [
  "certified", "streak6", "bought", "friend_joined", "owner_changed", "night_reminder", "cheered", "commented",
  "application_received", "application_closed",
] as const;
export type CardType = (typeof CARD_TYPES)[number];
export type ToastType = (typeof TOAST_TYPES)[number];

export const isCard = (t: string): t is CardType => (CARD_TYPES as readonly string[]).includes(t);
export const isToast = (t: string): t is ToastType => (TOAST_TYPES as readonly string[]).includes(t);

// 숫자를 한국어로 읽을 때 받침이 있는지 (영 일 이 삼 사 오 육 칠 팔 구)
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];

/** 끝 글자에 받침이 있는지. 끝 글자를 읽을 수 없으면 null */
function hasFinal(word: string): boolean | null {
  // 끝의 따옴표 · 괄호 묶음 · 공백은 건너뛴다 ("짐볼(대)" → 짐볼)
  const w = word.replace(/\([^)]*\)\s*$/, "").replace(/["'”’」』)\]\s.!?]+$/u, "");
  const ch = w.at(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return DIGIT_HAS_FINAL[Number(ch)];
  return null;
}

/** 목적격 조사: 받침 있으면 "을", 없으면 "를". 끝 글자를 읽을 수 없으면 "을(를)" */
export function objParticle(word: string): "을" | "를" | "을(를)" {
  const f = hasFinal(word);
  return f === null ? "을(를)" : f ? "을" : "를";
}

/** 주격 조사: 받침 있으면 "이", 없으면 "가". 끝 글자를 읽을 수 없으면 "이(가)" */
export function subjParticle(word: string): "이" | "가" | "이(가)" {
  const f = hasFinal(word);
  return f === null ? "이(가)" : f ? "이" : "가";
}

/** 보조사: 받침 있으면 "은", 없으면 "는". 끝 글자를 읽을 수 없으면 "은(는)" */
export function topicParticle(word: string): "은" | "는" | "은(는)" {
  const f = hasFinal(word);
  return f === null ? "은(는)" : f ? "은" : "는";
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback);

export const COMMENT_PREVIEW = 20;

/** 앞 n글자(이모지도 한 글자로), 더 있으면 "…" */
export function preview(text: string, n = COMMENT_PREVIEW): string {
  const chars = Array.from(text);
  return chars.length > n ? chars.slice(0, n).join("").trimEnd() + "…" : text;
}

/**
 * 빌라 여러 곳에 사는 사람에게 온 빌라 알림이면 빌라 이름 (서버가 villaName · multi 를 붙인다).
 * 빌라 1곳에 사는 사람에게는 null → 지금까지와 같은 문구
 */
function villaOf(p: Record<string, unknown>): string | null {
  return p.multi === true && typeof p.villaName === "string" && p.villaName ? p.villaName : null;
}

/** 카드 · 토스트 한 줄 문구 */
export function eventCopy(e: AppEvent): string {
  const p = e.payload;
  const villa = villaOf(p);
  switch (e.type) {
    case "streak7":
      return `${str(p.streak)}일 연속 오운완! 대단해요`;
    case "floor_up": {
      // 7일째 인증은 연속 기록 카드와 층 카드가 겹치므로 서버가 floor_up 하나에 streak 을 함께 담는다
      const where = villa ? `${villa} ` : "";
      return p.streak !== undefined ? `${str(p.streak)}일 연속! ${where}${str(p.floor)}층으로 올라왔어요` : `${where}${str(p.floor)}층으로 올라왔어요`;
    }
    case "penthouse_in":
      return villa ? `${villa} 펜트하우스에 입주했어요` : "펜트하우스에 입주했어요";
    case "penthouse_out":
      return villa
        ? `${str(p.nickname, "이웃")} 님이 ${villa} 펜트하우스를 차지했어요`
        : `${str(p.nickname, "이웃")} 님이 펜트하우스를 차지했어요`;
    case "floor_down":
      return villa ? `어제 ${villa}에 올리지 않아서 ${str(p.floor)}층으로 내려왔어요` : `어제 쉬어서 ${str(p.floor)}층으로 내려왔어요`;
    case "welcome":
      // 빈방 모집 신청이 승인돼 들어온 경우
      return p.via === "recruit" ? `입주 신청이 승인됐어요! ${str(p.villaName, "빌라")}에 입주했어요` : `${str(p.villaName, "빌라")}에 입주했어요`;
    case "certified":
      return `불이 켜졌어요 +${str(p.points, "0")}P`;
    case "streak6":
      return villa ? `내일 ${villa}에 인증하면 한 층 올라가요` : "내일 인증하면 한 층 올라가요";
    case "bought": {
      const name = str(p.itemName, "가구");
      return `${name}${objParticle(name)} 샀어요`;
    }
    case "friend_joined":
      return villa ? `${str(p.nickname, "새 이웃")} 님이 ${villa}에 입주했어요` : `${str(p.nickname, "새 이웃")} 님이 입주했어요`;
    case "night_reminder":
      return "오늘 아직 불이 꺼져 있어요";
    case "kicked":
      return `${str(p.villaName, "빌라")}에서 나가게 됐어요`;
    case "owner_in":
      return villa ? `${villa} 방장이 됐어요` : "방장이 됐어요";
    case "owner_changed":
      return villa ? `${str(p.nickname, "이웃")} 님이 ${villa} 새 방장이 됐어요` : `${str(p.nickname, "이웃")} 님이 새 방장이 됐어요`;
    case "dissolved": {
      const name = str(p.villaName, "빌라");
      return `${name}${subjParticle(name)} 해체됐어요`;
    }
    case "cheered":
      return `${str(p.nickname, "이웃")} 님이 응원했어요`;
    case "commented":
      return `${str(p.nickname, "이웃")} 님: ${preview(str(p.body))}`;
    case "application_received":
      return villa ? `${villa}에 ${str(p.nickname, "누군가")} 님의 입주 신청이 왔어요` : `${str(p.nickname, "누군가")} 님의 입주 신청이 왔어요`;
    case "application_rejected":
      return `이번에는 ${str(p.villaName, "그 빌라")}에 함께하지 못하게 됐어요. 다른 빌라도 둘러봐요`;
    case "application_closed":
      return closedCopy(str(p.villaName, "빌라"), str(p.reason));
    default:
      return "";
  }
}

/** 기다리던 입주 신청이 빌라 쪽 일로 끝났을 때 (신청한 사람에게, 부드럽게) */
function closedCopy(name: string, reason: string): string {
  switch (reason) {
    case "full":
      return `${name}${subjParticle(name)} 꽉 차서 입주 신청이 취소됐어요`;
    case "dissolved":
      return `${name}${subjParticle(name)} 문을 닫아서 입주 신청이 취소됐어요`;
    case "expired":
      return `${name} 입주 신청이 7일이 지나 만료됐어요`;
    case "limit":
      return `빌라 3곳에 살고 있어서 ${name} 입주 신청이 취소됐어요`;
    default:
      return `${name} 빈방 모집이 끝나서 입주 신청이 취소됐어요`;
  }
}

/** 카드 버튼 문구 (기본 "좋아요") */
export const cardButton = (type: string) => (type === "application_rejected" ? "알겠어요" : "좋아요");

/**
 * 받아 온 이벤트를 카드 · 토스트로 나눈다 (순서 유지).
 * 48시간보다 오래된 이벤트는 보여 주지 않는다(오랜만에 들어온 사람에게 지난 카드가 쏟아지지 않게).
 * 펜트하우스는 빌라마다 마지막 변경만 보여 준다(오래 안 들어온 사이 여러 번 뺏고 뺏겼을 때). 나머지와 모르는 종류는 drop → 바로 본 것으로.
 */
export const STALE_MS = 48 * 3600_000;

export function planEvents(all: AppEvent[], nowMs: number): { cards: AppEvent[]; toasts: AppEvent[]; drop: string[] } {
  const stale = all.filter((e) => nowMs - e.createdAt > STALE_MS);
  const list = all.filter((e) => nowMs - e.createdAt <= STALE_MS);
  const isPenthouse = (t: string) => t === "penthouse_in" || t === "penthouse_out";
  // 빌라마다 마지막 펜트하우스 알림 (빌라 정보가 없는 예전 알림은 한 묶음)
  const lastPenthouse = new Set<string>();
  const seenVilla = new Set<string>();
  for (const e of [...list].reverse()) {
    if (!isPenthouse(e.type)) continue;
    const v = typeof e.payload.villaId === "string" ? e.payload.villaId : "";
    if (seenVilla.has(v)) continue;
    seenVilla.add(v);
    lastPenthouse.add(e.id);
  }
  const cards: AppEvent[] = [];
  const toasts: AppEvent[] = [];
  const drop: string[] = stale.map((e) => e.id);
  for (const e of list) {
    if (isPenthouse(e.type) && !lastPenthouse.has(e.id)) drop.push(e.id);
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
