import type { LedgerStoreManagerInventoryInput } from "./schemas";

type LotPriceSnapshot = {
  fifo: { lots: Array<{ lotOriginKey: string }> };
};

type LotPriceItem = Pick<
  LedgerStoreManagerInventoryInput["items"][number],
  "productId" | "plannedUnitPrice"
> & {
  productName?: string;
};

function getTargetByOrigin(
  snapshotsByProductId: ReadonlyMap<string, LotPriceSnapshot>,
  submittedProductIds: ReadonlySet<string>,
) {
  const targetByOrigin = new Map<string, string>();

  for (const [productId, snapshot] of snapshotsByProductId) {
    if (!submittedProductIds.has(productId)) continue;

    for (const lot of snapshot.fifo.lots) {
      targetByOrigin.set(lot.lotOriginKey, productId);
    }
  }

  return targetByOrigin;
}

function appendError(
  errors: Record<string, string[]>,
  key: string,
  message: string,
) {
  errors[key] = [...(errors[key] ?? []), message];
}

export function getLotPriceTargetErrors(
  snapshotsByProductId: ReadonlyMap<string, LotPriceSnapshot>,
  items: readonly LotPriceItem[],
  lotPrices: LedgerStoreManagerInventoryInput["lotPrices"],
  requireEveryLot = true,
) {
  const submittedProductIds = new Set(items.map((item) => item.productId));
  const targetByOrigin = getTargetByOrigin(
    snapshotsByProductId,
    submittedProductIds,
  );
  const itemIndexByProductId = new Map(
    items.map((item, index) => [item.productId, index]),
  );
  const errors: Record<string, string[]> = {};
  const submittedOrigins = new Set<string>();

  function addProductError(
    productId: string,
    fallbackKey: string,
    detail: string,
  ) {
    const itemIndex = itemIndexByProductId.get(productId);
    const item = itemIndex === undefined ? undefined : items[itemIndex];
    const itemName = item?.productName?.trim() ?? productId;
    const key =
      itemIndex === undefined
        ? fallbackKey
        : `items.${itemIndex}.plannedUnitPrice`;

    appendError(errors, key, `${itemName}: ${detail}`);
  }

  lotPrices.forEach((price, index) => {
    if (submittedOrigins.has(price.lotOriginKey)) {
      addProductError(
        price.productId,
        `lotPrices.${index}.lotOriginKey`,
        "같은 입고분 판매가가 두 번 들어왔습니다.",
      );
      return;
    }
    submittedOrigins.add(price.lotOriginKey);

    if (targetByOrigin.get(price.lotOriginKey) !== price.productId) {
      addProductError(
        price.productId,
        `lotPrices.${index}.lotOriginKey`,
        "화면의 입고분 목록과 저장할 목록이 다릅니다. 새로고침 후 다시 입력해 주세요.",
      );
    }
  });

  if (requireEveryLot) {
    for (const [lotOriginKey, productId] of targetByOrigin) {
      if (submittedOrigins.has(lotOriginKey)) continue;

      addProductError(
        productId,
        "lotPrices",
        lotOriginKey.endsWith(":adjustment")
          ? "입력한 당일재고로 새 재고 차이 입고분이 생겼지만 판매가를 정할 기준이 없습니다. 품목의 판매가를 확인해 주세요."
          : "저장할 입고분의 판매가가 빠졌습니다. 화면의 입고분 판매가를 모두 확인해 주세요.",
      );
    }
  }

  return errors;
}

export function getLotPriceValidationMessage(
  items: readonly LotPriceItem[],
  errors: Readonly<Record<string, string[]>>,
) {
  const problemNames = items.flatMap((item, index) =>
    errors[`items.${index}.plannedUnitPrice`]?.length
      ? [item.productName?.trim() ?? item.productId]
      : [],
  );

  return problemNames.length > 0
    ? `입고분별 판매가를 확인해 주세요. 문제 품목: ${problemNames.join(", ")}`
    : "입고분별 판매가를 확인해 주세요.";
}

export function completeGeneratedLotPrices(
  snapshotsByProductId: ReadonlyMap<string, LotPriceSnapshot>,
  items: readonly LotPriceItem[],
  lotPrices: LedgerStoreManagerInventoryInput["lotPrices"],
) {
  const submittedProductIds = new Set(items.map((item) => item.productId));
  const targetByOrigin = getTargetByOrigin(
    snapshotsByProductId,
    submittedProductIds,
  );
  // 입력한 수량으로 FIFO를 다시 계산하면 화면에 있던 보정 lot이 사라질 수 있다.
  // 저장 대상에 없는 보정 lot 가격은 쓸 곳이 없으므로 검증 전에 제외한다.
  const completed = lotPrices.filter(
    (price) =>
      targetByOrigin.has(price.lotOriginKey) ||
      !price.lotOriginKey.endsWith(":adjustment"),
  );
  const priceByOrigin = new Map(
    completed.map((price) => [price.lotOriginKey, price.plannedUnitPrice]),
  );
  const productPriceById = new Map(
    items.flatMap((item) =>
      item.plannedUnitPrice === null || item.plannedUnitPrice === undefined
        ? []
        : [[item.productId, item.plannedUnitPrice] as const],
    ),
  );

  for (const [productId, snapshot] of snapshotsByProductId) {
    if (!submittedProductIds.has(productId)) continue;

    for (const lot of snapshot.fifo.lots) {
      if (
        priceByOrigin.has(lot.lotOriginKey) ||
        !lot.lotOriginKey.endsWith(":adjustment")
      ) {
        continue;
      }

      const baseOrigin = lot.lotOriginKey.slice(0, -":adjustment".length);
      const plannedUnitPrice =
        priceByOrigin.get(baseOrigin) ?? productPriceById.get(productId);

      if (plannedUnitPrice === undefined) continue;

      completed.push({
        productId,
        lotOriginKey: lot.lotOriginKey,
        plannedUnitPrice,
      });
      priceByOrigin.set(lot.lotOriginKey, plannedUnitPrice);
    }
  }

  return completed;
}
