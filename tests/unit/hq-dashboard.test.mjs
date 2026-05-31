import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

test("HQ dashboard source files follow story 3.1 boundaries", () => {
  assertProjectFile("src", "features", "dashboard", "types.ts");
  assertProjectFile("src", "features", "dashboard", "queries.ts");
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-status-badge.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );
  assertProjectFile("src", "app", "app", "dashboard", "loading.tsx");

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "page.tsx",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "loading.tsx",
  );
  assert.match(pageSource, /requireHeadquartersUser\(/);
  assert.match(pageSource, /getHqDashboardRows\(/);
  assert.match(pageSource, /datePreset/);
  assert.doesNotMatch(pageSource, /overviewItems/);
  assert.match(tableSource, /본사 마감/);
  assert.match(tableSource, /overflow-x-auto/);
  assert.match(tableSource, /\/app\/ledgers\/\$\{row\.ledgerId\}/);
  assert.doesNotMatch(tableSource, /disabled[\s\S]*상세 준비 중/);
  assert.match(tableSource, /break-words/);
  assert.match(tableSource, /useRouter/);
  assert.match(tableSource, /onKeyDown/);
  assert.match(tableSource, /tabIndex/);
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  assert.match(detailPageSource, /requireHeadquartersUser\(/);
  assert.match(detailPageSource, /getHqLedgerDetail\(/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
});

test("HQ ledger detail shows anomaly signal details as visible text", () => {
  const summarySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(summarySource, /showDetails/);
  assert.match(summarySource, /signal\.detail/);
  assert.match(detailPageSource, /showDetails/);
});

test("HQ dashboard query keeps 미입력 rows and avoids creating ledgers", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );

  assert.match(querySource, /export\s+async\s+function\s+getHqDashboardRows/);
  assert.match(querySource, /requireHeadquartersUser\(\)/);
  assert.match(querySource, /store\.findMany\(/);
  assert.match(querySource, /isActive:\s*true/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /storeId:\s*\{\s*in:/s);
  assert.match(querySource, /closingDate/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /evaluateRevenueAnomalySignals/);
  assert.match(querySource, /evaluateInventoryLossAnomalySignals/);
  assert.match(querySource, /ledgerInventoryItems:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /previousQuantity:\s*true/);
  assert.match(querySource, /purchasedQuantity:\s*true/);
  assert.match(querySource, /currentQuantity:\s*true/);
  assert.match(querySource, /unitPrice:\s*true/);
  assert.match(querySource, /ledgerInventoryAdjustments:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /differenceQuantity:\s*true/);
  assert.match(querySource, /differenceAmount:\s*true/);
  assert.match(querySource, /ledgerLossItems:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /amount:\s*true/);
  assert.match(querySource, /quantity:\s*true/);
  assert.match(querySource, /productName:\s*true/);
  assert.match(
    querySource,
    /_count:\s*\{\s*select:\s*\{\s*ledgerLossItems:\s*true/s,
  );
  assert.doesNotMatch(querySource, /ledgerInventoryItems:\s*true/);
  assert.doesNotMatch(querySource, /ledgerInventoryAdjustments:\s*true/);
  assert.doesNotMatch(querySource, /getTodayStoreLedger(?:InTx)?\(/);
  assert.doesNotMatch(querySource, /export\s+async\s+function\s+(GET|POST)/);
});

test("HQ dashboard keeps anomaly math out of UI components", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  assert.doesNotMatch(tableSource, /salesDropRateBps/);
  assert.doesNotMatch(tableSource, /grossMarginDropBps/);
  assert.doesNotMatch(tableSource, /salesDifferenceAmount/);
  assert.doesNotMatch(tableSource, /lossAmount/);
  assert.doesNotMatch(tableSource, /inventoryDifferenceQuantity/);
  assert.doesNotMatch(tableSource, /baselineSales/);
});

test("HQ dashboard e2e setup clears story 3.2 threshold state before asserting pending signals", () => {
  const specSource = readProjectFile("tests", "e2e", "hq-dashboard.spec.ts");

  assert.match(specSource, /anomalyThresholdSetting\.deleteMany/);
  assert.match(specSource, /targetType:\s*"AnomalyThresholdSetting"/);
});

test("HQ dashboard status and date helpers map story states", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const { getDashboardDate, getDashboardDatePreset, mapDashboardLedgerStatus } =
    await import(pathToFileURL(queryPath).href);

  assert.equal(getDashboardDatePreset("yesterday"), "yesterday");
  assert.equal(getDashboardDatePreset("tomorrow"), "today");

  const today = getDashboardDate("today", new Date("2026-05-31T12:00:00Z"));
  const yesterday = getDashboardDate(
    "yesterday",
    new Date("2026-05-31T12:00:00Z"),
  );
  assert.equal(today.toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(yesterday.toISOString(), "2026-05-30T00:00:00.000Z");

  assert.deepEqual(mapDashboardLedgerStatus(null), {
    key: "EMPTY",
    label: "미입력",
  });
  assert.deepEqual(mapDashboardLedgerStatus("IN_PROGRESS"), {
    key: "IN_PROGRESS",
    label: "입력중",
  });
  assert.deepEqual(mapDashboardLedgerStatus("IN_REVIEW"), {
    key: "IN_REVIEW",
    label: "검토대기",
  });
  assert.deepEqual(mapDashboardLedgerStatus("HEADQUARTERS_CLOSED"), {
    key: "HEADQUARTERS_CLOSED",
    label: "본사마감",
  });
  assert.deepEqual(mapDashboardLedgerStatus("HOLIDAY"), {
    key: "HOLIDAY",
    label: "휴무",
  });
});
