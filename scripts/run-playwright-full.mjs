#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getFullE2EGroup } from "./playwright-full-groups.mjs";

const [option, id, ...args] = process.argv.slice(2);
const cleanRunner = fileURLToPath(
  new URL("./run-playwright-clean.mjs", import.meta.url),
);
if (option !== "--group") {
  console.error(
    "Usage: node scripts/run-playwright-full.mjs --group 1 [Playwright options]",
  );
  process.exit(1);
}

let group;
try {
  group = getFullE2EGroup(id);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// A manual filter may select tests in only one group. First require a match in
// the complete suite, so a typo cannot turn the whole workflow falsely green.
const grepIndex = args.indexOf("--grep");
if (grepIndex !== -1) {
  const collection = spawnSync(
    process.execPath,
    [
      cleanRunner,
      "tests/e2e",
      "--grep",
      args[grepIndex + 1] ?? "",
      "--list",
      "--reporter=line",
    ],
    { encoding: "utf8", env: process.env },
  );
  if (collection.error || collection.status !== 0) {
    console.error(
      collection.error?.message ?? collection.stdout + collection.stderr,
    );
    process.exit(collection.status || 1);
  }
  args.push("--pass-with-no-tests");
}

function resourceSample() {
  const pressure = {};
  for (const resource of ["cpu", "memory", "io"]) {
    try {
      pressure[resource] = readFileSync(
        `/proc/pressure/${resource}`,
        "utf8",
      ).trim();
    } catch {
      // Pressure metrics are Linux-only; local runs also work on other systems.
    }
  }
  const sample = {
    time: new Date().toISOString(),
    group: group.id,
    serverMode: group.serverMode,
    load: os.loadavg(),
    freeMemoryMiB: Math.round(os.freemem() / 1024 ** 2),
    pressure,
  };
  const line = JSON.stringify(sample);
  console.log(`[ci-resources] ${line}`);
  if (process.env.PW_RESOURCE_LOG) {
    mkdirSync(path.dirname(process.env.PW_RESOURCE_LOG), { recursive: true });
    appendFileSync(process.env.PW_RESOURCE_LOG, `${line}\n`);
  }
}

console.log(
  `Full E2E group ${group.id}: ${group.serverMode}, ${group.specs.length} specs`,
);
resourceSample();
const timer = setInterval(resourceSample, 30_000);
const child = spawn(process.execPath, [cleanRunner, ...group.specs, ...args], {
  env: { ...process.env, NODE_ENV: "test", PW_SERVER_MODE: group.serverMode },
  stdio: "inherit",
});
child.on("error", (error) => {
  clearInterval(timer);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  clearInterval(timer);
  resourceSample();
  process.exitCode = code ?? 1;
});
