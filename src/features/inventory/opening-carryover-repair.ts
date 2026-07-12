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
    auditItems: auditItems as RepairAuditItem[],
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
  const openingByProductId = uniqueByProductId(openingItems);
  const currentByProductId = uniqueByProductId(currentItems);
  const snapshotByProductId = uniqueByProductId(snapshots);
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
