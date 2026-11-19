/** 한 빌라의 정원. 서버(입주 검사)와 화면(입주 n/20명, 빈방 표시)이 같이 쓴다. */
export const VILLA_CAPACITY = 20;

/** 한 사람이 함께 살 수 있는 빌라 수 [확정 — 기획자 결정, 2026-11-19]. 만든 빌라도 센다 */
export const MAX_VILLAS_PER_USER = 3;

/** 3곳이 다 찼을 때 (입주 · 만들기) */
export const VILLA_LIMIT_MSG = `빌라는 ${MAX_VILLAS_PER_USER}곳까지 살 수 있어요. 한 곳을 나가면 들어올 수 있어요`;

/** GET /api/me/villas 한 줄: 내가 사는 빌라 (입주한 순서) */
export type MyVilla = {
  id: string;
  name: string;
  ownerId: string;
  public: boolean;
  memberCount: number;
  joinedAt: number;
  /** 오늘(KST) 이 빌라에 올린 인증 사진이 있다 = 이 빌라에서 내 방 불이 켜졌다 */
  certifiedToday: boolean;
};
