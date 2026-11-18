export type Env = { DB: D1Database; PHOTOS: R2Bucket; ASSETS: Fetcher };
export type AppEnv = { Bindings: Env; Variables: { userId: string } };

// `cloudflare:workers` 의 env 도 같은 타입으로 (테스트에서 사용)
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      PHOTOS: R2Bucket;
      ASSETS: Fetcher;
    }
  }
}
