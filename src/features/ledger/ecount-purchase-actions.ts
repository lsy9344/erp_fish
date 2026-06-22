"use server";

import {
  actionError,
  actionOk,
  type ActionResult,
} from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  requireLedgerHqEditAccess,
  requireHeadquartersStoreScope,
} from "~/server/authz";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateLedgerDetailPath,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import { syncLedgerInventoryPurchasedQuantitiesInTx } from "~/features/inventory/adjustment-reconciliation";
import {
  parseEcountPurchaseWorkbook,
  type EcountPurchaseImportLine,
  EcountPurchaseImportError,
} from "./ecount-purchase-import";
import { isLedgerEditable } from "./status-policy";

const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000; // 30분

export type EcountPurchasePreviewResult = {
  ledgerId: string;
  storeId: string;
  storeName: string;
  closingDate: string;
  purchases: EcountPurchaseImportLine[];
  sheetName: string;
  matchedRowCount: number;
  importSessionId: string;
};

export async function previewEcountLedgerPurchases(
  ledgerId: string,
  formData: FormData,
): Promise<ActionResult<EcountPurchasePreviewResult>> {
  const user = await requireLedgerHqEditAccess();

  const ledger = await db.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: {
      id: true,
      storeId: true,
      closingDate: true,
      store: { select: { name: true } },
      status: true,
    },
  });

  if (!ledger) {
    return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
  }

  await requireHeadquartersStoreScope(ledger.storeId);

  if (!isLedgerEditable(ledger.status)) {
    return actionError(
      "LEDGER_NOT_EDITABLE",
      "편집할 수 없는 장부 상태입니다.",
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return actionError("VALIDATION_ERROR", "파일을 확인해 주세요.", {
      file: ["엑셀 파일을 선택해 주세요."],
    });
  }

  const buffer = await file.arrayBuffer();
  const closingDateParam = ledger.closingDate.toISOString().slice(0, 10);

  let result;

  try {
    result = parseEcountPurchaseWorkbook(buffer, {
      storeName: ledger.store.name,
      closingDate: closingDateParam,
      validateLedgerScope: true,
    });
  } catch (error) {
    if (error instanceof EcountPurchaseImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError(
      "VALIDATION_ERROR",
      "파일을 읽는 중 오류가 발생했습니다.",
      { file: ["지원하는 이카운트 엑셀 형식인지 확인해 주세요."] },
    );
  }

  const expiresAt = new Date(Date.now() + IMPORT_SESSION_TTL_MS);

  const session = await db.ecountImportSession.create({
    data: {
      ledgerId: ledger.id,
      actorId: user.id,
      purchasesJson: result.purchases,
      expiresAt,
    },
    select: { id: true },
  });

  return actionOk({
    ledgerId: ledger.id,
    storeId: ledger.storeId,
    storeName: ledger.store.name,
    closingDate: closingDateParam,
    purchases: result.purchases,
    sheetName: result.sheetName,
    matchedRowCount: result.matchedRowCount,
    importSessionId: session.id,
  });
}

export async function commitEcountLedgerPurchases(
  ledgerId: string,
  importSessionId: string,
): Promise<ActionResult<{ savedCount: number }>> {
  const user = await requireLedgerHqEditAccess();

  const [ledger, session] = await Promise.all([
    db.dailyLedger.findUnique({
      where: { id: ledgerId },
      select: {
        id: true,
        storeId: true,
        closingDate: true,
        status: true,
      },
    }),
    db.ecountImportSession.findUnique({
      where: { id: importSessionId },
      select: {
        id: true,
        ledgerId: true,
        actorId: true,
        purchasesJson: true,
        expiresAt: true,
      },
    }),
  ]);

  if (!ledger) {
    return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
  }

  await requireHeadquartersStoreScope(ledger.storeId);

  if (!isLedgerEditable(ledger.status)) {
    return actionError(
      "LEDGER_NOT_EDITABLE",
      "편집할 수 없는 장부 상태입니다.",
    );
  }

  if (!session) {
    return actionError(
      "IMPORT_SESSION_NOT_FOUND",
      "미리보기 세션을 찾을 수 없습니다. 파일을 다시 선택해 주세요.",
    );
  }

  if (session.ledgerId !== ledgerId) {
    return actionError(
      "IMPORT_SESSION_MISMATCH",
      "미리보기 세션이 이 장부와 일치하지 않습니다.",
    );
  }

  if (session.actorId !== user.id) {
    return actionError(
      "IMPORT_SESSION_MISMATCH",
      "미리보기 세션의 작성자가 일치하지 않습니다.",
    );
  }

  if (session.expiresAt < new Date()) {
    return actionError(
      "IMPORT_SESSION_EXPIRED",
      "미리보기 세션이 만료됐습니다. 파일을 다시 선택해 주세요.",
    );
  }

  const purchases = session.purchasesJson as EcountPurchaseImportLine[];

  if (!Array.isArray(purchases) || purchases.length === 0) {
    return actionError("VALIDATION_ERROR", "가져올 매입 행이 없습니다.", {
      purchases: ["미리보기 결과가 없습니다."],
    });
  }

  const productIds = [...new Set(purchases.map((p) => p.productId).filter(Boolean))];
  const purchaseStandardIds = [...new Set(purchases.map((p) => p.purchaseStandardId).filter(Boolean))];

  const [existingProducts, existingStandards] = await Promise.all([
    productIds.length > 0
      ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
      : Promise.resolve([]),
    purchaseStandardIds.length > 0
      ? db.purchaseStandard.findMany({ where: { id: { in: purchaseStandardIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const validProductIds = new Set(existingProducts.map((p) => p.id));
  const validStandardIds = new Set(existingStandards.map((s) => s.id));

  const fieldErrors: Record<string, string[]> = {};

  purchases.forEach((purchase, index) => {
    if (!purchase.productName || purchase.productName.trim() === "") {
      fieldErrors[`purchases.${index}.productName`] = ["품목명이 비어 있습니다."];
    }

    const unitPrice = Number(purchase.unitPrice);
    const quantity = Number(purchase.quantity);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      fieldErrors[`purchases.${index}.unitPrice`] = ["단가가 올바르지 않습니다."];
    }

    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      fieldErrors[`purchases.${index}.quantity`] = ["수량이 올바르지 않습니다."];
    }

    if (purchase.productId && !validProductIds.has(purchase.productId)) {
      fieldErrors[`purchases.${index}.productId`] = [
        `품목 '${purchase.productName}'을 찾을 수 없습니다.`,
      ];
    }

    if (purchase.purchaseStandardId && !validStandardIds.has(purchase.purchaseStandardId)) {
      fieldErrors[`purchases.${index}.purchaseStandardId`] = [
        `매입기준 '${purchase.productName}'을 찾을 수 없습니다.`,
      ];
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return actionError(
      "VALIDATION_ERROR",
      "매입 품목 매핑을 확인해 주세요.",
      fieldErrors,
    );
  }

  const closingDateInput = ledger.closingDate.toISOString().slice(0, 10);

  const savedCount = await db.$transaction(async (tx) => {
    await tx.ecountImportSession.delete({ where: { id: session.id } });

    const rows = purchases.map((purchase) => {
      const unitPrice = Number(purchase.unitPrice);
      const quantity = Number(purchase.quantity);

      return tx.ledgerPurchaseItem.create({
        data: {
          dailyLedgerId: ledgerId,
          productId: purchase.productId || null,
          purchaseStandardId: purchase.purchaseStandardId || null,
          sourceType: "ECOUNT_UPLOAD",
          productName: purchase.productName,
          productCategory: purchase.productCategory,
          productSpec: purchase.productSpec,
          unitPrice,
          quantity,
          amount: unitPrice * quantity,
          referenceInfo: purchase.referenceInfo,
          createdById: user.id,
          updatedById: user.id,
        },
      });
    });

    const created = await Promise.all(rows);

    await syncLedgerInventoryPurchasedQuantitiesInTx(tx, ledgerId, user.id);

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ECOUNT_PURCHASE_IMPORT",
      targetType: "DailyLedger",
      targetId: ledgerId,
      after: {
        savedCount: created.length,
        storeId: ledger.storeId,
        closingDate: closingDateInput,
        importSessionId: session.id,
      },
    });

    return created.length;
  });

  revalidateLedgerDetailPath(ledgerId);
  revalidateStoreEntryPaths();
  revalidateDashboardAndReports();

  return actionOk({ savedCount: savedCount ?? 0 });
}
