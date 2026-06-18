export const DEFAULT_PLAYWRIGHT_PORT = "3102";
export const DEFAULT_PLAYWRIGHT_DATABASE_URL =
  "postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e";
export const DEFAULT_PLAYWRIGHT_AUTH_SECRET =
  "test-auth-secret-at-least-32-characters";

export function getDatabaseName(databaseUrl) {
  return new URL(databaseUrl).pathname.replace(/^\//, "");
}

export function requireTestDatabase(databaseUrl) {
  const databaseName = getDatabaseName(databaseUrl);

  if (!/(test|e2e)/i.test(databaseName)) {
    throw new Error(
      `Refusing to run Playwright against non-test database "${databaseName}".`,
    );
  }

  return databaseUrl;
}

export function buildPlaywrightEnv(sourceEnv = process.env) {
  const port = sourceEnv.PORT || DEFAULT_PLAYWRIGHT_PORT;
  const databaseUrl = requireTestDatabase(
    sourceEnv.PLAYWRIGHT_DATABASE_URL || DEFAULT_PLAYWRIGHT_DATABASE_URL,
  );

  return {
    ...sourceEnv,
    PORT: port,
    AUTH_SECRET: sourceEnv.AUTH_SECRET || DEFAULT_PLAYWRIGHT_AUTH_SECRET,
    AUTH_URL: `http://localhost:${port}`,
    DATABASE_URL: databaseUrl,
    SKIP_ENV_VALIDATION: "1",
    PW_REUSE_EXISTING_SERVER: sourceEnv.PW_REUSE_EXISTING_SERVER || "0",
  };
}
