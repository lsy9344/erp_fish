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
  globalSetup: "./tests/e2e/global-setup.ts",
  expect: {
    timeout: 15_000,
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
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
