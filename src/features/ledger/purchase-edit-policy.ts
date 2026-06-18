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

const ecountEditBlockedMessage =
  "이카운트 업로드 매입은 지점에서 수정할 수 없습니다.";
const ecountDeleteBlockedMessage =
  "이카운트 업로드 매입은 지점에서 삭제할 수 없습니다.";
const ecountCreateBlockedMessage =
  "이카운트 업로드 매입은 본사 업로드로만 만들 수 있습니다.";

function nullableText(value: string | null) {
  return value ?? "";
}

function isSameEcountPurchase(
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
    existing.unitPrice === incoming.unitPrice &&
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

    if (!isSameEcountPurchase(existing, incomingRows[incomingIndex]!)) {
      errors[`purchases.${incomingIndex}`] = [ecountEditBlockedMessage];
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
