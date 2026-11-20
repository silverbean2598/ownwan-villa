import { SPORTS, type Sport } from "./sports";
import type { VillaKind } from "./villa";

/** 빈방 모집 · 입주 신청 [확정 — 기획자 결정, 2026-11-19]. 서버(검사)와 화면(글자 수 · 문구)이 같이 쓴다 */

/** 모집 글 한 줄 소개 최대 글자 수 */
export const RECRUIT_INTRO_MAX = 60;
/** 신청할 때 방장에게 남기는 말 최대 글자 수 */
export const APPLY_MESSAGE_MAX = 100;
/** 신청은 7일 동안 답이 없으면 만료된다 */
export const APPLY_TTL_MS = 7 * 24 * 3600_000;
/** 끝난 신청 기록은 30일 뒤 크론이 지운다 */
export const APPLY_KEEP_MS = 30 * 24 * 3600_000;

/** 글자 수 (이모지도 한 글자) */
export const charLen = (s: string) => Array.from(s).length;

/** 원하는 종목: 6가지 중 고른 것만, 겹치지 않게, 정해진 순서로. 잘못된 값이 있으면 null */
export function cleanSports(v: unknown): Sport[] | null {
  if (!Array.isArray(v) || v.length > SPORTS.length) return null;
  if (!v.every((s) => typeof s === "string" && (SPORTS as readonly string[]).includes(s))) return null;
  return SPORTS.filter((s) => v.includes(s));
}

/** 저장된 JSON 을 읽는다 (깨져 있으면 종목 상관없음) */
export function parseSports(raw: string | null | undefined): Sport[] {
  try {
    return cleanSports(JSON.parse(raw ?? "[]")) ?? [];
  } catch {
    return [];
  }
}

/** GET /api/villas/:id/recruit: 이 빌라 입주민이 보는 모집 글. pendingCount 는 방장에게만 */
export type RecruitPost = {
  open: boolean;
  intro: string;
  sports: Sport[];
  /** 한 번도 쓴 적 없으면 null (신규입력) */
  updatedAt: number | null;
  public: boolean;
  memberCount: number;
  /** 건물 종류 · 정원 (예전 서버 응답에는 없다 → 빌라 · 20명) */
  kind?: VillaKind;
  capacity?: number;
  pendingCount?: number;
};

/** 도시 카드에 붙는 모집 글 (공개 · 모집 중 · 빈방 있는 빌라만). blocked: 보는 사람이 이 빌라에 신청할 수 없음 */
export type CityRecruit = { intro: string; sports: Sport[]; vacancies: number; blocked?: true };

/** 내가 보낸, 아직 기다리는 신청 (한 번에 하나) */
export type MyApplication = { id: string; villaId: string; villaName: string; message: string; createdAt: number; expiresAt: number };

/** 방장이 보는 받은 신청 한 줄 */
export type ReceivedApplication = {
  id: string;
  userId: string;
  nickname: string;
  avatar: unknown;
  sport: Sport | null;
  /** 사용자 연속 기록 (어느 빌라든 올린 날로 센 값) */
  streak: number;
  message: string;
  createdAt: number;
};

export const RECRUIT_NEED_PUBLIC_MSG = "지도에 공개하면 모집할 수 있어요";
export const APPLY_ONE_AT_A_TIME_MSG = "신청은 한 번에 한 곳만 할 수 있어요. 기다리는 신청을 취소하면 다른 곳에 신청할 수 있어요";
export const APPLY_BLOCKED_MSG = "이 빌라에는 신청할 수 없어요";
