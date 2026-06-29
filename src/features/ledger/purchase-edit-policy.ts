type PurchaseSourceType = "MANUAL" | "ECOUNT_UPLOAD";

type PurchaseEditPolicyLine = {
  id: string;
  productId: string | null;
  purchaseStandardId: string | null;
  sourceType: PurchaseSourceType;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  quantity: number;
  referenceInfo: string | null;
};

// 정책 반전(2026-06-28, client-review-checklist-2026-06-28.md §1 / gap-review §3.2):
// "장부 적용 단가(unitPrice)" 수정 권한은 본사 전용으로 확정됐다. 지점장은 이카운트 라인의
// 원본 정보(품목, 원본 행, 원본 거래처명, 수량, referenceInfo)도, 적용 단가도 수정할 수 없다.
// 새 ECOUNT_UPLOAD 라인을 직접 만들 수 없다. 원본 단가는 sourceUnitPrice/EcountImportLine에 보존된다.
// 지점장은 step 3에서 신규 수동(MANUAL) 매입 행은 계속 추가할 수 있다(최초 단가 입력은 수정이 아님).
const ecountRawFieldBlockedMessage =
  "이카운트 출고/입고 라인의 원본 정보(품목·수량·원본 행·적용 단가)는 본사에서만 수정할 수 있습니다.";
const ecountDeleteBlockedMessage =
  "이카운트 출고/입고 라인은 장부 매입 화면에서 삭제할 수 없습니다.";
const ecountCreateBlockedMessage =
  "이카운트 출고/입고 라인은 본사 이카운트 업로드 화면에서만 만들 수 있습니다.";
const appliedUnitPriceBlockedMessage =
  "장부 적용 단가는 본사에서만 수정할 수 있습니다.";

function nullableText(value: string | null) {
  return value ?? "";
}

/**
 * 이카운트 라인의 원본 필드가 동일한지 확인한다. 2026-06-28 이후 적용 단가(unitPrice)도
 * 본사 전용이므로 비교 대상에 포함한다(지점장이 바꾸면 차단).
 */
function isSameEcountRawFields(
  existing: PurchaseEditPolicyLine,
  incoming: PurchaseEditPolicyLine,
) {
  return (
    existing.productId === incoming.productId &&
    existing.purchaseStandardId === incoming.purchaseStandardId &&
    existing.sourceType === incoming.sourceType &&
    existing.productName === incoming.productName &&
    existing.productCategory === incoming.productCategory &&
    existing.productSpec === incoming.productSpec &&
    existing.quantity === incoming.quantity &&
    existing.unitPrice === incoming.unitPrice &&
    nullableText(existing.referenceInfo) ===
      nullableText(incoming.referenceInfo)
  );
}

// 같은 품목 식별(productId + 규격) 키. productId가 없는(미연결) 행은 식별 단가 보호 대상이 아니다.
function productIdentityKey(row: PurchaseEditPolicyLine): string | null {
  if (!row.productId) {
    return null;
  }
  return JSON.stringify([
    row.productId,
    row.productSpec.trim().replace(/\s+/g, " "),
  ]);
}

export function getStoreEcountPurchaseEditErrors(
  existingRows: PurchaseEditPolicyLine[],
  incomingRows: PurchaseEditPolicyLine[],
) {
  const errors: Record<string, string[]> = {};
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const incomingIds = new Set(incomingRows.map((row) => row.id));
  const existingEcountRows = existingRows.filter(
    (row) => row.sourceType === "ECOUNT_UPLOAD",
  );
  const existingEcountIds = new Set(existingEcountRows.map((row) => row.id));

  // 같은 품목(productId+규격)의 기존 적용 단가. delete+recreate로 id를 바꿔 단가를 우회하는
  // 경로를 막기 위해, id가 아니라 품목 식별로도 단가 변경을 탐지한다. 여러 행이 같은 품목이면
  // 단가가 갈릴 수 있으므로, 그 품목의 기존 단가 집합을 모은다.
  // 단, 같은 품목의 기존 행이 incoming에 하나라도 그대로 살아있으면(추가 매입 시나리오) 보호
  // 대상이 아니다 — 기존 행을 모두 지우고 새 단가로 재등록한 경우만 우회로 본다.
  const existingUnitPricesByProduct = new Map<string, Set<number>>();
  const existingProductHasSurvivingRow = new Map<string, boolean>();
  for (const row of existingRows) {
    const key = productIdentityKey(row);
    if (!key) {
      continue;
    }
    const set = existingUnitPricesByProduct.get(key) ?? new Set<number>();
    set.add(row.unitPrice);
    existingUnitPricesByProduct.set(key, set);

    const survives = incomingIds.has(row.id);
    existingProductHasSurvivingRow.set(
      key,
      (existingProductHasSurvivingRow.get(key) ?? false) || survives,
    );
  }

  for (const existing of existingEcountRows) {
    const incomingIndex = incomingRows.findIndex(
      (row) => row.id === existing.id,
    );

    if (incomingIndex === -1) {
      errors.purchases = [ecountDeleteBlockedMessage];
      continue;
    }

    if (!isSameEcountRawFields(existing, incomingRows[incomingIndex]!)) {
      errors[`purchases.${incomingIndex}`] = [ecountRawFieldBlockedMessage];
    }
  }

  incomingRows.forEach((incoming, index) => {
    if (
      incoming.sourceType === "ECOUNT_UPLOAD" &&
      !existingEcountIds.has(incoming.id)
    ) {
      errors[`purchases.${index}.sourceType`] = [ecountCreateBlockedMessage];
    }

    // 2026-06-28: 기존 행(이카운트/수동 무관)의 적용 단가 변경은 본사 전용. 지점장 경로에서
    // 막는다. 신규 수동 행(existing 없음)의 최초 단가 입력은 수정이 아니므로 허용한다.
    // 이카운트 행은 위 raw-field 차단(purchases.{index})이 이미 단가 포함 전체를 막으므로,
    // 중복 메시지를 피해 raw-field 에러가 없는 행에만 단가 전용 에러를 단다(주로 수동 행).
    const existing = existingById.get(incoming.id);
    if (
      existing &&
      existing.unitPrice !== incoming.unitPrice &&
      !errors[`purchases.${index}`]
    ) {
      errors[`purchases.${index}.unitPrice`] = [appliedUnitPriceBlockedMessage];
    }

    // delete+recreate 우회 차단: 기존 행 id가 아닌 새 행(existing 없음)인데, 같은 품목
    // (productId+규격)의 기존 행이 모두 사라졌고 새 단가가 그 품목의 기존 단가에 없으면
    // 단가 우회 수정으로 본다. 기존 행이 하나라도 살아있으면(추가 매입) 허용한다.
    if (!existing && !errors[`purchases.${index}.unitPrice`]) {
      const key = productIdentityKey(incoming);
      const existingPrices = key
        ? existingUnitPricesByProduct.get(key)
        : undefined;
      const hasSurvivingRow = key
        ? (existingProductHasSurvivingRow.get(key) ?? false)
        : false;
      if (
        existingPrices &&
        !hasSurvivingRow &&
        !existingPrices.has(incoming.unitPrice)
      ) {
        errors[`purchases.${index}.unitPrice`] = [
          appliedUnitPriceBlockedMessage,
        ];
      }
    }
  });

  return errors;
}
