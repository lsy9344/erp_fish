// WO-08(2026-06-22): 전 지점 재고 현황 리포트 쿼리.
// 본사 권한 범위(getHeadquartersStoreScope)의 활성 지점만 대상으로, 선택 일자의 마감/입력
// 장부에 기록된 품목별 "남은 재고"를 한 화면에 모은다. 누락 장부는 생성하지 않고 "미입력"
// 행으로만 노출하며, 단가/수량이 없어 금액을 못 구하는 행은 "계산 불가"로 분리한다.
import { calculateSystemInventoryQuantity } from "../../server/calculations/inventory.ts";
import {
  getDailyMeetingReportDate,
  getDailyMeetingReportDateInput,
} from "./queries.ts";
import type {
  InventoryPositionCategoryOption,
  InventoryPositionDateRange,
  InventoryPositionFifoLotRow,
  InventoryPositionReportData,
  InventoryPositionRow,
  InventoryPositionStatusLabel,
  InventoryPositionSummary,
} from "./inventory-position-types.ts";

const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type InventoryPositionLedgerRecord = {
  storeId: string;
  ledgerInventoryItems: InventoryPositionLedgerItemRecord[];
  ledgerLossItems: {
    productId: string;
    quantity: number;
  }[];
};

type InventoryPositionLedgerFifoLotRecord = Omit<
  InventoryPositionFifoLotRow,
  "sourceBusinessDate" | "purchaseDate"
> & {
  sourceBusinessDate: Date | null;
  sourcePurchaseItem: { createdAt: Date } | null;
};

type InventoryPositionLedgerItemRecord = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  // FIFO 엔진(refreshLedgerInventoryFifoLots)이 저장한 선입선출 기준 재고 금액.
  inventoryAmount: number | null;
  fifoLots: InventoryPositionLedgerFifoLotRecord[];
};

type InventoryPositionRowItem = Omit<
  InventoryPositionLedgerItemRecord,
  "fifoLots"
> & {
  fifoLots: InventoryPositionFifoLotRow[];
};

function isValidInventoryDateInput(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_QUERY_PATTERN.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10) === value;
}

function toIsoDateString(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function toInventoryPositionFifoLots(
  lots: InventoryPositionLedgerFifoLotRecord[],
): InventoryPositionFifoLotRow[] {
  return lots.map((lot) => ({
    sourceType: lot.sourceType,
    sourceBusinessDate: toIsoDateString(lot.sourceBusinessDate),
    purchaseDate: toIsoDateString(lot.sourcePurchaseItem?.createdAt),
    unitPrice: lot.unitPrice,
    originalQuantity: lot.originalQuantity,
    consumedQuantity: lot.consumedQuantity,
    remainingQuantity: lot.remainingQuantity,
    remainingAmount: lot.remainingAmount,
    sortOrder: lot.sortOrder,
  }));
}

export function getInventoryPositionDateRange(
  date: unknown,
  inputDate = new Date(),
): InventoryPositionDateRange {
  const hasDateInput = date !== undefined && date !== null && date !== "";

  if (isValidInventoryDateInput(date)) {
    const resolved = getDailyMeetingReportDate(date);

    return {
      date: resolved,
      dateInput: getDailyMeetingReportDateInput(resolved),
      errorMessage: null,
    };
  }

  const today = getDailyMeetingReportDate("today", inputDate);

  return {
    date: today,
    dateInput: getDailyMeetingReportDateInput(today),
    errorMessage: hasDateInput
      ? "조회 날짜를 확인해 주세요. 오늘 날짜 기준으로 조회합니다."
      : null,
  };
}

export function getInventoryPositionReportPath({
  dateInput,
  storeId,
  category,
  productQuery,
}: {
  dateInput: string;
  storeId?: string | null;
  category?: string | null;
  productQuery?: string | null;
}) {
  const params = new URLSearchParams({ date: dateInput });

  if (storeId) {
    params.set("storeId", storeId);
  }

  if (category) {
    params.set("category", category);
  }

  if (productQuery) {
    params.set("product", productQuery);
  }

  return `/app/reports/inventory?${params.toString()}`;
}

function toInventoryPositionRow({
  storeId,
  storeName,
  item,
  lossQuantity,
}: {
  storeId: string;
  storeName: string;
  item: InventoryPositionRowItem;
  lossQuantity: number;
}): InventoryPositionRow {
  const currentQuantity = item.currentQuantity ?? item.quantity;
  const systemQuantity = calculateSystemInventoryQuantity({
    previousQuantity: item.previousQuantity,
    purchasedQuantity: item.purchasedQuantity,
    lossQuantity,
  });
  const differenceQuantity =
    currentQuantity === null || systemQuantity === null
      ? null
      : currentQuantity - systemQuantity;
  // 재고 금액은 단순 곱셈(수량×단가)이 아니라 FIFO 엔진이 저장한 선입선출 잔액을 그대로
  // 사용한다(meeting/change.md:21). 단가가 다른 lot이 섞여도 재고 단계 팝업·LINE 요약과 동일
  // 기준이 된다. FIFO 금액이 아직 없는(미계산) 행은 "계산 불가"로 분리한다.
  const inventoryAmount = item.inventoryAmount;
  const statusLabel: InventoryPositionStatusLabel =
    currentQuantity === null
      ? "계산 불가"
      : inventoryAmount === null
        ? "계산 불가"
        : "입력됨";

  return {
    storeId,
    storeName,
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    previousQuantity: item.previousQuantity,
    purchasedQuantity: item.purchasedQuantity,
    lossQuantity,
    currentQuantity,
    systemQuantity,
    differenceQuantity,
    inventoryAmount,
    fifoLots: item.fifoLots,
    statusLabel,
  };
}

function buildMissingStoreRow({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}): InventoryPositionRow {
  return {
    storeId,
    storeName,
    productId: "",
    productName: "—",
    productCategory: "",
    productSpec: "",
    previousQuantity: 0,
    purchasedQuantity: 0,
    lossQuantity: 0,
    currentQuantity: null,
    systemQuantity: null,
    differenceQuantity: null,
    inventoryAmount: null,
    fifoLots: [],
    statusLabel: "미입력",
  };
}

function summarizeInventoryPositionRows(
  rows: InventoryPositionRow[],
): InventoryPositionSummary {
  const storeIds = new Set<string>();
  const productIds = new Set<string>();
  let enteredRowCount = 0;
  let missingRowCount = 0;
  let uncomputableRowCount = 0;
  let amountSum = 0;
  let hasUncomputableAmount = false;

  for (const row of rows) {
    storeIds.add(row.storeId);

    if (row.productId) {
      productIds.add(row.productId);
    }

    if (row.statusLabel === "입력됨") {
      enteredRowCount += 1;
    } else if (row.statusLabel === "미입력") {
      missingRowCount += 1;
    } else {
      uncomputableRowCount += 1;
    }

    if (row.inventoryAmount === null) {
      if (row.statusLabel === "계산 불가") {
        hasUncomputableAmount = true;
      }
    } else {
      amountSum += row.inventoryAmount;
    }
  }

  return {
    storeCount: storeIds.size,
    productCount: productIds.size,
    enteredRowCount,
    missingRowCount,
    uncomputableRowCount,
    totalInventoryAmount: hasUncomputableAmount ? null : amountSum,
  };
}

function sortInventoryPositionRows(rows: InventoryPositionRow[]) {
  return [...rows].sort(
    (left, right) =>
      left.storeName.localeCompare(right.storeName, "ko-KR") ||
      left.productCategory.localeCompare(right.productCategory, "ko-KR") ||
      left.productName.localeCompare(right.productName, "ko-KR") ||
      left.productSpec.localeCompare(right.productSpec, "ko-KR"),
  );
}

export async function getHqInventoryPositionReport({
  date,
  storeId,
  category,
  product,
}: {
  date?: unknown;
  storeId?: unknown;
  category?: unknown;
  product?: unknown;
} = {}): Promise<InventoryPositionReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const range = getInventoryPositionDateRange(date);
  const { db } = await import("../../server/db.ts");
  const stores = storeScope.stores;
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStores = normalizedStoreId
    ? matchedStore
      ? [matchedStore]
      : []
    : stores;
  const storeErrorMessage =
    normalizedStoreId && !matchedStore
      ? "조회 지점을 확인해 주세요. 권한 있는 활성 지점만 재고 현황에 포함됩니다."
      : null;
  const normalizedCategory =
    typeof category === "string" && category.trim().length > 0
      ? category.trim()
      : null;
  const normalizedProductQuery =
    typeof product === "string" && product.trim().length > 0
      ? product.trim()
      : null;
  const storeIds = selectedStores.map((store) => store.id);
  const ledgers: InventoryPositionLedgerRecord[] =
    storeIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeIds },
            closingDate: range.date,
          },
          select: {
            storeId: true,
            ledgerInventoryItems: {
              select: {
                productId: true,
                productName: true,
                productCategory: true,
                productSpec: true,
                unitPrice: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                inventoryAmount: true,
                fifoLots: {
                  where: {
                    remainingQuantity: { gt: 0 },
                  },
                  select: {
                    sourceType: true,
                    sourceBusinessDate: true,
                    unitPrice: true,
                    originalQuantity: true,
                    consumedQuantity: true,
                    remainingQuantity: true,
                    remainingAmount: true,
                    sortOrder: true,
                    sourcePurchaseItem: {
                      select: {
                        createdAt: true,
                      },
                    },
                  },
                  orderBy: [{ sortOrder: "asc" }],
                },
              },
            },
            ledgerLossItems: {
              select: {
                productId: true,
                quantity: true,
              },
            },
          },
        });

  const ledgerByStoreId = new Map<string, InventoryPositionLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const storeNameById = new Map(
    selectedStores.map((store) => [store.id, store.name]),
  );
  const categoryValues = new Set<string>();
  const rows: InventoryPositionRow[] = [];

  for (const store of selectedStores) {
    const ledger = ledgerByStoreId.get(store.id);

    if (!ledger) {
      // 누락 장부는 생성하지 않고 미입력 행으로만 노출한다.
      if (!normalizedCategory && !normalizedProductQuery) {
        rows.push(
          buildMissingStoreRow({ storeId: store.id, storeName: store.name }),
        );
      }

      continue;
    }

    const lossQuantityByProduct = new Map<string, number>();

    for (const loss of ledger.ledgerLossItems) {
      lossQuantityByProduct.set(
        loss.productId,
        (lossQuantityByProduct.get(loss.productId) ?? 0) + loss.quantity,
      );
    }

    for (const item of ledger.ledgerInventoryItems) {
      categoryValues.add(item.productCategory);

      if (normalizedCategory && item.productCategory !== normalizedCategory) {
        continue;
      }

      if (
        normalizedProductQuery &&
        !item.productName
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedProductQuery.toLocaleLowerCase("ko-KR"))
      ) {
        continue;
      }

      rows.push(
        toInventoryPositionRow({
          storeId: store.id,
          storeName: storeNameById.get(store.id) ?? store.name,
          item: {
            ...item,
            fifoLots: toInventoryPositionFifoLots(item.fifoLots),
          },
          lossQuantity: lossQuantityByProduct.get(item.productId) ?? 0,
        }),
      );
    }
  }

  const categories: InventoryPositionCategoryOption[] = [...categoryValues]
    .sort((left, right) => left.localeCompare(right, "ko-KR"))
    .map((value) => ({ value, label: value }));
  const sortedRows = sortInventoryPositionRows(rows);

  return {
    range,
    filters: {
      dateInput: range.dateInput,
      storeId: matchedStore?.id ?? null,
      storeName: matchedStore?.name ?? null,
      category: normalizedCategory,
      productQuery: normalizedProductQuery,
    },
    stores: stores.map((store) => ({ id: store.id, name: store.name })),
    categories,
    rows: sortedRows,
    summary: summarizeInventoryPositionRows(sortedRows),
    errorMessages: [range.errorMessage, storeErrorMessage].filter(
      (message): message is string => Boolean(message),
    ),
  };
}
