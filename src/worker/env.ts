export type Env = {
  DB: D1Database; PHOTOS?: R2Bucket; PHOTO_STORAGE?: string; ASSETS: Fetcher;
  // 카카오 로그인 (Worker secret). 없으면 "카카오 로그인을 준비 중이에요"로 안내한다
  KAKAO_REST_API_KEY?: string; KAKAO_CLIENT_SECRET?: string; KAKAO_REDIRECT_URI?: string;
};
export type AppEnv = { Bindings: Env; Variables: { userId: string } };

// `cloudflare:workers` 의 env 도 같은 타입으로 (테스트에서 사용)
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      PHOTOS: R2Bucket;
      PHOTO_STORAGE?: string;
      ASSETS: Fetcher;
      KAKAO_REST_API_KEY?: string;
      KAKAO_CLIENT_SECRET?: string;
      KAKAO_REDIRECT_URI?: string;
    }
  }
}
