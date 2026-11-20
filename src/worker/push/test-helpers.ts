// 테스트 전용: 받는 쪽(브라우저) 흉내 — 키 만들기 · 받은 본문 풀기 (RFC 8291 을 거꾸로)
import { b64urlDecode, b64urlEncode, concat, type Bytes } from "./webpush";

const enc = new TextEncoder();

async function hmac(key: Bytes, data: Bytes) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
const hkdf = async (salt: Bytes, ikm: Bytes, info: Bytes, len: number) =>
  (await hmac(await hmac(salt, ikm), concat(info, new Uint8Array([1])))).slice(0, len);

/** 새 VAPID 키 쌍 (서버 환경 변수 모양: base64url 공개키 65바이트 · 비밀키 32바이트) */
export async function newVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return { publicKey: b64urlEncode(raw), privateKey: jwk.d! };
}

/** 브라우저 구독 키 흉내 (p256dh 공개키 · 비밀키 · auth 16바이트) */
export async function newSubscriptionKeys() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return { publicRaw, privateRaw: b64urlDecode(jwk.d!), auth: crypto.getRandomValues(new Uint8Array(16)) };
}

/** 받은 aes128gcm 본문을 받는 쪽 키로 푼다 (한 레코드) */
export async function decryptPayload(body: Bytes, uaPrivate: Bytes, uaPublic: Bytes, authSecret: Bytes): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256", d: b64urlEncode(uaPrivate),
    x: b64urlEncode(uaPublic.slice(1, 33)), y: b64urlEncode(uaPublic.slice(33, 65)),
  };
  const priv = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  const ikm = await hkdf(authSecret, secret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
  // 끝의 0 패딩을 걷고 마지막 구분자 0x02 를 뗀다
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error("bad padding delimiter");
  return new TextDecoder().decode(plain.slice(0, end));
}
