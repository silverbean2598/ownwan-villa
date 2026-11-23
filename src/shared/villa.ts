/**
 * 아파트의 기본 정원. 아파트마다 정원은 villas.capacity 에 있고(타워팰리스는 50명), 서버 검사와 화면 표시는 그 값을 쓴다.
 * 이 값은 새 아파트의 기본값이자, 정원을 보내지 않던 예전 서버 응답을 읽을 때의 기본값이다.
 */
export const VILLA_CAPACITY = 20;

/** 타워팰리스 정원 [제안 — 기획자 확인 필요, 2026-11-20] */
export const APARTMENT_CAPACITY = 50;

/** 건물 종류: 아파트(처음) → 타워팰리스(정원이 다 찬 아파트를 방장이 바꾼 것, 되돌릴 수 없다) */
export type VillaKind = "villa" | "apartment";

/** 그 건물을 부르는 말 ("아파트" / "타워팰리스"). 앱 전체를 부르는 말(아파트 화면 · 아파트 3곳)은 그대로 "아파트" */
export const kindLabel = (kind: VillaKind | undefined) => (kind === "apartment" ? "타워팰리스" : "아파트");

/** 정원 (예전 서버 응답에는 없으니 기본값) */
export const capacityOf = (v: { capacity?: number | null }) => v.capacity ?? VILLA_CAPACITY;

/**
 * 설정의 "타워팰리스로 승격" 칸 상태
 * - eligible: 방장 · 아파트 · 정원이 다 참 → [타워팰리스로 승격] 버튼
 * - waiting: 방장 · 아파트 · 아직 정원이 안 참 → 진행 상황만 (읽기전용)
 * - member: 방장이 아닌 입주민 · 아파트 → 진행 상황만 (읽기전용, "방장이 바꿀 수 있어요")
 * - apartment: 이미 타워팰리스 (누구나 읽기전용)
 */
export type PromoteState = "eligible" | "waiting" | "member" | "apartment";
export function promoteState(v: { kind?: VillaKind; capacity?: number; memberCount: number }, isOwner: boolean): PromoteState {
  if (v.kind === "apartment") return "apartment";
  if (!isOwner) return "member";
  return v.memberCount >= capacityOf(v) ? "eligible" : "waiting";
}

/** 한 사람이 함께 살 수 있는 아파트 수 [확정 — 기획자 결정, 2026-11-19]. 만든 아파트도 센다 */
export const MAX_VILLAS_PER_USER = 3;

/** 3곳이 다 찼을 때 (입주 · 만들기) */
export const VILLA_LIMIT_MSG = `아파트는 ${MAX_VILLAS_PER_USER}곳까지 살 수 있어요. 한 곳을 나가면 들어올 수 있어요`;

/** GET /api/me/villas 한 줄: 내가 사는 아파트 (입주한 순서) */
export type MyVilla = {
  id: string;
  name: string;
  ownerId: string;
  public: boolean;
  memberCount: number;
  joinedAt: number;
  /** 오늘(KST) 이 아파트에 올린 인증 사진이 있다 = 이 아파트에서 내 방 불이 켜졌다 */
  certifiedToday: boolean;
  /** 건물 종류 · 정원 (예전 서버 응답에는 없다 → 아파트 · 20명) */
  kind?: VillaKind;
  capacity?: number;
};
