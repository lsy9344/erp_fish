#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  buildPlaywrightArgs,
  buildPlaywrightEnv,
  getDatabaseName,
} from "./playwright-clean-env.mjs";

let env;

try {
  env = buildPlaywrightEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(
  `Playwright clean env: PORT=${env.PORT}, DB=${getDatabaseName(env.DATABASE_URL)}, reuse=${env.PW_REUSE_EXISTING_SERVER}`,
);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpm,
  ["exec", "playwright", "test", ...buildPlaywrightArgs(process.argv.slice(2))],
  {
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
