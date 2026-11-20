/**
 * Web Push 보내기에 필요한 암호 처리 (WebCrypto 만 쓴다. Node API · 외부 라이브러리 없음)
 * - RFC 8291: 메시지 내용 암호화 (aes128gcm, RFC 8188 한 레코드)
 * - RFC 8292: VAPID (ES256 으로 서명한 JWT 를 Authorization 헤더에)
 */

/** ArrayBuffer 위의 바이트 (WebCrypto 타입이 SharedArrayBuffer 를 받지 않는다) */
export type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64urlEncode(bytes: Bytes | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url (패딩 있어도 없어도). 잘못된 글자가 있으면 던진다 */
export function b64urlDecode(s: string): Bytes {
  const t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(t) || t.length % 4 === 1) throw new Error("bad base64url");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** HKDF (RFC 5869) 출력 길이 ≤ 32 인 경우만: T(1) 의 앞부분 */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, len: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);
}

/** P-256 공개키(압축 안 한 65바이트, 0x04 로 시작)인지 */
export function isP256Point(b: Bytes): boolean {
  return b.length === 65 && b[0] === 4;
}

/** 압축 안 한 공개키(65바이트) + 비밀값 d(32바이트) → JWK */
function jwkOf(publicRaw: Bytes, d?: Bytes): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(publicRaw.slice(1, 33)),
    y: b64urlEncode(publicRaw.slice(33, 65)),
    ...(d ? { d: b64urlEncode(d) } : {}),
    ext: true,
  };
}

/** 테스트에서 RFC 8291 예시의 고정 키 · salt 를 넣기 위한 자리. 실제로는 매번 새로 만든다 */
export type EncryptOverrides = { asPrivate?: Bytes; asPublic?: Bytes; salt?: Bytes };

export const RECORD_SIZE = 4096;

/**
 * RFC 8291 (aes128gcm) 로 내용을 암호화한 요청 본문. uaPublic = 구독의 p256dh(65바이트), authSecret = 구독의 auth(16바이트)
 * 본문 = salt(16) | rs(4) | idlen(1) | keyid(보내는 쪽 임시 공개키 65) | 암호문
 */
export async function encryptPayload(
  plaintext: Bytes, uaPublic: Bytes, authSecret: Bytes, o: EncryptOverrides = {},
): Promise<Bytes> {
  if (!isP256Point(uaPublic)) throw new Error("bad p256dh");
  if (authSecret.length !== 16) throw new Error("bad auth");
  // 보내는 쪽 임시 키 (메시지마다 새로)
  let asPrivate: CryptoKey;
  let asPublic: Bytes;
  if (o.asPrivate && o.asPublic) {
    asPrivate = await crypto.subtle.importKey("jwk", jwkOf(o.asPublic, o.asPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    asPublic = o.asPublic;
  } else {
    const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    asPrivate = kp.privateKey;
    asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 | ua_public | as_public, 32)
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = o.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // 한 레코드뿐이라 끝 표시 0x02 를 붙인다 (패딩 없음)
  const padded = concat(plaintext, new Uint8Array([2]));
  if (padded.length + 16 > RECORD_SIZE) throw new Error("payload too large");
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** VAPID 키 (환경 변수 VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY, 둘 다 base64url) */
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** 키 모양이 맞는지 (공개키 65바이트 0x04…, 비밀키 32바이트) */
export function validVapid(publicKey?: string, privateKey?: string): boolean {
  try {
    return !!publicKey && !!privateKey && isP256Point(b64urlDecode(publicKey)) && b64urlDecode(privateKey).length === 32;
  } catch {
    return false;
  }
}

/**
 * VAPID JWT (RFC 8292): aud = 푸시 서비스 origin, exp = 지금부터 12시간, sub = 연락처(URL 또는 mailto:)
 * ES256 서명은 WebCrypto 가 주는 r|s(64바이트) 그대로가 JWS 형식이다
 */
export async function vapidJwt(keys: VapidKeys, audience: string, nowSec: number): Promise<string> {
  const key = await signingKey(keys);
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: keys.subject })));
  const input = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${b64urlEncode(sig)}`;
}

// ── CPU 아끼기 (무료 요금제 요청당 CPU 10ms) ──
// 가져온 ECDSA 서명 키와 푸시 서비스(origin)별 서명한 JWT 를 모듈 안에 들고 있다가 다시 쓴다.
// JWT 는 12시간짜리라 11시간까지만 다시 쓴다 (남은 1시간은 푸시 서비스와 시계가 어긋나도 괜찮게)
let keyCache: { id: string; key: Promise<CryptoKey> } | null = null;
const jwtCache = new Map<string, { jwt: string; madeAt: number }>();
export const JWT_REUSE_SEC = 11 * 3600;

function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  const id = `${keys.publicKey}|${keys.privateKey}`;
  if (keyCache?.id !== id) {
    const key = crypto.subtle.importKey(
      "jwk", jwkOf(b64urlDecode(keys.publicKey), b64urlDecode(keys.privateKey)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
    // 실패한 가져오기는 들고 있지 않는다
    key.catch(() => {
      if (keyCache?.key === key) keyCache = null;
    });
    keyCache = { id, key };
  }
  return keyCache.key;
}

/** 푸시 서비스 origin 마다 JWT 를 11시간까지 다시 쓴다 */
export async function cachedVapidJwt(keys: VapidKeys, audience: string, nowSec: number): Promise<string> {
  const id = `${keys.publicKey}|${keys.subject}|${audience}`;
  const hit = jwtCache.get(id);
  if (hit && nowSec >= hit.madeAt && nowSec - hit.madeAt < JWT_REUSE_SEC) return hit.jwt;
  const jwt = await vapidJwt(keys, audience, nowSec);
  if (jwtCache.size > 20) jwtCache.clear();
  jwtCache.set(id, { jwt, madeAt: nowSec });
  return jwt;
}

/** 테스트용: 들고 있는 키 · JWT 를 비운다 */
export function clearVapidCache(): void {
  keyCache = null;
  jwtCache.clear();
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushOptions = { ttl?: number; topic?: string; urgency?: "very-low" | "low" | "normal" | "high" };

/** 푸시 서비스에 보낼 요청 (fetch 에 그대로 넘긴다) */
export async function buildPushRequest(
  target: PushTarget, payload: string, keys: VapidKeys, nowSec: number, opts: PushOptions = {},
): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPayload(enc.encode(payload), b64urlDecode(target.p256dh), b64urlDecode(target.auth));
  const jwt = await cachedVapidJwt(keys, new URL(target.endpoint).origin, nowSec);
  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "content-encoding": "aes128gcm",
    ttl: String(opts.ttl ?? 6 * 3600),
    urgency: opts.urgency ?? "normal",
    authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
  };
  // Topic: 아직 기기에 닿지 않은 같은 주제의 메시지를 새것으로 바꾼다 (base64url 글자 32자 이하)
  if (opts.topic) headers.topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  return { url: target.endpoint, init: { method: "POST", headers, body } };
}
