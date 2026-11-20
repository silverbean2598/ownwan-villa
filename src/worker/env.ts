export type Env = {
  DB: D1Database; PHOTOS?: R2Bucket; PHOTO_STORAGE?: string; ASSETS: Fetcher;
  // 카카오 로그인 (Worker secret). 없으면 "카카오 로그인을 준비 중이에요"로 안내한다
  KAKAO_REST_API_KEY?: string; KAKAO_CLIENT_SECRET?: string; KAKAO_REDIRECT_URI?: string;
  // 휴대폰 푸시 알림 VAPID 키 (Worker secret, base64url). 없으면 설정 화면에 "알림 준비 중이에요"로 안내하고 보내지 않는다
  VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string;
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
      VAPID_PUBLIC_KEY?: string;
      VAPID_PRIVATE_KEY?: string;
      VAPID_SUBJECT?: string;
    }
  }
}
