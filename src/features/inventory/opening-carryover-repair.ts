type OpeningCarryoverDetail = {
  source: string;
  status: string;
  resolvedQuantity: number;
  sourceLedgerId: string | null;
  sourceLedgerClosingDate: string | null;
  sourceLedgerStatus: string | null;
  sourceYearMonth: string | null;
  sourceSnapshotId: string | null;
  sourcePreviousQuantity: number | null;
  sourcePurchasedQuantity: number | null;
  sourceLossQuantity: number | null;
  sourceCurrentQuantity: number | null;
  sourceQuantity: number | null;
  message: string;
  history?: unknown[];
};

type RepairAuditItem = {
  id: string;
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  inventoryAmount: number | null;
  isModified: boolean;
  carryoverSource: string;
  carryoverStatus: string;
  carryoverLedgerId: string | null;
  previousQuantityDetail: OpeningCarryoverDetail;
};

type RepairCurrentItem = Omit<RepairAuditItem, "previousQuantityDetail"> & {
  previousQuantityDetail: OpeningCarryoverDetail | null;
};

type RepairSnapshot = {
  id: string;
  productId: string;
  yearMonth: string;
  quantity: number;
};

type RepairProtectedLedger = {
  id: string;
  storeId: string;
  closingDate: string;
  status: string;
  version: number;
  authorDisplayName: string | null;
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  workMemo: string | null;
  submittedById: string | null;
  submittedAt: string | null;
  closedById: string | null;
  closedAt: string | null;
  lossReviewedById: string | null;
  lossReviewedAt: string | null;
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
};

type RepairProtectedInventoryItem = {
  id: string;
  productId: string;
  currentQuantity: number | null;
  quantity: number | null;
};

type RepairProtectedState = {
  ledger: RepairProtectedLedger;
  inventoryItems: RepairProtectedInventoryItem[];
};

const persistedDetailKeys = [
  "source",
  "status",
  "resolvedQuantity",
  "sourceLedgerId",
  "sourceLedgerClosingDate",
  "sourceLedgerStatus",
  "sourceYearMonth",
  "sourceSnapshotId",
  "sourcePreviousQuantity",
  "sourcePurchasedQuantity",
  "sourceLossQuantity",
  "sourceCurrentQuantity",
  "sourceQuantity",
  "message",
] as const;

const protectedLedgerScalarKeys = [
  "id",
  "storeId",
  "closingDate",
  "status",
  "authorDisplayName",
  "totalSalesAmount",
  "cashAmount",
  "cardAmount",
  "otherPaymentAmount",
  "workerCount",
  "workMemo",
  "submittedById",
  "submittedAt",
  "closedById",
  "closedAt",
  "lossReviewedById",
  "lossReviewedAt",
  "createdById",
  "updatedById",
  "createdAt",
] as const;

export const OPENING_CARRYOVER_REPAIR_INCIDENT_DATE = "2026-07-11";
export const OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES = [
  "제일수산",
  "삼국유통",
  "강서수산",
] as const;

const openingCarryoverIncidentStoreItemCounts = {
  제일수산: 25,
  삼국유통: 25,
  강서수산: 21,
} as const;

function requireOpeningCarryoverIncidentDate(date: string) {
  if (date !== OPENING_CARRYOVER_REPAIR_INCIDENT_DATE) {
    evidenceMismatch(
      `repair date must be ${OPENING_CARRYOVER_REPAIR_INCIDENT_DATE}`,
    );
  }
}

export function assertOpeningCarryoverIncidentTargets({
  date,
  targets,
}: {
  date: string;
  targets: Array<{ storeName: string }>;
}) {
  requireOpeningCarryoverIncidentDate(date);

  const seenStoreNames = new Set<string>();

  for (const target of targets) {
    if (
      seenStoreNames.has(target.storeName) ||
      !Object.hasOwn(openingCarryoverIncidentStoreItemCounts, target.storeName)
    ) {
      evidenceMismatch(`unexpected or duplicate store: ${target.storeName}`);
    }

    seenStoreNames.add(target.storeName);
  }

  if (
    targets.length !== OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES.length ||
    OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES.some(
      (storeName) => !seenStoreNames.has(storeName),
    )
  ) {
    evidenceMismatch("incident target stores are incomplete");
  }
}

export function assertOpeningCarryoverIncidentPlans({
  date,
  plans,
}: {
  date: string;
  plans: Array<{
    storeName: string;
    createCount: number;
    updateCount: number;
    skipCount: number;
  }>;
}) {
  assertOpeningCarryoverIncidentTargets({ date, targets: plans });

  let totalItemCount = 0;

  for (const plan of plans) {
    const counts = [plan.createCount, plan.updateCount, plan.skipCount];

    if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
      evidenceMismatch(`${plan.storeName}: repair plan counts are invalid`);
    }

    const itemCount = counts.reduce((sum, count) => sum + count, 0);
    const expectedItemCount =
      openingCarryoverIncidentStoreItemCounts[
        plan.storeName as keyof typeof openingCarryoverIncidentStoreItemCounts
      ];

    if (itemCount !== expectedItemCount) {
      evidenceMismatch(
        `${plan.storeName}: expected ${expectedItemCount} opening items, found ${itemCount}`,
      );
    }

    totalItemCount += itemCount;
  }

  if (totalItemCount !== 71) {
    evidenceMismatch(`expected 71 opening items, found ${totalItemCount}`);
  }
}

function isValidDateString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function parseOpeningCarryoverRepairOptions(
  args: string[],
  env: Record<string, string | undefined>,
) {
  const unknownArgument = args.find(
    (arg) =>
      arg !== "--dry-run" && arg !== "--yes" && !arg.startsWith("--date="),
  );

  if (unknownArgument) {
    throw new Error(`Unknown argument: ${unknownArgument}.`);
  }

  const dateArgs = args.filter((arg) => arg.startsWith("--date="));
  const dryRunCount = args.filter((arg) => arg === "--dry-run").length;
  const confirmedCount = args.filter((arg) => arg === "--yes").length;

  if (dateArgs.length > 1) {
    throw new Error("Duplicate argument: --date.");
  }

  if (dryRunCount > 1) {
    throw new Error("Duplicate argument: --dry-run.");
  }

  if (confirmedCount > 1) {
    throw new Error("Duplicate argument: --yes.");
  }

  const date =
    dateArgs.length === 1 ? (dateArgs[0]?.slice("--date=".length) ?? "") : "";

  if (!isValidDateString(date)) {
    throw new Error("Missing or invalid --date=YYYY-MM-DD.");
  }

  if (date !== OPENING_CARRYOVER_REPAIR_INCIDENT_DATE) {
    throw new Error(
      `This repair only supports ${OPENING_CARRYOVER_REPAIR_INCIDENT_DATE}.`,
    );
  }

  const isDryRun = dryRunCount === 1;
  const isConfirmed = confirmedCount === 1;

  if (isDryRun === isConfirmed) {
    throw new Error("Pass exactly one repair mode: --dry-run or --yes.");
  }

  const datasourceUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;

  if (!datasourceUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  let databaseUrl: URL;

  try {
    databaseUrl = new URL(datasourceUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }

  if (
    !isDryRun &&
    !isLocalHost(databaseUrl.hostname) &&
    env.ALLOW_REMOTE_INVENTORY_REPAIR !== "yes"
  ) {
    throw new Error(
      "Remote repair requires ALLOW_REMOTE_INVENTORY_REPAIR=yes.",
    );
  }

  return {
    date,
    closingDate: new Date(`${date}T00:00:00.000Z`),
    yearMonth: date.slice(0, 7),
    isDryRun,
    datasourceUrl,
    host: databaseUrl.hostname,
    database: databaseUrl.pathname.replace(/^\//, ""),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function evidenceMismatch(message?: string): never {
  throw new Error(
    message ? `EVIDENCE_MISMATCH: ${message}` : "EVIDENCE_MISMATCH",
  );
}

export function assertOpeningCarryoverRepairProtectedState({
  before,
  after,
  plan,
}: {
  before: RepairProtectedState;
  after: RepairProtectedState;
  plan: {
    creates: Array<{
      productId: string;
      currentQuantity: number | null;
      quantity: number | null;
    }>;
    updates: unknown[];
  };
}) {
  for (const key of protectedLedgerScalarKeys) {
    if (before.ledger[key] !== after.ledger[key]) {
      evidenceMismatch(`protected ledger field changed: ${key}`);
    }
  }

  const changed = plan.creates.length > 0 || plan.updates.length > 0;
  const expectedVersion = before.ledger.version + (changed ? 1 : 0);

  if (after.ledger.version !== expectedVersion) {
    evidenceMismatch("ledger version transition differs");
  }

  if (changed) {
    const beforeUpdatedAt = Date.parse(before.ledger.updatedAt);
    const afterUpdatedAt = Date.parse(after.ledger.updatedAt);

    if (
      !Number.isFinite(beforeUpdatedAt) ||
      !Number.isFinite(afterUpdatedAt) ||
      afterUpdatedAt <= beforeUpdatedAt
    ) {
      evidenceMismatch("ledger updatedAt did not advance");
    }
  } else if (after.ledger.updatedAt !== before.ledger.updatedAt) {
    evidenceMismatch("unchanged ledger updatedAt differs");
  }

  const beforeById = new Map<string, RepairProtectedInventoryItem>();
  const afterById = new Map<string, RepairProtectedInventoryItem>();

  for (const item of before.inventoryItems) {
    if (beforeById.has(item.id)) {
      evidenceMismatch(`duplicate existing inventory row: ${item.id}`);
    }

    beforeById.set(item.id, item);
  }

  for (const item of after.inventoryItems) {
    if (afterById.has(item.id)) {
      evidenceMismatch(`duplicate resulting inventory row: ${item.id}`);
    }

    afterById.set(item.id, item);
  }

  for (const item of before.inventoryItems) {
    const current = afterById.get(item.id);

    if (
      current?.productId !== item.productId ||
      current?.currentQuantity !== item.currentQuantity ||
      current?.quantity !== item.quantity
    ) {
      evidenceMismatch(`existing inventory row changed: ${item.id}`);
    }
  }

  const createdItems = after.inventoryItems.filter(
    (item) => !beforeById.has(item.id),
  );

  if (createdItems.length !== plan.creates.length) {
    evidenceMismatch("created inventory row count differs");
  }

  const plannedCreatesByProductId = new Map(
    plan.creates.map((create) => [create.productId, create]),
  );

  if (plannedCreatesByProductId.size !== plan.creates.length) {
    evidenceMismatch("duplicate planned inventory product");
  }

  const createdProductIds = new Set<string>();

  for (const item of createdItems) {
    const planned = plannedCreatesByProductId.get(item.productId);

    if (
      !planned ||
      createdProductIds.has(item.productId) ||
      item.currentQuantity !== planned.currentQuantity ||
      item.quantity !== planned.quantity
    ) {
      evidenceMismatch(`created inventory row differs: ${item.productId}`);
    }

    createdProductIds.add(item.productId);
  }
}

export function requireOpeningCarryoverAuditEvidence({
  audit,
  ledger,
  closingDate,
}: {
  audit: unknown;
  ledger: { id: string; storeId: string; storeName: string };
  closingDate: Date;
}) {
  if (
    !isJsonObject(audit) ||
    typeof audit.actorId !== "string" ||
    audit.actorId.trim().length === 0 ||
    !isJsonObject(audit.before)
  ) {
    evidenceMismatch(
      `${ledger.storeName}: first inventory-save audit is invalid`,
    );
  }

  const before = audit.before;

  if (
    before.id !== ledger.id ||
    before.storeId !== ledger.storeId ||
    before.closingDate !== closingDate.toISOString() ||
    !Array.isArray(before.items)
  ) {
    evidenceMismatch(
      `${ledger.storeName}: inventory-save audit target differs`,
    );
  }

  const auditItems: unknown[] = before.items;

  if (auditItems.some((item) => !isJsonObject(item))) {
    evidenceMismatch(
      `${ledger.storeName}: inventory-save audit item is invalid`,
    );
  }

  const openingItems = auditItems.filter(
    (item): item is Record<string, unknown> =>
      isJsonObject(item) && item.carryoverSource === "OPENING_SNAPSHOT",
  );

  if (openingItems.length === 0) {
    evidenceMismatch(`${ledger.storeName}: opening audit evidence is missing`);
  }

  for (const item of openingItems) {
    if (
      typeof item.id !== "string" ||
      typeof item.productId !== "string" ||
      typeof item.productName !== "string" ||
      typeof item.productCategory !== "string" ||
      typeof item.productSpec !== "string" ||
      typeof item.unitPrice !== "number" ||
      typeof item.previousQuantity !== "number" ||
      (item.currentQuantity !== null &&
        typeof item.currentQuantity !== "number") ||
      (item.quantity !== null && typeof item.quantity !== "number") ||
      typeof item.isModified !== "boolean" ||
      !isJsonObject(item.previousQuantityDetail)
    ) {
      evidenceMismatch(`${ledger.storeName}: opening audit item is malformed`);
    }
  }

  return {
    actorId: audit.actorId,
    auditItems: openingItems as RepairAuditItem[],
  };
}

function uniqueByProductId<T extends { productId: string }>(rows: T[]) {
  const byProductId = new Map<string, T>();

  for (const row of rows) {
    if (byProductId.has(row.productId)) {
      evidenceMismatch();
    }

    byProductId.set(row.productId, row);
  }

  return byProductId;
}

function hasSamePersistedDetail(
  current: OpeningCarryoverDetail | null,
  audited: OpeningCarryoverDetail,
) {
  return (
    current !== null &&
    persistedDetailKeys.every((key) => current[key] === audited[key])
  );
}

function hasGroundedOpeningDetail(
  item: RepairAuditItem,
  snapshot: RepairSnapshot,
) {
  const detail = item.previousQuantityDetail;

  return (
    detail.source === "OPENING_SNAPSHOT" &&
    detail.status === "OPENING_CARRYOVER" &&
    detail.sourceLedgerId === null &&
    detail.sourceLedgerClosingDate === null &&
    detail.sourceLedgerStatus === null &&
    typeof detail.sourceYearMonth === "string" &&
    detail.sourceYearMonth === snapshot.yearMonth &&
    typeof detail.sourceSnapshotId === "string" &&
    detail.sourceSnapshotId === snapshot.id &&
    typeof detail.resolvedQuantity === "number" &&
    detail.resolvedQuantity === item.previousQuantity &&
    typeof detail.sourcePreviousQuantity === "number" &&
    detail.sourcePreviousQuantity === item.previousQuantity &&
    detail.sourcePurchasedQuantity === null &&
    detail.sourceLossQuantity === null &&
    detail.sourceCurrentQuantity === null &&
    typeof detail.sourceQuantity === "number" &&
    detail.sourceQuantity === item.previousQuantity &&
    typeof detail.message === "string" &&
    detail.message.trim().length > 0 &&
    (detail.history === undefined || Array.isArray(detail.history))
  );
}

function toCreate(item: RepairAuditItem) {
  return {
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    previousQuantity: item.previousQuantity,
    purchasedQuantity: item.purchasedQuantity,
    currentQuantity: item.currentQuantity,
    quantity: item.quantity,
    inventoryAmount: item.inventoryAmount,
    isModified: item.isModified,
    carryoverSource: item.carryoverSource,
    carryoverStatus: item.carryoverStatus,
    carryoverLedgerId: item.carryoverLedgerId,
    previousQuantityDetail: item.previousQuantityDetail,
  };
}

export function planOpeningCarryoverRepair({
  auditItems,
  currentItems,
  snapshots,
}: {
  auditItems: RepairAuditItem[];
  currentItems: RepairCurrentItem[];
  snapshots: RepairSnapshot[];
}) {
  const openingItems = auditItems.filter(
    (item) => item.carryoverSource === "OPENING_SNAPSHOT",
  );

  if (openingItems.length === 0) {
    evidenceMismatch();
  }

  const openingByProductId = uniqueByProductId(openingItems);
  const currentByProductId = uniqueByProductId(currentItems);
  const snapshotByProductId = uniqueByProductId(snapshots);

  if (openingByProductId.size !== snapshotByProductId.size) {
    evidenceMismatch();
  }

  const creates: ReturnType<typeof toCreate>[] = [];
  const updates: Array<{
    id: string;
    previousQuantity: number;
    carryoverSource: string;
    carryoverStatus: string;
    carryoverLedgerId: string | null;
    previousQuantityDetail: OpeningCarryoverDetail;
  }> = [];
  const skips: Array<{ id: string; productId: string }> = [];

  for (const item of openingByProductId.values()) {
    const snapshot = snapshotByProductId.get(item.productId);

    if (
      !snapshot ||
      !hasGroundedOpeningDetail(item, snapshot) ||
      item.carryoverStatus !== "OPENING_CARRYOVER" ||
      item.carryoverLedgerId !== null ||
      snapshot.quantity !== item.previousQuantity
    ) {
      evidenceMismatch();
    }

    const current = currentByProductId.get(item.productId);

    if (!current) {
      creates.push(toCreate(item));
      continue;
    }

    if (
      current.carryoverSource !== "MANUAL" &&
      current.carryoverSource !== "OPENING_SNAPSHOT"
    ) {
      evidenceMismatch();
    }

    const basisMatches =
      current.previousQuantity === item.previousQuantity &&
      current.carryoverSource === item.carryoverSource &&
      current.carryoverStatus === item.carryoverStatus &&
      current.carryoverLedgerId === item.carryoverLedgerId &&
      hasSamePersistedDetail(
        current.previousQuantityDetail,
        item.previousQuantityDetail,
      );

    if (basisMatches) {
      skips.push({ id: current.id, productId: current.productId });
      continue;
    }

    updates.push({
      id: current.id,
      previousQuantity: item.previousQuantity,
      carryoverSource: item.carryoverSource,
      carryoverStatus: item.carryoverStatus,
      carryoverLedgerId: item.carryoverLedgerId,
      previousQuantityDetail: item.previousQuantityDetail,
    });
  }

  return { creates, updates, skips };
}
