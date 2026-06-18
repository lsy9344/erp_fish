"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  requireHeadquartersStoreScope,
  requireLedgerHqEditAccess,
} from "~/server/authz";
import {
  EcountPurchaseImportError,
  parseEcountPurchaseWorkbook,
  type EcountPurchaseImportResult,
} from "./ecount-purchase-import";

const maxUploadBytes = 5 * 1024 * 1024;

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

export async function previewEcountPurchaseUpload(
  formData: FormData,
): Promise<ActionResult<EcountPurchaseImportResult>> {
  const storeId = formString(formData, "storeId");
  const closingDate = formString(formData, "closingDate");
  const file = formData.get("file");

  if (!storeId || !closingDate || !isUploadFile(file)) {
    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 선택해 주세요.",
      {
        file: ["이카운트 엑셀 파일을 선택해 주세요."],
      },
    );
  }

  await requireLedgerHqEditAccess();
  const { store } = await requireHeadquartersStoreScope(storeId);

  const fileName = "name" in file ? String(file.name) : "";

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return actionError(
      "VALIDATION_ERROR",
      "xlsx 파일만 업로드할 수 있습니다.",
      {
        file: ["xlsx 파일만 업로드할 수 있습니다."],
      },
    );
  }

  const bytes = await file.arrayBuffer();

  if (bytes.byteLength > maxUploadBytes) {
    return actionError("VALIDATION_ERROR", "엑셀 파일 용량을 확인해 주세요.", {
      file: ["5MB 이하의 xlsx 파일만 업로드할 수 있습니다."],
    });
  }

  try {
    return actionOk(
      parseEcountPurchaseWorkbook(bytes, {
        storeName: store.name,
        closingDate,
      }),
    );
  } catch (error) {
    if (error instanceof EcountPurchaseImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 읽을 수 없습니다.",
      { file: ["이카운트 엑셀 파일을 읽을 수 없습니다."] },
    );
  }
}
