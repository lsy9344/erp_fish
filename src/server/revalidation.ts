import { revalidatePath } from "next/cache";

const dashboardAndReportPaths = [
  "/app/dashboard",
  "/app/reports/overview",
  "/app/reports/daily",
  "/app/reports/comparison",
  "/app/reports/monthly",
] as const;

const storeEntryPaths = {
  root: "/app/store-entry",
  inventory: "/app/store-entry/inventory",
  losses: "/app/store-entry/losses",
  "sales-plan": "/app/store-entry/sales-plan",
} as const;

const masterDataPaths = {
  stores: ["/app/master-data/stores", ...dashboardAndReportPaths],
  codes: [
    "/app/master-data/codes",
    "/app/dashboard",
    ...Object.values(storeEntryPaths),
  ],
  products: [
    "/app/master-data/products",
    "/app/master-data/purchase-standards",
    "/app/dashboard",
    storeEntryPaths.root,
  ],
  "purchase-standards": [
    "/app/master-data/purchase-standards",
    "/app/master-data/products",
    "/app/dashboard",
    storeEntryPaths.root,
  ],
  users: [
    "/app/master-data/users",
    "/app/master-data/stores",
    "/app/dashboard",
    storeEntryPaths.root,
  ],
  "anomaly-thresholds": [
    "/app/master-data/anomaly-thresholds",
    ...dashboardAndReportPaths,
  ],
  // WO-13(2026-06-28): 장기재고 기준일 관리 화면.
  "long-stock-thresholds": [
    "/app/master-data/long-stock-thresholds",
    ...dashboardAndReportPaths,
  ],
} as const;

export type StoreEntryRevalidationPath = keyof typeof storeEntryPaths;
export type MasterDataRevalidationKind = keyof typeof masterDataPaths;

export function revalidateDashboardAndReports() {
  revalidatePaths(dashboardAndReportPaths);
}

export function revalidateStoreEntryPaths(
  paths: readonly StoreEntryRevalidationPath[] = [
    "root",
    "inventory",
    "losses",
  ],
) {
  revalidatePaths(paths.map((path) => storeEntryPaths[path]));
}

export function revalidateLedgerDetailPath(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
}

export function revalidateEcountImportPaths(batchId?: string) {
  revalidatePath("/app/ecount-imports");

  if (batchId) {
    revalidatePath(`/app/ecount-imports/${batchId}`);
  }
}

export function revalidateMasterDataPaths(kind: MasterDataRevalidationKind) {
  revalidatePaths(masterDataPaths[kind]);
}

export function revalidateBestEffort(callback: () => void) {
  try {
    callback();
  } catch {
    // Revalidation runs after commit; keep the committed action result.
  }
}

function revalidatePaths(paths: readonly string[]) {
  for (const path of paths) {
    revalidatePath(path);
  }
}
