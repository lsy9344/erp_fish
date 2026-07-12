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
  const dateArgs = args.filter((arg) => arg.startsWith("--date="));
  const date =
    dateArgs.length === 1 ? (dateArgs[0]?.slice("--date=".length) ?? "") : "";

  if (!isValidDateString(date)) {
    throw new Error("Missing or invalid --date=YYYY-MM-DD.");
  }

  const isDryRun = args.includes("--dry-run");
  const isConfirmed = args.includes("--yes");

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

function evidenceMismatch(): never {
  throw new Error("EVIDENCE_MISMATCH");
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
    const detail = item.previousQuantityDetail;

    if (
      !snapshot ||
      detail.source !== "OPENING_SNAPSHOT" ||
      detail.status !== "OPENING_CARRYOVER" ||
      item.carryoverStatus !== "OPENING_CARRYOVER" ||
      item.carryoverLedgerId !== null ||
      detail.sourceSnapshotId !== snapshot.id ||
      snapshot.quantity !== item.previousQuantity ||
      detail.resolvedQuantity !== item.previousQuantity ||
      detail.sourcePreviousQuantity !== item.previousQuantity ||
      detail.sourceQuantity !== item.previousQuantity
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
