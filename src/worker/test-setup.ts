import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

// 각 테스트 파일 시작 전에 migrations/ 를 D1에 적용한다 (이미 적용된 것은 건너뜀)
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS);
