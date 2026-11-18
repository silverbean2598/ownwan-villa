const ITERATIONS = 20000;
const MIN_LEN = 8;
const MAX_LEN = 128;
export const PASSWORD_LENGTH_MSG = "비밀번호는 8~128자로 정해 주세요";

/** 비밀번호 길이 규칙 (8~128자). 너무 긴 입력으로 해시 CPU를 낭비하지 않도록 상한을 둔다. */
export function isValidPasswordLength(pw: string): boolean {
  return pw.length >= MIN_LEN && pw.length <= MAX_LEN;
}

/** 저장된 해시의 반복 횟수가 지금 설정과 다르면 true (로그인 성공 시 새로 해시해 저장한다) */
export function needsRehash(stored: string): boolean {
  return stored.split("$")[1] !== String(ITERATIONS);
}
const enc = new TextEncoder();

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function derive(pw: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(pw, salt, ITERATIONS))}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const actual = new Uint8Array(await derive(pw, unb64(salt), Number(iter)));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
