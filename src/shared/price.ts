import { MIN_MEMBERS_FOR_COMPETITION, MIN_MEMBERS_MSG } from "./rules/price";
import type { VillaKind } from "./villa";

/** 집값 대결 [확정 — 기획자 결정, 2026-11-20]: 서버가 보내고 화면이 그리는 모양. 값은 모두 0.1억 단위 정수 */

/** 리그 트로피 (그 주 1 · 2 · 3위) */
export type Trophy = 1 | 2 | 3;

/** 집값 순위 한 줄 (공개 빌라만). 입주민 목록 · id 는 없다 */
export type RankingRow = {
  id: string;
  name: string;
  /** 집값이 있는 빌라 중 순위 (아직 집계 전이면 null) */
  rank: number | null;
  price: number | null;
  /** 전날보다 얼마나 (전날 값이 없으면 null) */
  change: number | null;
  memberCount: number;
  /** 건물 종류 (예전 서버 응답에는 없다 → 빌라) */
  kind?: VillaKind;
  /** 가장 최근 주간 리그 1 · 2 · 3위 */
  trophy?: Trophy;
  /** 7일 안에 1:1 대결에서 이겼다 */
  battleWin?: boolean;
  /** 지금 대결 중이거나 신청이 오가는 중 (새 신청을 받을 수 없다) */
  inBattle: boolean;
};

/** 내가 사는 빌라 (대결 신청 버튼을 고르는 데 쓴다) */
export type RankingMine = { villaId: string; name: string; isOwner: boolean; public: boolean; inBattle: boolean; /** 지금 입주민 수 (예전 응답에는 없다) */ memberCount?: number };

export type RankingResponse = {
  /** 집값을 매긴 날 (마지막으로 정산한 날, KST). 아직 없으면 null */
  day: string | null;
  villas: RankingRow[];
  mine: RankingMine[];
  /** 가장 최근 주간 리그의 주 (그 주 월요일). 아직 없으면 null */
  leagueWeek: string | null;
};

/** 우리 빌라 집값 (입주민 또는 공개 빌라) */
export type VillaPrice = { day: string | null; price: number | null; change: number | null; history: { day: string; price: number }[] };

export type BattleStatus = "pending" | "active" | "finished" | "declined" | "expired" | "cancelled";

/** 한쪽 빌라의 대결 숫자: 기준(첫날 전날) · 지금(또는 마지막 날) · 오른 값 */
export type BattleSide = { villaId: string; name: string; base: number | null; now: number | null; delta: number | null };

/** 우리 빌라에서 본 대결 하나 */
export type BattleView = {
  id: string;
  status: BattleStatus;
  /** 끝난 이유: withdrawn(신청 취소) · expired · dissolved · private · no_price */
  reason: string | null;
  /** 우리가 신청했는지(challenger) 받았는지(opponent) */
  side: "challenger" | "opponent";
  me: BattleSide;
  them: BattleSide;
  createdAt: number;
  /** pending 만: 받지 않으면 이때 만료 */
  expiresAt?: number;
  startDay?: string;
  endDay?: string;
  /** active 만: 오늘 포함 남은 날 (시작 전이면 7) */
  daysLeft?: number;
  /** active 만: 첫날이 지나 집계가 시작됐는지 */
  started?: boolean;
  /** finished 만 */
  result?: "won" | "lost" | "draw";
  finishedAt?: number | null;
};

export type VillaBattles = {
  isOwner: boolean;
  public: boolean;
  /** 신청 중이거나 진행 중인 대결 (빌라마다 하나) */
  current: BattleView | null;
  /** 최근 끝난 대결 (최대 5개) */
  recent: BattleView[];
  /** 우리 빌라 지금 입주민 수 (3명보다 적으면 대결할 수 없다) */
  memberCount?: number;
};

/** 우리 빌라 쪽 이유로 어느 빌라에도 신청할 수 없을 때 이유 (방장 아님 · 비공개 · 이미 대결 중). 신청할 수 있으면 null */
export function selfBlock(from: RankingMine | undefined): string | null {
  if (!from || !from.isOwner) return "대결 신청은 방장만 할 수 있어요";
  if (!from.public) return "우리 빌라를 지도에 공개해야 대결할 수 있어요";
  if (from.memberCount !== undefined && from.memberCount < MIN_MEMBERS_FOR_COMPETITION) return MIN_MEMBERS_MSG;
  if (from.inBattle) return "우리 빌라는 이미 대결 중이거나 신청이 오가는 중이에요";
  return null;
}

/** 대결 신청 버튼을 누를 수 없는 이유 (화면 한 줄). 누를 수 있으면 null */
export function challengeBlock(
  target: { id: string; inBattle: boolean; memberCount?: number },
  from: RankingMine | undefined,
  ownTargets: string[] = [],
): string | null {
  if (!from || !from.isOwner) return "대결 신청은 방장만 할 수 있어요";
  if (target.id === from.villaId) return "우리 빌라예요";
  if (ownTargets.includes(target.id)) return "내가 방장인 빌라끼리는 대결할 수 없어요";
  const self = selfBlock(from);
  if (self) return self;
  if (target.memberCount !== undefined && target.memberCount < MIN_MEMBERS_FOR_COMPETITION) return `입주민이 ${MIN_MEMBERS_FOR_COMPETITION}명 이상인 빌라와만 대결할 수 있어요`;
  if (target.inBattle) return "이 빌라는 지금 다른 대결 중이에요";
  return null;
}

export const BATTLE_REASON_COPY: Record<string, string> = {
  withdrawn: "신청을 취소했어요",
  expired: "48시간 안에 답이 없어 만료됐어요",
  dissolved: "빌라가 해체돼서 대결이 취소됐어요",
  private: "빌라가 지도에서 내려가 대결이 취소됐어요",
  no_price: "집값을 계산하지 못해 대결이 취소됐어요",
  members: "입주민이 3명보다 적어져 대결이 취소됐어요",
};
