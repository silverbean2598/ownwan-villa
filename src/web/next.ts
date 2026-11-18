/** `?next=` 값은 같은 사이트 안의 경로만 받는다 ("/"로 시작, "//" 불가) */
export function safeNext(v: string | null | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}
