export function isValidNickname(s: string): boolean {
  return s.length >= 2 && s.length <= 10;
}
