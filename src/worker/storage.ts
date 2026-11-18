import type { Env } from "./env";

/** 사진 파일 삭제. 사진 저장 위치가 바뀌면 여기만 고친다. */
export async function deletePhotoBlob(env: Env, cert: { r2_key: string | null }): Promise<void> {
  if (cert.r2_key) await env.PHOTOS.delete(cert.r2_key);
}
