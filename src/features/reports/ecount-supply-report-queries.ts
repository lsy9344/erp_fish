// WO(2026-06-24): 본사 출고 / 지점 입고 리포트 쿼리.
// 본사가 어느 지점에 어떤 물건을 얼마에 공급했는지 파일 단위로 추적한다.
// 실제 품목별 판매 데이터(POS)가 없으므로 판매/마진 관련 값은 모두 "추정"으로만 노출한다.
import { getHeadquartersStoreScope } from "~/server/authz";
import { db } from "~/server/db";
import { decimalToNumber } from "~/lib/decimal";

const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type EcountSupplyReportFilters = {
  from: string;
  to: string;
  storeId: string;
  productId: string;
  category: string;
  minUnitPrice: string;
  maxUnitPrice: string;
  batchId: string;
};

export type EcountSupplyReportRow = {
  ledgerPurchaseItemId: string;
  dateNo: string | null;
  closingDate: string;
  storeId: string;
  storeName: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  quantity: number;
  /** 장부 적용 단가 */
  unitPrice: number;
  /** 원본 이카운트 단가 */
  sourceUnitPrice: number | null;
  /** 적용 단가 != 원본 단가 여부 */
  unitPriceOverridden: boolean;
  supplyAmount: number;
  ledgerStatus: string;
  /** 재고/FIFO lot 연결 여부 */
  fifoLinked: boolean;
  /** 판매한 가격(추정). 없으면 null = "판매한 가격 없음" */
  plannedUnitPrice: number | null;
  batchId: string | null;
  fileName: string | null;
};

export type EcountSupplyReportSummary = {
  rowCount: number;
  totalQuantity: number;
  totalSupplyAmount: number;
  unmappedSalesPlanCount: number;
  // point_summary 검토 후속(2026-06-24): 판매한 가격(plannedUnitPrice) 기반 기대 매출/이익 합계.
  // 기대 매출 = Σ(수량 × 판매한 가격), 기대 이익 = 기대 매출 − 공급금액(원가).
  // 판매한 가격이 매핑된 행만 합산하며, 그 행들의 공급금액 합계(matchedSupplyAmount)와 함께
  // 노출해 어느 범위에서 산출됐는지 알 수 있게 한다.
  estimatedSalesAmount: number;
  estimatedGrossProfit: number;
  // 기대 매출/이익 계산에 포함된 행 수와 그 행들의 공급금액 합계.
  plannedRowCount: number;
  matchedSupplyAmount: number;
};

export type EcountSupplyReportData = {
  rows: EcountSupplyReportRow[];
  summary: EcountSupplyReportSummary;
  storeOptions: { id: string; name: string }[];
  productOptions: { id: string; name: string; spec: string }[];
  batchOptions: { id: string; fileName: string }[];
  filters: EcountSupplyReportFilters;
  /** 화면/문서에서 추정 표기 필요 여부. 항상 true(실제 판매 데이터 없음). */
  estimatedOnly: true;
};

function normalizeDate(value: string): string {
  return DATE_QUERY_PATTERN.test(value) ? value : "";
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getHeadquartersSupplyReport(
  rawFilters: Partial<EcountSupplyReportFilters> = {},
): Promise<EcountSupplyReportData> {
  const scope = await getHeadquartersStoreScope();
  const scopedStoreIds = new Set(scope.storeIds);

  const filters: EcountSupplyReportFilters = {
    from: normalizeDate(String(rawFilters.from ?? "")),
    to: normalizeDate(String(rawFilters.to ?? "")),
    storeId: String(rawFilters.storeId ?? ""),
    productId: String(rawFilters.productId ?? ""),
    category: String(rawFilters.category ?? ""),
    minUnitPrice: String(rawFilters.minUnitPrice ?? ""),
    maxUnitPrice: String(rawFilters.maxUnitPrice ?? ""),
    batchId: String(rawFilters.batchId ?? ""),
  };

  const storeIdFilter =
    filters.storeId && scopedStoreIds.has(filters.storeId)
      ? [filters.storeId]
      : scope.storeIds;

  const closingDateFilter: { gte?: Date; lte?: Date } = {};
  if (filters.from) {
    closingDateFilter.gte = new Date(`${filters.from}T00:00:00.000Z`);
  }
  if (filters.to) {
    closingDateFilter.lte = new Date(`${filters.to}T23:59:59.999Z`);
  }

  const minUnitPrice = Number(filters.minUnitPrice);
  const maxUnitPrice = Number(filters.maxUnitPrice);
  const unitPriceFilter: { gte?: number; lte?: number } = {};
  if (Number.isSafeInteger(minUnitPrice) && filters.minUnitPrice !== "") {
    unitPriceFilter.gte = minUnitPrice;
  }
  if (Number.isSafeInteger(maxUnitPrice) && filters.maxUnitPrice !== "") {
    unitPriceFilter.lte = maxUnitPrice;
  }

  const items = await db.ledgerPurchaseItem.findMany({
    where: {
      sourceType: "ECOUNT_UPLOAD",
      dailyLedger: {
        storeId: { in: storeIdFilter },
        ...(closingDateFilter.gte || closingDateFilter.lte
          ? { closingDate: closingDateFilter }
          : {}),
      },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.category ? { productCategory: filters.category } : {}),
      ...(unitPriceFilter.gte !== undefined || unitPriceFilter.lte !== undefined
        ? { unitPrice: unitPriceFilter }
        : {}),
      ...(filters.batchId
        ? { ecountImportLine: { batchId: filters.batchId } }
        : {}),
    },
    orderBy: [{ dailyLedger: { closingDate: "desc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      productId: true,
      productName: true,
      productCategory: true,
      productSpec: true,
      quantity: true,
      unitPrice: true,
      sourceUnitPrice: true,
      amount: true,
      dailyLedger: {
        select: {
          status: true,
          closingDate: true,
          storeId: true,
          store: { select: { name: true } },
        },
      },
      ecountImportLine: {
        select: {
          dateNo: true,
          batchId: true,
          batch: { select: { fileName: true } },
        },
      },
      ledgerInventoryFifoLots: { select: { id: true }, take: 1 },
    },
  });

  // 판매한 가격(추정) 매핑. (storeId, closingDate, productId) → plannedUnitPrice.
  const planKeys = items
    .filter((item) => item.productId)
    .map((item) => ({
      storeId: item.dailyLedger.storeId,
      businessDate: item.dailyLedger.closingDate,
      productId: item.productId!,
    }));

  const salesPlans =
    planKeys.length > 0
      ? await db.storeSalesPricePlan.findMany({
          where: {
            OR: planKeys.map((key) => ({
              storeId: key.storeId,
              businessDate: key.businessDate,
              productId: key.productId,
            })),
          },
          select: {
            storeId: true,
            businessDate: true,
            productId: true,
            plannedUnitPrice: true,
          },
        })
      : [];

  const planByKey = new Map<string, number>();
  for (const plan of salesPlans) {
    planByKey.set(
      `${plan.storeId}|${plan.businessDate.toISOString()}|${plan.productId}`,
      plan.plannedUnitPrice,
    );
  }

  const rows: EcountSupplyReportRow[] = items.map((item) => {
    const plannedUnitPrice = item.productId
      ? (planByKey.get(
          `${item.dailyLedger.storeId}|${item.dailyLedger.closingDate.toISOString()}|${item.productId}`,
        ) ?? null)
      : null;

    return {
      ledgerPurchaseItemId: item.id,
      dateNo: item.ecountImportLine?.dateNo ?? null,
      closingDate: toDateOnlyString(item.dailyLedger.closingDate),
      storeId: item.dailyLedger.storeId,
      storeName: item.dailyLedger.store?.name ?? "",
      productName: item.productName,
      productCategory: item.productCategory,
      productSpec: item.productSpec,
      quantity: decimalToNumber(item.quantity),
      unitPrice: item.unitPrice,
      sourceUnitPrice: item.sourceUnitPrice,
      unitPriceOverridden:
        item.sourceUnitPrice !== null &&
        item.sourceUnitPrice !== item.unitPrice,
      supplyAmount: item.amount,
      ledgerStatus: item.dailyLedger.status,
      fifoLinked: item.ledgerInventoryFifoLots.length > 0,
      plannedUnitPrice,
      batchId: item.ecountImportLine?.batchId ?? null,
      fileName: item.ecountImportLine?.batch?.fileName ?? null,
    };
  });

  const batches = await db.ecountImportBatch.findMany({
    where: { status: "COMMITTED" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, fileName: true },
  });

  // 품목 필터 옵션: scope 내 이카운트 입고 라인에 실제로 등장한 품목만 노출한다.
  const productItems = await db.ledgerPurchaseItem.findMany({
    where: {
      sourceType: "ECOUNT_UPLOAD",
      productId: { not: null },
      dailyLedger: { storeId: { in: scope.storeIds } },
    },
    distinct: ["productId"],
    orderBy: { productName: "asc" },
    select: { productId: true, productName: true, productSpec: true },
  });
  const productOptions = productItems
    .filter((item): item is typeof item & { productId: string } =>
      Boolean(item.productId),
    )
    .map((item) => ({
      id: item.productId,
      name: item.productName,
      spec: item.productSpec,
    }));

  // 판매한 가격이 매핑된 행만 기대 매출/이익에 합산한다(예정가 없는 행은 제외 + 카운트).
  const plannedRows = rows.filter((row) => row.plannedUnitPrice !== null);
  const estimatedSalesAmount = plannedRows.reduce(
    (sum, row) => sum + Math.round(row.quantity * (row.plannedUnitPrice ?? 0)),
    0,
  );
  const matchedSupplyAmount = plannedRows.reduce(
    (sum, row) => sum + row.supplyAmount,
    0,
  );

  return {
    rows,
    summary: {
      rowCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalSupplyAmount: rows.reduce((sum, row) => sum + row.supplyAmount, 0),
      unmappedSalesPlanCount: rows.filter(
        (row) => row.plannedUnitPrice === null,
      ).length,
      estimatedSalesAmount,
      // 기대 이익 = 기대 매출 − (예정가 매핑 행들의) 공급금액. 같은 행 범위로 맞춘다.
      estimatedGrossProfit: estimatedSalesAmount - matchedSupplyAmount,
      plannedRowCount: plannedRows.length,
      matchedSupplyAmount,
    },
    storeOptions: scope.stores.map((store) => ({
      id: store.id,
      name: store.name,
    })),
    productOptions,
    batchOptions: batches.map((batch) => ({
      id: batch.id,
      fileName: batch.fileName,
    })),
    filters,
    estimatedOnly: true,
  };
}
