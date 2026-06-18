import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlaywrightEnv,
  DEFAULT_PLAYWRIGHT_DATABASE_URL,
  DEFAULT_PLAYWRIGHT_PORT,
  getDatabaseName,
} from "../../scripts/playwright-clean-env.mjs";

describe("playwright clean environment", () => {
  it("ignores inherited DATABASE_URL and uses the dedicated e2e database", () => {
    const env = buildPlaywrightEnv({
      DATABASE_URL: "postgresql://postgres:pw@localhost:5432/rider",
    });

    assert.equal(env.DATABASE_URL, DEFAULT_PLAYWRIGHT_DATABASE_URL);
    assert.equal(getDatabaseName(env.DATABASE_URL), "erp_fish_e2e");
    assert.equal(env.PORT, DEFAULT_PLAYWRIGHT_PORT);
    assert.equal(env.AUTH_URL, `http://localhost:${DEFAULT_PLAYWRIGHT_PORT}`);
    assert.equal(env.SKIP_ENV_VALIDATION, "1");
  });

  it("allows an explicit test database override", () => {
    const env = buildPlaywrightEnv({
      PLAYWRIGHT_DATABASE_URL:
        "postgresql://postgres:pw@localhost:5432/erp_fish_test_branch",
      PORT: "3199",
    });

    assert.equal(getDatabaseName(env.DATABASE_URL), "erp_fish_test_branch");
    assert.equal(env.PORT, "3199");
    assert.equal(env.AUTH_URL, "http://localhost:3199");
  });

  it("rejects an explicit non-test database override", () => {
    assert.throws(
      () =>
        buildPlaywrightEnv({
          PLAYWRIGHT_DATABASE_URL:
            "postgresql://postgres:pw@localhost:5432/erp_fish",
        }),
      /Refusing to run Playwright against non-test database "erp_fish"/,
    );
  });
});
