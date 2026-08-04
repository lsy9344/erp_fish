// 모든 지점의 재입력 대상 운영 데이터를 초기화합니다.
// 보존: 지점, 사용자/권한, 상품/코드/직원 마스터, 본사 지출, 이카운트 원본 및 감사 로그.
// 삭제: 일일 장부와 하위 입력, 재고 기초 스냅샷, 지점 판매가 계획.
import "./_loadenv.mjs";
import { PrismaClient } from "../generated/prisma/index.js";
import {
  describeDatabaseTarget,
  requireExplicitResetConfirmation,
  requireResettableDatabaseUrl,
} from "./destructive-script-guards.mjs";

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const requestedStoreNames = [...args]
  .filter((arg) => arg.startsWith("--store="))
  .map((arg) => arg.slice("--store=".length));
const resetAllStores = args.has("--scope=all-stores");

if (resetAllStores === requestedStoreNames.length > 0) {
  throw new Error(
    "Specify exactly one scope: --scope=all-stores or one or more --store=<store-name>.",
  );
}

if (!isDryRun) {
  requireExplicitResetConfirmation(process.argv.slice(2), process.env);
}

const datasourceUrl = requireResettableDatabaseUrl(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  process.env,
);
const db = new PrismaClient({ datasourceUrl });

function directStoreFilter(storeIds) {
  return storeIds ? { storeId: { in: storeIds } } : {};
}

function ledgerFilter(storeIds) {
  return storeIds ? { dailyLedger: directStoreFilter(storeIds) } : {};
}

const resetSteps = [
  [
    "LedgerInventoryCarryoverDetail",
    (tx) => tx.ledgerInventoryCarryoverDetail,
    (storeIds) =>
      storeIds ? { ledgerInventoryItem: ledgerFilter(storeIds) } : {},
  ],
  ["LedgerInventoryFifoLot", (tx) => tx.ledgerInventoryFifoLot, ledgerFilter],
  [
    "LedgerInventoryAdjustment",
    (tx) => tx.ledgerInventoryAdjustment,
    ledgerFilter,
  ],
  ["LedgerLossItem", (tx) => tx.ledgerLossItem, ledgerFilter],
  ["LedgerInventoryItem", (tx) => tx.ledgerInventoryItem, ledgerFilter],
  ["LedgerPurchaseItem", (tx) => tx.ledgerPurchaseItem, ledgerFilter],
  ["LedgerExpense", (tx) => tx.ledgerExpense, ledgerFilter],
  ["LedgerLaborItem", (tx) => tx.ledgerLaborItem, ledgerFilter],
  ["CorrectionRecord", (tx) => tx.correctionRecord, ledgerFilter],
  ["DailyLedger", (tx) => tx.dailyLedger, directStoreFilter],
  ["StoreSalesPricePlan", (tx) => tx.storeSalesPricePlan, directStoreFilter],
  [
    "InventoryOpeningSnapshot",
    (tx) => tx.inventoryOpeningSnapshot,
    directStoreFilter,
  ],
];

async function getScope(client) {
  if (resetAllStores) {
    return { label: "전체 지점", storeIds: null };
  }

  const uniqueNames = [...new Set(requestedStoreNames)];
  const stores = await client.store.findMany({
    where: { name: { in: uniqueNames } },
    select: { id: true, name: true },
  });
  const foundNames = new Set(stores.map((store) => store.name));
  const missingNames = uniqueNames.filter((name) => !foundNames.has(name));

  if (missingNames.length > 0) {
    throw new Error(`Store not found: ${missingNames.join(", ")}`);
  }

  return {
    label: stores
      .map((store) => store.name)
      .sort()
      .join(", "),
    storeIds: stores.map((store) => store.id),
  };
}

async function getCounts(client, storeIds) {
  return Object.fromEntries(
    await Promise.all(
      resetSteps.map(async ([tableName, modelFor, whereFor]) => [
        tableName,
        await modelFor(client).count({ where: whereFor(storeIds) }),
      ]),
    ),
  );
}

async function main() {
  const target = describeDatabaseTarget(datasourceUrl, process.env);
  const scope = await getScope(db);
  const beforeCounts = await getCounts(db, scope.storeIds);

  console.log(
    `대상 DB: ${target.host}/${target.database} · 환경: ${target.environment}`,
  );
  console.log(`삭제 대상(${scope.label}):`, beforeCounts);
  console.log(
    "보존: 지점·계정·권한·상품/코드/직원 마스터, 본사 지출, 이카운트 원본, 감사 로그",
  );

  if (isDryRun) {
    console.log("🟡 --dry-run: 실제 삭제 없이 종료합니다.");
    return;
  }

  const deletedCounts = await db.$transaction(async (tx) => {
    const counts = {};
    for (const [tableName, modelFor, whereFor] of resetSteps) {
      counts[tableName] = (
        await modelFor(tx).deleteMany({ where: whereFor(scope.storeIds) })
      ).count;
    }
    return counts;
  });
  const afterCounts = await getCounts(db, scope.storeIds);

  if (Object.values(afterCounts).some((count) => count !== 0)) {
    throw new Error(
      `Reset verification failed: expected zero rows, got ${JSON.stringify(afterCounts)}`,
    );
  }

  console.log("삭제 완료:", deletedCounts);
  console.log("검증 완료: 모든 초기화 대상 테이블이 0건입니다.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
