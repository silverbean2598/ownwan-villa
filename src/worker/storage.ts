import type { Env } from "./env";

/**
 * 사진 원본 저장의 단일 창구. 저장 위치(D1 / R2)는 env.PHOTO_STORAGE 로 고른다.
 * "r2" 이고 PHOTOS 바인딩이 있을 때만 R2, 그 외에는 D1(photo_blobs).
 */
type Ref = { id: string; r2_key: string | null };

function r2(env: Env): R2Bucket | null {
  return env.PHOTO_STORAGE === "r2" && env.PHOTOS ? env.PHOTOS : null;
}

export async function putPhotoBlob(env: Env, certId: string, key: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const bucket = r2(env);
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO photo_blobs (cert_id, data, content_type) VALUES (?, ?, ?)")
    .bind(certId, bytes, contentType)
    .run();
}

export async function getPhotoBlob(
  env: Env,
  cert: Ref,
): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null> {
  const bucket = r2(env);
  if (bucket) {
    if (!cert.r2_key) return null;
    const obj = await bucket.get(cert.r2_key);
    return obj ? { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "image/jpeg" } : null;
  }
  const row = await env.DB.prepare("SELECT data, content_type FROM photo_blobs WHERE cert_id = ?")
    .bind(cert.id)
    // D1은 BLOB 을 숫자 배열로 돌려준다
    .first<{ data: number[]; content_type: string }>();
  return row ? { body: new Uint8Array(row.data).buffer as ArrayBuffer, contentType: row.content_type } : null;
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
  const stmts = certs.map((c) => env.DB.prepare("DELETE FROM photo_blobs WHERE cert_id = ?").bind(c.id));
  for (let i = 0; i < stmts.length; i += D1_BATCH_MAX) await env.DB.batch(stmts.slice(i, i + D1_BATCH_MAX));
}
