import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, buildPushRequest, cachedVapidJwt, clearVapidCache, concat, encryptPayload, validVapid, vapidJwt, type Bytes } from "./webpush";
import { decryptPayload, newVapidKeys, newSubscriptionKeys } from "./test-helpers";

// RFC 8291 부록 A 의 예시 값
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("base64url", () => {
  it("round_trips_and_rejects_garbage", () => {
    const b = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(b64urlDecode(b64urlEncode(b))).toEqual(b);
    expect(b64urlEncode(b)).not.toMatch(/[+/=]/);
    expect(() => b64urlDecode("a*b")).toThrow();
  });
});

describe("RFC 8291 암호화", () => {
  it("matches_rfc8291_appendix_a_test_vector", async () => {
    const out = await encryptPayload(new TextEncoder().encode(RFC.plaintext), b64urlDecode(RFC.uaPublic), b64urlDecode(RFC.authSecret), {
      asPrivate: b64urlDecode(RFC.asPrivate),
      asPublic: b64urlDecode(RFC.asPublic),
      salt: b64urlDecode(RFC.salt),
    });
    expect(b64urlEncode(out)).toBe(RFC.body);
  });

  it("rfc_vector_decrypts_with_receiver_key", async () => {
    const text = await decryptPayload(b64urlDecode(RFC.body), b64urlDecode(RFC.uaPrivate), b64urlDecode(RFC.uaPublic), b64urlDecode(RFC.authSecret));
    expect(text).toBe(RFC.plaintext);
  });

  it("random_keys_round_trip_and_differ_each_time", async () => {
    const sub = await newSubscriptionKeys();
    const msg = JSON.stringify({ title: "오운완아파트", body: "이웃 님이 응원했어요 🎉" });
    const a = await encryptPayload(new TextEncoder().encode(msg), sub.publicRaw, sub.auth);
    const b = await encryptPayload(new TextEncoder().encode(msg), sub.publicRaw, sub.auth);
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
    expect(await decryptPayload(a, sub.privateRaw, sub.publicRaw, sub.auth)).toBe(msg);
    // 헤더: rs = 4096, idlen = 65
    expect(new DataView(a.buffer).getUint32(16)).toBe(4096);
    expect(a[20]).toBe(65);
  });

  it("rejects_bad_subscription_keys", async () => {
    await expect(encryptPayload(new Uint8Array(1), new Uint8Array(64), new Uint8Array(16))).rejects.toThrow();
    const sub = await newSubscriptionKeys();
    await expect(encryptPayload(new Uint8Array(1), sub.publicRaw, new Uint8Array(15))).rejects.toThrow();
  });
});

describe("VAPID", () => {
  it("jwt_has_es256_header_claims_and_valid_signature", async () => {
    const keys = await newVapidKeys();
    const jwt = await vapidJwt({ ...keys, subject: "https://example.com" }, "https://fcm.googleapis.com", 1_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(c)))).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_000_000 + 12 * 3600, sub: "https://example.com" });
    const sig = b64urlDecode(s);
    expect(sig.length).toBe(64);
    const pub = await crypto.subtle.importKey("raw", b64urlDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
    // 다른 내용이면 서명이 맞지 않는다
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, new TextEncoder().encode(`${h}.${c}x`))).toBe(false);
  });

  it("validates_key_shapes", async () => {
    const keys = await newVapidKeys();
    expect(validVapid(keys.publicKey, keys.privateKey)).toBe(true);
    expect(validVapid(undefined, keys.privateKey)).toBe(false);
    expect(validVapid(keys.publicKey, "")).toBe(false);
    expect(validVapid("abc", keys.privateKey)).toBe(false);
    expect(validVapid(keys.privateKey, keys.publicKey)).toBe(false);
  });

  it("push_request_has_required_headers_and_decryptable_body", async () => {
    const keys = await newVapidKeys();
    const sub = await newSubscriptionKeys();
    const { url, init } = await buildPushRequest(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64urlEncode(sub.publicRaw), auth: b64urlEncode(sub.auth) },
      '{"t":1}', { ...keys, subject: "https://example.com" }, 1000, { topic: "ownwan:cheer", ttl: 60 },
    );
    const h = init.headers as Record<string, string>;
    expect(url).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(h["content-encoding"]).toBe("aes128gcm");
    expect(h.ttl).toBe("60");
    expect(h.topic).toBe("ownwancheer");
    expect(h.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    const aud = JSON.parse(new TextDecoder().decode(b64urlDecode(h.authorization.split(" ")[1].slice(2).split(".")[1]))).aud;
    expect(aud).toBe("https://fcm.googleapis.com");
    expect(await decryptPayload(init.body as Bytes, sub.privateRaw, sub.publicRaw, sub.auth)).toBe('{"t":1}');
  });
});

it("concat_joins_bytes", () => {
  expect(concat(new Uint8Array([1]), new Uint8Array([2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
});

describe("VAPID 캐시", () => {
  it("reuses_jwt_per_audience_and_key_until_11h", async () => {
    clearVapidCache();
    const keys = { ...(await newVapidKeys()), subject: "https://example.com" };
    const a = await cachedVapidJwt(keys, "https://fcm.googleapis.com", 1000);
    expect(await cachedVapidJwt(keys, "https://fcm.googleapis.com", 1000 + 10 * 3600)).toBe(a);
    expect(await cachedVapidJwt(keys, "https://web.push.apple.com", 1000)).not.toBe(a);
    expect(await cachedVapidJwt(keys, "https://fcm.googleapis.com", 1000 + 11 * 3600)).not.toBe(a);
    // 키가 바뀌면 새로
    const other = { ...(await newVapidKeys()), subject: "https://example.com" };
    const b = await cachedVapidJwt(other, "https://fcm.googleapis.com", 1000);
    expect(b.split(".")[2]).not.toBe(a.split(".")[2]);
    const pub = await crypto.subtle.importKey("raw", b64urlDecode(other.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const [h, c, s] = b.split(".");
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
});
