#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  activateHistoricalBatch,
  disconnectHistoricalImportDb,
  rollbackHistoricalBatch,
  stageHistoricalWorkbook,
} from "../src/features/historical-excel/import-service.ts";
import { parseHistoricalWorkbook } from "../src/features/historical-excel/parser.ts";

function usage() {
  console.error(`사용법:
  pnpm historical:import -- --dry-run <xlsx>
  pnpm historical:import -- --stage <xlsx> --actor <owner-user-id>
  pnpm historical:import -- --activate [batch-id] --actor <owner-user-id>
  pnpm historical:import -- --rollback [active-batch-id] --actor <owner-user-id>

주의: dry-run이 승인 기준과 다르면 stage하지 않고 종료합니다.`);
}

async function parseFile(filePath) {
  const resolved = path.resolve(filePath);
  const bytes = await readFile(resolved);
  return parseHistoricalWorkbook({
    fileBytes: bytes,
    sourceFileName: path.basename(resolved),
  });
}

function printSummary(parsed) {
  console.log(
    JSON.stringify(
      {
        ...parsed.summary,
        validation:
          parsed.validationErrors.length === 0 ? "APPROVED" : "MISMATCH",
        validationErrors: parsed.validationErrors,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const actorIndex = args.indexOf("--actor");
  const actorId = actorIndex >= 0 ? args[actorIndex + 1] : undefined;
  if (actorIndex >= 0) args.splice(actorIndex, 2);
  const [command, argument] = args;
  const requireActorId = () => {
    if (!actorId) {
      throw new Error(
        "stage/activate/rollback에는 --actor <owner-user-id>가 필요합니다.",
      );
    }
    return actorId;
  };

  if (command === "--dry-run") {
    if (!argument) {
      usage();
      process.exitCode = 1;
      return;
    }
    const parsed = await parseFile(argument);
    printSummary(parsed);
    if (parsed.validationErrors.length > 0) process.exitCode = 2;
    return;
  }

  if (command === "--stage") {
    if (!argument) {
      usage();
      process.exitCode = 1;
      return;
    }
    const parsed = await parseFile(argument);
    printSummary(parsed);
    if (parsed.validationErrors.length > 0) {
      process.exitCode = 2;
      return;
    }
    console.log(
      JSON.stringify(
        await stageHistoricalWorkbook(parsed, requireActorId()),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "--activate") {
    console.log(
      JSON.stringify(
        await activateHistoricalBatch(argument || undefined, requireActorId()),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "--rollback") {
    console.log(
      JSON.stringify(
        await rollbackHistoricalBatch(argument || undefined, requireActorId()),
        null,
        2,
      ),
    );
    return;
  }

  usage();
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await disconnectHistoricalImportDb();
}
