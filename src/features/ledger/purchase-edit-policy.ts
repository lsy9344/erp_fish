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

// WO(2026-06-24): 지점장은 이카운트 출고/입고 라인의 "장부 적용 단가(unitPrice)"만 수정할 수 있다.
// 원본 정보(품목, 원본 행, 원본 거래처명, 수량, referenceInfo)는 수정/삭제할 수 없고,
// 새 ECOUNT_UPLOAD 라인을 직접 만들 수 없다. 원본 단가는 sourceUnitPrice/EcountImportLine에 보존된다.
const ecountRawFieldBlockedMessage =
  "이카운트 출고/입고 라인의 원본 정보(품목·수량·원본 행)는 수정할 수 없습니다. 장부 적용 단가만 수정할 수 있습니다.";
const ecountDeleteBlockedMessage =
  "이카운트 출고/입고 라인은 장부 매입 화면에서 삭제할 수 없습니다.";
const ecountCreateBlockedMessage =
  "이카운트 출고/입고 라인은 본사 이카운트 업로드 화면에서만 만들 수 있습니다.";

function nullableText(value: string | null) {
  return value ?? "";
}

/**
 * unitPrice(장부 적용 단가)를 제외한 원본 필드가 동일한지 확인한다.
 * unitPrice 변경은 허용되므로 비교에서 제외한다.
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
    nullableText(existing.referenceInfo) ===
      nullableText(incoming.referenceInfo)
  );
}

export function getStoreEcountPurchaseEditErrors(
  existingRows: PurchaseEditPolicyLine[],
  incomingRows: PurchaseEditPolicyLine[],
) {
  const errors: Record<string, string[]> = {};
  const existingEcountRows = existingRows.filter(
    (row) => row.sourceType === "ECOUNT_UPLOAD",
  );
  const existingEcountIds = new Set(existingEcountRows.map((row) => row.id));

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
  });

  return errors;
}
