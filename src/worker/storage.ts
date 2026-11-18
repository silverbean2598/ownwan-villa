import type { Env } from "./env";

/** 사진 파일 삭제. 사진 저장 위치가 바뀌면 여기만 고친다. */
export async function deletePhotoBlob(env: Env, cert: { r2_key: string | null }): Promise<void> {
  await deletePhotoBlobs(env, [cert]);
}

const R2_BULK_MAX = 1000;

/** 여러 사진 파일을 R2 일괄 삭제(최대 1000개씩)로 지운다. */
export async function deletePhotoBlobs(env: Env, certs: { r2_key: string | null }[]): Promise<void> {
  const keys = certs.flatMap((c) => (c.r2_key ? [c.r2_key] : []));
  for (let i = 0; i < keys.length; i += R2_BULK_MAX) await env.PHOTOS.delete(keys.slice(i, i + R2_BULK_MAX));
}
