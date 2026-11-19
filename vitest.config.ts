import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // 운영 설정은 R2 없이 D1 저장. 테스트는 R2 백엔드를 기본으로 쓰고 storage.test.ts 가 둘 다 확인한다
            // MIGTEST: 0010 이전 모양의 데이터에 마이그레이션을 적용해 보는 빈 D1 (migration.test.ts)
            miniflare: { r2Buckets: ["PHOTOS"], d1Databases: ["MIGTEST"], bindings: { TEST_MIGRATIONS: migrations, PHOTO_STORAGE: "r2" } },
          }),
        ],
        test: {
          name: "worker",
          include: ["src/worker/**/*.test.ts"],
          setupFiles: ["./src/worker/test-setup.ts"],
        },
      },
      {
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/shared/**/*.test.ts", "src/web/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
