// 카카오로만 가입한 계정 표시 (migrations/0011_kakao.sql 참고)
// 이 값은 "pbkdf2$..." 형식이 아니라 verifyPassword 가 항상 false 를 돌려준다. 그래도 각 경로에서 먼저 걸러 안내한다.
export const NO_PASSWORD = "!kakao-only";
export const KAKAO_ONLY_MSG = "카카오로 가입한 계정이에요. 카카오로 로그인하면 돼요";

export function isPasswordless(passwordHash: string | null | undefined): boolean {
  return passwordHash === NO_PASSWORD;
}
