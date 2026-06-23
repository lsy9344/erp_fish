import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3102);
const baseURL = `http://localhost:${port}`;
const databaseURL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e";
const reuseExistingServer =
  !process.env.CI && process.env.PW_REUSE_EXISTING_SERVER === "1";

process.env.DATABASE_URL = databaseURL;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "api/**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: process.env.CI ? 60_000 : 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  expect: {
    timeout: process.env.CI ? 25_000 : 15_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `corepack pnpm dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "test-auth-secret-at-least-32-characters",
      AUTH_URL: baseURL,
      DATABASE_URL: databaseURL,
      SKIP_ENV_VALIDATION: "1",
      // WO-10(2026-06-22): LINE 아침 요약 알림 API 테스트 구성.
      // INTERNAL_CRON_SECRET로 인증을 검증하고, LINE 전송은 로컬 스텁(/api/test/line-stub)으로
      // 우회하여 실제 LINE 채널 없이 전송 성공·전송 로그 기록 경로를 검증한다.
      INTERNAL_CRON_SECRET: "test-internal-cron-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "test-line-channel-token",
      LINE_MORNING_SUMMARY_RECIPIENT_IDS: "U-test-exec-1,U-test-exec-2",
      LINE_API_BASE_URL: `${baseURL}/api/test/line-stub`,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
