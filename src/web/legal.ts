/**
 * 약관 · 개인정보 처리방침 · 계정 삭제 안내에 함께 쓰는 운영자 정보.
 * 기획자가 확정하면 여기만 채운다 (null 이면 "확정 전" 문구가 보인다).
 */
export const LEGAL = {
  operatorName: null as string | null,
  contactEmail: null as string | null,
  effectiveDate: null as string | null, // 예: "2026-12-10"
};

export const PENDING = "출시 전 확정해요";

export function operatorLine(): string {
  return `운영자: ${LEGAL.operatorName ?? PENDING} · 시행일: ${LEGAL.effectiveDate ?? PENDING}`;
}
