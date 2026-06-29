"use server";

import { createHash } from "node:crypto";

import {
  EcountSupplyImportError,
  parseEcountSupplyWorkbook,
} from "~/features/ledger/ecount-supply-import";
import {
  ECOUNT_PROVIDER,
  ecountDateNoToDate,
  productAliasKey,
  resolveBatchStatus,
  resolveEcountLine,
  storeAliasKey,
  type EcountLineStatus,
} from "~/features/ledger/ecount-supply-mapping";
import {
  getEcountSupplyImportDetail,
  type EcountImportBatchDetail,
} from "~/features/ledger/ecount-supply-queries";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import type { Prisma } from "~/../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import {
  requireEcountUploadPreviewAccess,
  requireSettingsAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { revalidateEcountImportPaths } from "~/server/revalidation";

const maxUploadBytes = 5 * 1024 * 1024;
const xlsxMimeType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

type AliasMaps = {
  storeByRaw: Map<string, string>;
  productByRaw: Map<string, string>;
};

async function loadAliasMaps(tx: Prisma.TransactionClient): Promise<AliasMaps> {
  const [storeAliases, productAliases] = await Promise.all([
    tx.storeExternalAlias.findMany({
      where: { provider: ECOUNT_PROVIDER },
      select: { rawName: true, storeId: true },
    }),
    tx.productExternalAlias.findMany({
      where: { provider: ECOUNT_PROVIDER },
      select: { rawName: true, rawSpec: true, productId: true },
    }),
  ]);

  const storeByRaw = new Map<string, string>();
  for (const alias of storeAliases) {
    storeByRaw.set(storeAliasKey(alias.rawName), alias.storeId);
  }

  const productByRaw = new Map<string, string>();
  for (const alias of productAliases) {
    productByRaw.set(
      productAliasKey(alias.rawName, alias.rawSpec),
      alias.productId,
    );
  }

  return { storeByRaw, productByRaw };
}

/**
 * batch의 모든 line에 현재 alias 매핑을 적용하고 line/batch 상태를 재계산한다.
 * COMMITTED/VOIDED batch는 건드리지 않는다.
 */
async function recomputeBatchMappingInTx(
  tx: Prisma.TransactionClient,
  batchId: string,
): Promise<void> {
  const batch = await tx.ecountImportBatch.findUnique({
    where: { id: batchId },
    include: { lines: true },
  });

  if (!batch || batch.status === "COMMITTED" || batch.status === "VOIDED") {
    return;
  }

  const aliases = await loadAliasMaps(tx);
  const lineStatuses: EcountLineStatus[] = [];

  for (const line of batch.lines) {
    const storeId =
      aliases.storeByRaw.get(storeAliasKey(line.rawStoreName)) ?? null;
    const productId =
      aliases.productByRaw.get(
        productAliasKey(line.rawProductName, line.productSpec),
      ) ?? null;

    // FAILED 라인은 파싱 단계의 영구 오류(수량 x 단가 불일치)다. 재매핑으로 지우지 않는다.
    const parseError = line.status === "FAILED" ? line.errorMessage : null;

    const resolution = resolveEcountLine({
      rawStoreName: line.rawStoreName,
      rawProductName: line.rawProductName,
      productSpec: line.productSpec,
      storeId,
      productId,
      error: parseError,
    });

    lineStatuses.push(resolution.status);

    await tx.ecountImportLine.update({
      where: { id: line.id },
      data: {
        storeId,
        productId,
        status: resolution.status,
        errorMessage: resolution.errorMessage,
      },
    });
  }

  await tx.ecountImportBatch.update({
    where: { id: batchId },
    data: { status: resolveBatchStatus(lineStatuses) },
  });
}

export async function previewEcountSupplyUpload(formData: FormData): Promise<
  ActionResult<{
    batchId: string;
    duplicate: boolean;
    detail: EcountImportBatchDetail;
  }>
> {
  const actor = await requireEcountUploadPreviewAccess();
  const file = formData.get("file");

  if (!isUploadFile(file)) {
    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 선택해 주세요.",
      {
        file: ["이카운트 엑셀 파일을 선택해 주세요."],
      },
    );
  }

  const browserFileName =
    "name" in file && typeof file.name === "string" ? file.name : "";
  const clientFileNameValue = formData.get("fileName");
  const clientFileName =
    typeof clientFileNameValue === "string" ? clientFileNameValue.trim() : "";
  const fileName = browserFileName.toLowerCase().endsWith(".xlsx")
    ? browserFileName
    : clientFileName || browserFileName;
  const fileType =
    "type" in file && typeof file.type === "string"
      ? file.type.toLowerCase()
      : "";

  if (!fileName.toLowerCase().endsWith(".xlsx") && fileType !== xlsxMimeType) {
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

  const fileHash = createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");

  // 중복 파일은 새 batch를 만들지 않고 기존 batch를 안내한다.
  const existing = await db.ecountImportBatch.findUnique({
    where: { fileHash },
    select: { id: true },
  });

  if (existing) {
    const detail = await getEcountSupplyImportDetail(existing.id);

    if (detail) {
      return actionOk({ batchId: existing.id, duplicate: true, detail });
    }
  }

  let parsed;

  try {
    parsed = parseEcountSupplyWorkbook(bytes);
  } catch (error) {
    if (error instanceof EcountSupplyImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 읽을 수 없습니다.",
      { file: ["이카운트 엑셀 파일을 읽을 수 없습니다."] },
    );
  }

  const businessDate = inferBusinessDate(
    parsed.lines.map((line) => line.dateNo),
  );

  const batchId = await db.$transaction(async (tx) => {
    const aliases = await loadAliasMaps(tx);
    const lineStatuses: EcountLineStatus[] = [];

    const batch = await tx.ecountImportBatch.create({
      data: {
        fileName,
        fileHash,
        sheetName: parsed.sheetName,
        businessDate,
        status: "PREVIEW",
        uploadedById: actor.id,
      },
    });

    for (const line of parsed.lines) {
      const storeId =
        aliases.storeByRaw.get(storeAliasKey(line.rawStoreName)) ?? null;
      const productId =
        aliases.productByRaw.get(
          productAliasKey(line.rawProductName, line.productSpec),
        ) ?? null;

      const resolution = resolveEcountLine({
        rawStoreName: line.rawStoreName,
        rawProductName: line.rawProductName,
        productSpec: line.productSpec,
        storeId,
        productId,
        error: line.error,
      });

      lineStatuses.push(resolution.status);

      await tx.ecountImportLine.create({
        data: {
          batchId: batch.id,
          rowNumber: line.rowNumber,
          dateNo: line.dateNo,
          rawStoreName: line.rawStoreName,
          storeId,
          rawProductName: line.rawProductName,
          productId,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          supplyAmount: line.supplyAmount,
          totalAmount: line.totalAmount,
          status: resolution.status,
          errorMessage: resolution.errorMessage,
        },
      });
    }

    await tx.ecountImportBatch.update({
      where: { id: batch.id },
      data: { status: resolveBatchStatus(lineStatuses) },
    });

    await writeAuditLog(tx, {
      action: "ecount_supply_import.previewed",
      targetType: "EcountImportBatch",
      targetId: batch.id,
      actorId: actor.id,
      before: null,
      after: {
        fileName,
        sheetName: parsed.sheetName,
        matchedRowCount: parsed.matchedRowCount,
        totalSupplyAmount: parsed.totalSupplyAmount,
      },
    });

    return batch.id;
  });

  revalidateEcountImportPaths(batchId);

  const detail = await getEcountSupplyImportDetail(batchId);

  if (!detail) {
    return actionError("UNKNOWN", "업로드 결과를 불러올 수 없습니다.");
  }

  return actionOk({ batchId, duplicate: false, detail });
}

function inferBusinessDate(dateNos: string[]): Date | null {
  for (const dateNo of dateNos) {
    const isoDate = ecountDateNoToDate(dateNo);

    if (isoDate) {
      const date = new Date(`${isoDate}T00:00:00.000Z`);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

export async function saveEcountStoreAlias(input: {
  batchId: string;
  rawName: string;
  storeId: string;
}): Promise<ActionResult<{ detail: EcountImportBatchDetail }>> {
  const actor = await requireSettingsAccess();
  const rawName = storeAliasKey(String(input.rawName ?? ""));
  const storeId = String(input.storeId ?? "");

  if (!rawName || !storeId) {
    return actionError("VALIDATION_ERROR", "거래처명과 지점을 선택해 주세요.");
  }

  await db.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId } });

    if (!store) {
      throw new EcountSupplyImportError("선택한 지점을 찾을 수 없습니다.");
    }

    const before = await tx.storeExternalAlias.findUnique({
      where: { provider_rawName: { provider: ECOUNT_PROVIDER, rawName } },
    });

    const alias = await tx.storeExternalAlias.upsert({
      where: { provider_rawName: { provider: ECOUNT_PROVIDER, rawName } },
      create: {
        provider: ECOUNT_PROVIDER,
        rawName,
        storeId,
        updatedById: actor.id,
      },
      update: { storeId, updatedById: actor.id },
    });

    await writeAuditLog(tx, {
      action: before
        ? "store_external_alias.updated"
        : "store_external_alias.created",
      targetType: "StoreExternalAlias",
      targetId: alias.id,
      actorId: actor.id,
      before: before
        ? { rawName: before.rawName, storeId: before.storeId }
        : null,
      after: { rawName, storeId },
    });

    await recomputeBatchMappingInTx(tx, String(input.batchId));
  });

  revalidateEcountImportPaths(String(input.batchId));

  const detail = await getEcountSupplyImportDetail(String(input.batchId));

  if (!detail) {
    return actionError("NOT_FOUND", "업로드 batch를 찾을 수 없습니다.");
  }

  return actionOk({ detail });
}

/**
 * WO(2026-06-24) Task 7: 미매핑 이카운트 품목을 기존 앱 품목에 연결하는 대신
 * 새 앱 품목을 만들어 연결한다. batch line의 원문 품목명/구분/규격/단가로 Product를 만들고
 * (이미 같은 name/category/spec이 있으면 재사용) ProductExternalAlias를 저장한 뒤 매핑을 재계산한다.
 */
// WO-09(2026-06-28): 신규 품목 분류는 본사가 확정한다. 2026-06-29 기준자료
// (docs/meeting_0627/냉동_생물_자료.xlsx) 도착 후, UI는 기준 규칙(classifyProductCategory:
// "냉)" 접두만 냉동, 나머지 생물) 자동 분류값을 드롭다운 기본값으로 채워 두되, 본사가
// 그대로 확정하거나 바꿀 수 있게 한다. 서버는 여전히 본사가 보낸 선택값만 신뢰한다.
const NEW_PRODUCT_CATEGORIES = ["냉동", "생물", "기준 미정"] as const;
type NewProductCategory = (typeof NEW_PRODUCT_CATEGORIES)[number];

function isNewProductCategory(value: string): value is NewProductCategory {
  return (NEW_PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

export async function createEcountProductFromLine(input: {
  batchId: string;
  rawName: string;
  rawSpec: string;
  category: string;
}): Promise<ActionResult<{ detail: EcountImportBatchDetail }>> {
  const actor = await requireSettingsAccess();
  const batchId = String(input.batchId ?? "");
  const rawName = String(input.rawName ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const rawSpec = String(input.rawSpec ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const selectedCategory = String(input.category ?? "").trim();

  if (!batchId || !rawName) {
    return actionError("VALIDATION_ERROR", "품목 정보를 확인해 주세요.");
  }

  if (!isNewProductCategory(selectedCategory)) {
    return actionError(
      "VALIDATION_ERROR",
      "품목 분류(냉동/생물/기준 미정)를 선택해 주세요.",
    );
  }

  try {
    await db.$transaction(async (tx) => {
      // 원문 품목명/규격에 해당하는 batch line에서 품목 속성을 가져온다.
      const sampleLine = await tx.ecountImportLine.findFirst({
        where: { batchId, rawProductName: rawName, productSpec: rawSpec },
        orderBy: { rowNumber: "asc" },
        select: {
          productName: true,
          productCategory: true,
          productSpec: true,
        },
      });

      if (!sampleLine) {
        throw new EcountSupplyImportError(
          "해당 품목의 업로드 행을 찾을 수 없습니다.",
        );
      }

      const name = sampleLine.productName.trim() || rawName;
      // WO-09(2026-06-28): 파서가 추측한 productCategory를 쓰지 않고, 본사가 고른 분류를 쓴다.
      const category = selectedCategory;
      const spec = sampleLine.productSpec.trim();

      // 동일 name/category/spec 품목이 이미 있으면 재사용한다(중복 생성 방지).
      const existingProduct = await tx.product.findUnique({
        where: { name_category_spec: { name, category, spec } },
        select: { id: true },
      });

      const product =
        existingProduct ??
        (await tx.product.create({
          data: {
            name,
            category,
            spec,
            // 정책 전환(2026-06-24): 이카운트 원본 단가를 품목 마스터의 고정 단가로
            // 박지 않는다. 입고 원가는 EcountImportLine.unitPrice와 장부 적용 단가
            // (LedgerPurchaseItem.unitPrice)에서만 보존한다. 마스터 단가는 미입력(null).
            isActive: true,
            updatedById: actor.id,
          },
          select: { id: true },
        }));

      if (!existingProduct) {
        await writeAuditLog(tx, {
          action: "product.created",
          targetType: "Product",
          targetId: product.id,
          actorId: actor.id,
          before: null,
          after: { name, category, spec },
          reason: "이카운트 업로드 미매핑 품목 신규 생성",
        });
      }

      const before = await tx.productExternalAlias.findUnique({
        where: {
          provider_rawName_rawSpec: {
            provider: ECOUNT_PROVIDER,
            rawName,
            rawSpec,
          },
        },
      });

      const alias = await tx.productExternalAlias.upsert({
        where: {
          provider_rawName_rawSpec: {
            provider: ECOUNT_PROVIDER,
            rawName,
            rawSpec,
          },
        },
        create: {
          provider: ECOUNT_PROVIDER,
          rawName,
          rawSpec,
          productId: product.id,
          updatedById: actor.id,
        },
        update: { productId: product.id, updatedById: actor.id },
      });

      await writeAuditLog(tx, {
        action: before
          ? "product_external_alias.updated"
          : "product_external_alias.created",
        targetType: "ProductExternalAlias",
        targetId: alias.id,
        actorId: actor.id,
        before: before
          ? {
              rawName: before.rawName,
              rawSpec: before.rawSpec,
              productId: before.productId,
            }
          : null,
        after: { rawName, rawSpec, productId: product.id },
      });

      await recomputeBatchMappingInTx(tx, batchId);
    });
  } catch (error) {
    if (error instanceof EcountSupplyImportError) {
      return actionError("VALIDATION_ERROR", error.message);
    }

    throw error;
  }

  revalidateEcountImportPaths(batchId);

  const detail = await getEcountSupplyImportDetail(batchId);

  if (!detail) {
    return actionError("NOT_FOUND", "업로드 batch를 찾을 수 없습니다.");
  }

  return actionOk({ detail });
}

export async function saveEcountProductAlias(input: {
  batchId: string;
  rawName: string;
  rawSpec: string;
  productId: string;
}): Promise<ActionResult<{ detail: EcountImportBatchDetail }>> {
  const actor = await requireSettingsAccess();
  const rawName = String(input.rawName ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const rawSpec = String(input.rawSpec ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const productId = String(input.productId ?? "");

  if (!rawName || !productId) {
    return actionError("VALIDATION_ERROR", "품목명과 앱 품목을 선택해 주세요.");
  }

  await db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });

    if (!product) {
      throw new EcountSupplyImportError("선택한 품목을 찾을 수 없습니다.");
    }

    const before = await tx.productExternalAlias.findUnique({
      where: {
        provider_rawName_rawSpec: {
          provider: ECOUNT_PROVIDER,
          rawName,
          rawSpec,
        },
      },
    });

    const alias = await tx.productExternalAlias.upsert({
      where: {
        provider_rawName_rawSpec: {
          provider: ECOUNT_PROVIDER,
          rawName,
          rawSpec,
        },
      },
      create: {
        provider: ECOUNT_PROVIDER,
        rawName,
        rawSpec,
        productId,
        updatedById: actor.id,
      },
      update: { productId, updatedById: actor.id },
    });

    await writeAuditLog(tx, {
      action: before
        ? "product_external_alias.updated"
        : "product_external_alias.created",
      targetType: "ProductExternalAlias",
      targetId: alias.id,
      actorId: actor.id,
      before: before
        ? {
            rawName: before.rawName,
            rawSpec: before.rawSpec,
            productId: before.productId,
          }
        : null,
      after: { rawName, rawSpec, productId },
    });

    await recomputeBatchMappingInTx(tx, String(input.batchId));
  });

  revalidateEcountImportPaths(String(input.batchId));

  const detail = await getEcountSupplyImportDetail(String(input.batchId));

  if (!detail) {
    return actionError("NOT_FOUND", "업로드 batch를 찾을 수 없습니다.");
  }

  return actionOk({ detail });
}
