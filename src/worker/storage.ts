import type { Env } from "./env";

/**
 * 사진 원본 저장의 단일 창구. 저장 위치(D1 / R2)는 env.PHOTO_STORAGE 로 고른다.
 * "r2" 면 R2(PHOTOS 바인딩 필수, 없으면 에러), 그 외에는 D1(photo_blobs_b64, base64 TEXT).
 */
type Ref = { id: string; r2_key: string | null };

function r2(env: Env): R2Bucket | null {
  if (env.PHOTO_STORAGE !== "r2") return null;
  // 설정 실수로 조용히 D1에 쌓이지 않도록 바로 실패시킨다
  if (!env.PHOTOS) throw new Error('PHOTO_STORAGE is "r2" but the PHOTOS R2 binding is missing (wrangler.jsonc r2_buckets)');
  return env.PHOTOS;
}

type B64Bytes = Uint8Array & { toBase64?: () => string };
type B64Ctor = { fromBase64?: (s: string) => Uint8Array<ArrayBuffer> };

export function toBase64(bytes: Uint8Array): string {
  const b = bytes as B64Bytes;
  if (typeof b.toBase64 === "function") return b.toBase64();
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const U = Uint8Array as unknown as B64Ctor;
  if (typeof U.fromBase64 === "function") return U.fromBase64(s);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function putPhotoBlob(env: Env, certId: string, key: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const bucket = r2(env);
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO photo_blobs_b64 (cert_id, data, content_type) VALUES (?, ?, ?)")
    .bind(certId, toBase64(new Uint8Array(bytes)), contentType)
    .run();
}

export async function getPhotoBlob(
  env: Env,
  cert: Ref,
): Promise<{ body: ReadableStream | Uint8Array<ArrayBuffer>; contentType: string } | null> {
  const bucket = r2(env);
  if (bucket) {
    if (!cert.r2_key) return null;
    const obj = await bucket.get(cert.r2_key);
    return obj ? { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "image/jpeg" } : null;
  }
  const row = await env.DB.prepare("SELECT data, content_type FROM photo_blobs_b64 WHERE cert_id = ?")
    .bind(cert.id)
    .first<{ data: string; content_type: string }>();
  return row ? { body: fromBase64(row.data), contentType: row.content_type } : null;
}

export async function deletePhotoBlob(env: Env, cert: Ref): Promise<void> {
  await deletePhotoBlobs(env, [cert]);
}

const R2_BULK_MAX = 1000;
const D1_BATCH_MAX = 50;

/** 여러 사진 원본을 지운다. R2는 일괄 삭제(1000개씩), D1은 배치(50개씩). */
export async function deletePhotoBlobs(env: Env, certs: Ref[]): Promise<void> {
  const bucket = r2(env);
  if (bucket) {
    const keys = certs.flatMap((c) => (c.r2_key ? [c.r2_key] : []));
    for (let i = 0; i < keys.length; i += R2_BULK_MAX) await bucket.delete(keys.slice(i, i + R2_BULK_MAX));
    return;
  }
  const stmts = certs.map((c) => env.DB.prepare("DELETE FROM photo_blobs_b64 WHERE cert_id = ?").bind(c.id));
  for (let i = 0; i < stmts.length; i += D1_BATCH_MAX) await env.DB.batch(stmts.slice(i, i + D1_BATCH_MAX));
}
