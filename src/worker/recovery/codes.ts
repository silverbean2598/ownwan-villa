const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => CHARSET[b % CHARSET.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

// 복구 코드와 세션 토큰 공용 : 대시 제거 · 대문자화 후 SHA-256 hex
export async function hashToken(s: string): Promise<string> {
  const data = new TextEncoder().encode(s.replaceAll("-", "").toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
