import { nextDay, prevDay } from "./day";

/**
 * 집값 [확정 — 기획자 결정, 2026-11-20] : 합계 중심.
 * 값은 0.1억 단위 정수(tenths)로 다룬다. 32 → "3.2억".
 *
 * 집값 = 기본 1억
 *      + 입주민 한 명당 0.1억
 *      + 최근 7일(정산한 날 포함) 동안 입주민이 이 빌라에 인증한 날 하루당 0.1억
 *      + 입주민 층이 1층보다 높은 만큼 한 층당 0.1억
 * 예) 9명, 평균 3일 인증, 3명이 2층 → 10 + 9 + 27 + 3 = 49 → 4.9억
 *     20명 모두 매일 인증, 평균 4층 → 10 + 20 + 140 + 60 = 230 → 23억
 */
export const PRICE_BASE = 10;
export const PRICE_PER_MEMBER = 1;
export const PRICE_PER_CERT_DAY = 1;
export const PRICE_PER_FLOOR = 1;
/** 인증한 날을 세는 기간 (정산한 날 포함 최근 7일) */
export const PRICE_WINDOW_DAYS = 7;

/** 입주민 한 명: 최근 7일 이 빌라에 인증한 날 수(0~7) · 그날 정산 뒤의 이 빌라 층 */
export type PriceMember = { certDays: number; floor: number };

/** 빌라 집값 (0.1억 단위). 입주민이 없으면 null (해체된 빌라 · 아무도 없는 빌라는 집값이 없다) */
export function villaPrice(members: PriceMember[]): number | null {
  if (!members.length) return null;
  let p = PRICE_BASE;
  for (const m of members) {
    const days = Math.max(0, Math.min(PRICE_WINDOW_DAYS, Math.floor(m.certDays)));
    const above = Math.max(0, Math.floor(m.floor) - 1);
    p += PRICE_PER_MEMBER + days * PRICE_PER_CERT_DAY + above * PRICE_PER_FLOOR;
  }
  return p;
}

/** 최근 7일 인증한 날을 세는 첫날 (day 포함 7일: day-6 ~ day) */
export function windowStart(day: string): string {
  let d = day;
  for (let i = 1; i < PRICE_WINDOW_DAYS; i++) d = prevDay(d);
  return d;
}

/** 0.1억 단위 → "3.2억" (정수면 "3억"이 아니라 "3.0억"으로 한 자리 고정) */
export function formatPrice(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}억`;
}

/** 어제와 비교: "▲0.3억" / "▼0.2억" / "변동 없음". 어제 값이 없으면 null (처음 집계) */
export function formatChange(change: number | null | undefined): string | null {
  if (change === null || change === undefined) return null;
  if (change > 0) return `▲${formatPrice(change)}`;
  if (change < 0) return `▼${formatPrice(-change)}`;
  return "변동 없음";
}

/** 대결 증감 표시: "+0.4억" / "−0.1억" / "0.0억" */
export function formatDelta(d: number): string {
  if (d > 0) return `+${formatPrice(d)}`;
  if (d < 0) return `−${formatPrice(-d)}`;
  return formatPrice(0);
}

// ── 주간 리그 ──

/** 리그 1 · 2 · 3위 빌라 입주민 한 명당 포인트 */
export const LEAGUE_POINTS = [100, 60, 30] as const;
export const leaguePoints = (rank: number) => LEAGUE_POINTS[rank - 1] ?? 0;

/** 요일 (0 = 일요일). day 는 KST 날짜 */
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const isSunday = (day: string) => weekday(day) === 0;

/** 그 날이 속한 주(월~일)의 월요일 = 주 id */
export function weekOf(day: string): string {
  const back = (weekday(day) + 6) % 7;
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
}

/** KST 날짜가 시작하는 시각(00:00 KST)의 UTC ms */
export const dayStartMs = (day: string) => Date.parse(`${day}T00:00:00+09:00`);

/** 리그 순위 · 1:1 대결에 낄 수 있는 최소 입주민 수 (혼자 · 둘이 만든 빌라로 보상을 받지 못하게) */
export const MIN_MEMBERS_FOR_COMPETITION = 3;
export const MIN_MEMBERS_MSG = `입주민이 ${MIN_MEMBERS_FOR_COMPETITION}명 이상이어야 대결할 수 있어요`;

export type LeagueEntry = { villaId: string; price: number; certDays: number; memberCount: number; createdAt: number };

/**
 * 리그 순위: 집값 높은 순. 같으면 인증한 날 합이 많은 빌라, 입주민이 많은 빌라, 먼저 지은 빌라 순 (순위는 겹치지 않는다).
 * 그 주(최근 7일)에 인증이 하루도 없는 빌라, 지금 입주민이 3명보다 적은 빌라는 순위에 넣지 않는다 (빈 빌라 · 혼자 만든 빌라로 보상을 받지 못하게)
 */
export function rankLeague(entries: LeagueEntry[]): (LeagueEntry & { rank: number })[] {
  return entries
    .filter((e) => e.certDays > 0 && e.memberCount >= MIN_MEMBERS_FOR_COMPETITION)
    .sort((a, b) => b.price - a.price || b.certDays - a.certDays || b.memberCount - a.memberCount || a.createdAt - b.createdAt || (a.villaId < b.villaId ? -1 : 1))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// ── 1:1 대결 ──

/** 대결 기간 (받은 다음 날부터 7일) */
export const BATTLE_DAYS = 7;
/** 받지 않은 신청이 만료되는 시간 */
export const CHALLENGE_TTL_MS = 48 * 3600_000;
/** 이긴 빌라 입주민 한 명당 포인트 */
export const BATTLE_POINTS = 50;
/** 건물에 "대결 승리" 배지를 다는 기간 */
export const BATTLE_BADGE_MS = 7 * 86_400_000;

/** 받은 날(KST) → 대결 첫날 · 마지막 날. 기준값은 받은 날(첫날 전날)의 집값 */
export function battleDays(acceptedDay: string): { start: string; end: string } {
  const start = nextDay(acceptedDay);
  let end = start;
  for (let i = 1; i < BATTLE_DAYS; i++) end = nextDay(end);
  return { start, end };
}

/** 이긴 쪽: 오른 값(마지막 날 − 첫날 전날)이 큰 빌라. 같으면 무승부 */
export function battleWinner(a: { base: number; end: number }, b: { base: number; end: number }): "a" | "b" | "draw" {
  const da = a.end - a.base;
  const db = b.end - b.base;
  return da > db ? "a" : db > da ? "b" : "draw";
}
