// 정확히 지정된 잘못 생성된 지점만, 운영 기록을 건드리지 않고 정리한다.
import "./_loadenv.mjs";
import { PrismaClient } from "../generated/prisma/index.js";
import {
  describeDatabaseTarget,
  requireExplicitResetConfirmation,
} from "./destructive-script-guards.mjs";

const TARGET_STORE_NAMES = [
  "리얼수산",
  "샘플 지점",
  "정수산",
  "진수산(수산물)",
];

const BLOCKERS = [
  ["dailyLedger", "DailyLedger", "일일 장부"],
  ["inventoryOpeningSnapshot", "InventoryOpeningSnapshot", "기초 재고"],
  ["storeSalesPricePlan", "StoreSalesPricePlan", "판매가 계획"],
  ["headquartersExpense", "HeadquartersExpense", "본사 지출"],
  ["historicalDailyFact", "HistoricalDailyFact", "과거 Excel 실적"],
  [
    "historicalEmployeeDailyRole",
    "HistoricalEmployeeDailyRole",
    "과거 Excel 근무 기록",
  ],
];

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isApply = args.has("--apply");

if (isDryRun === isApply) {
  throw new Error("정확히 하나를 지정하세요: --dry-run 또는 --apply --yes");
}

if (isApply) {
  requireExplicitResetConfirmation(process.argv.slice(2), process.env);
}

const datasourceUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!datasourceUrl) {
  throw new Error("DATABASE_URL 또는 DATABASE_URL_UNPOOLED가 필요합니다.");
}

const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";
if (
  isApply &&
  environment === "production" &&
  process.env.ALLOW_PRODUCTION_STORE_CLEANUP !== "yes"
) {
  throw new Error(
    "운영 적용에는 ALLOW_PRODUCTION_STORE_CLEANUP=yes가 필요합니다.",
  );
}
const db = new PrismaClient({ datasourceUrl });

function getBlockerModels(client) {
  return BLOCKERS.filter(
    ([model]) => typeof client[model]?.count === "function",
  );
}

async function preflight(client, store) {
  const blockers = [];
  for (const [model, , label] of getBlockerModels(client)) {
    const count = await client[model].count({ where: { storeId: store.id } });
    if (count > 0) blockers.push(`${label} ${count}건`);
  }
  const [ecountImportLines, aliases, assignments] = await Promise.all([
    client.ecountImportLine.count({ where: { storeId: store.id } }),
    client.storeExternalAlias.count({ where: { storeId: store.id } }),
    client.userStoreAssignment.count({ where: { storeId: store.id } }),
  ]);
  return { blockers, ecountImportLines, aliases, assignments };
}

async function main() {
  const target = describeDatabaseTarget(datasourceUrl, process.env);
  const stores = await db.store.findMany({
    where: { name: { in: TARGET_STORE_NAMES } },
    select: { id: true, name: true, isActive: true },
  });
  const found = new Set(stores.map((store) => store.name));
  const missing = TARGET_STORE_NAMES.filter((name) => !found.has(name));
  console.log(`대상 DB: ${target.host}/${target.database}`);
  if (missing.length) console.log(`없어서 건너뜀: ${missing.join(", ")}`);

  const plans = [];
  for (const store of stores) {
    const preflightResult = await preflight(db, store);
    plans.push({ store, ...preflightResult });
    console.log(`${store.name}:`, preflightResult);
  }

  if (isDryRun) {
    console.log("🟡 --dry-run: 삭제하지 않았습니다.");
    return;
  }

  const skipped = plans
    .filter((plan) => plan.blockers.length > 0)
    .map((plan) => ({ store: plan.store, blockers: plan.blockers }));
  const deletable = plans.filter((plan) => plan.blockers.length === 0);
  const deleted = [];

  // 한 지점에 새 보호 기록이 생겨도 다른 안전한 지점까지 되돌리지 않는다.
  for (const { store } of deletable) {
    try {
      const result = await db.$transaction(async (tx) => {
        const current = await tx.store.findUnique({
          where: { id: store.id },
          select: { id: true, name: true, isActive: true },
        });
        if (!current) return { status: "missing" };

        const latest = await preflight(tx, current);
        if (latest.blockers.length > 0) {
          return { status: "blocked", blockers: latest.blockers };
        }

        // raw 이카운트 행은 보존하고 현재 지점 매핑만 해제한다.
        await tx.ecountImportLine.updateMany({
          where: { storeId: current.id },
          data: { storeId: null },
        });
        // aliases/assignments는 기준정보 설정값이며 Store의 Cascade로 함께 정리된다.
        await tx.store.delete({ where: { id: current.id } });
        return { status: "deleted" };
      });

      if (result.status === "deleted") deleted.push(store);
      if (result.status === "blocked") {
        skipped.push({ store, blockers: result.blockers });
      }
    } catch (error) {
      if (error?.code === "P2003") {
        skipped.push({
          store,
          blockers: ["점검 뒤 보호 기록이 생겨 삭제를 중단함"],
        });
        continue;
      }
      throw error;
    }
  }

  console.log(
    `삭제 완료: ${deleted.map((store) => store.name).join(", ") || "없음"}`,
  );
  if (skipped.length) {
    console.log(
      `보호 기록으로 건너뜀: ${skipped
        .map(({ store, blockers }) => `${store.name} (${blockers.join(", ")})`)
        .join(", ")}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
