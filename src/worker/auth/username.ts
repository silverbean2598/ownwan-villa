/** 아이디 입력 정리: 앞뒤 공백 제거 + 소문자 (아이폰 자동 대문자 · 붙여넣기 공백 대비). 검증 · 조회 전에 쓴다. */
export function normalizeUsername(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
