const RESETTABLE_DATABASE_NAME_PATTERN =
  /(test|e2e|dev|local|staging|sandbox)/i;

function getEnvironmentName(env = process.env) {
  return env.VERCEL_ENV ?? env.NODE_ENV ?? "";
}

function parseDatabaseUrl(databaseUrl) {
  try {
    return new URL(databaseUrl);
  } catch {
    throw new Error("Invalid DATABASE_URL for destructive reset.");
  }
}

function isLocalDatabaseHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function requireResettableDatabaseUrl(databaseUrl, env = process.env) {
  const environment = getEnvironmentName(env);

  if (environment === "production") {
    throw new Error(
      `production environment (${environment}) refusing destructive reset.`,
    );
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for destructive reset.");
  }

  const url = parseDatabaseUrl(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  if (
    !isLocalDatabaseHost(url.hostname) &&
    env.ALLOW_REMOTE_DESTRUCTIVE_RESET !== "yes"
  ) {
    throw new Error(
      `Remote database host "${url.host}" requires ALLOW_REMOTE_DESTRUCTIVE_RESET=yes.`,
    );
  }

  if (
    !RESETTABLE_DATABASE_NAME_PATTERN.test(databaseName) &&
    env.ALLOW_DESTRUCTIVE_DATABASE_RESET !== "yes"
  ) {
    throw new Error(
      `Database name "${databaseName}" is not marked as resettable.`,
    );
  }

  return databaseUrl;
}

export function requireExplicitResetConfirmation(args, env = process.env) {
  if (args.includes("--yes") || env.CONFIRM_RESET === "yes") {
    return true;
  }

  throw new Error(
    "Missing confirmation flag. Pass --yes or set CONFIRM_RESET=yes.",
  );
}

export function describeDatabaseTarget(databaseUrl, env = process.env) {
  const environment = getEnvironmentName(env) || "(unset)";
  let host = "(unknown)";
  let database = "(unknown)";

  try {
    const url = new URL(databaseUrl ?? "");
    host = url.host || host;
    database = url.pathname.replace(/^\//, "") || database;
  } catch {
    // Informational only.
  }

  return { database, environment, host };
}
