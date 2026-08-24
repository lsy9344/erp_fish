import type { Prisma } from "../../../generated/prisma";

import {
  ECOUNT_PROVIDER,
  productAliasKey,
  resolveBatchStatus,
  resolveEcountLine,
  storeAliasKey,
  type EcountLineStatus,
} from "./ecount-supply-mapping.ts";

export type EcountResolutionMaps = {
  storeByRaw: Map<string, string>;
  productByRaw: Map<string, string>;
};

/** 활성 별칭을 먼저 쓰고, 별칭이 없을 때 활성 지점의 정확한 이름을 쓴다. */
export async function loadEcountResolutionMapsInTx(
  tx: Prisma.TransactionClient,
): Promise<EcountResolutionMaps> {
  const [storeAliases, stores, productAliases] = await Promise.all([
    tx.storeExternalAlias.findMany({
      where: { provider: ECOUNT_PROVIDER },
      select: { rawName: true, storeId: true },
    }),
    tx.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    tx.productExternalAlias.findMany({
      where: { provider: ECOUNT_PROVIDER },
      select: { rawName: true, rawSpec: true, productId: true },
    }),
  ]);

  const activeStoreIds = new Set(stores.map((store) => store.id));
  const storeByRaw = new Map(
    stores.map((store) => [storeAliasKey(store.name), store.id]),
  );

  // 같은 원문에 활성 별칭이 있으면 정확한 지점명보다 우선한다.
  for (const alias of storeAliases) {
    if (activeStoreIds.has(alias.storeId)) {
      storeByRaw.set(storeAliasKey(alias.rawName), alias.storeId);
    }
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

/** 미완료 업로드를 현재 활성 지점/별칭 기준으로 다시 판정한다. */
export async function recomputeEcountBatchMappingInTx(
  tx: Prisma.TransactionClient,
  batchId: string,
): Promise<void> {
  // 조회 중 재판정과 실제 반영이 엇갈려 COMMITTED 상태를 READY로 되돌리지 않도록
  // 이 batch를 만지는 모든 transaction이 같은 잠금을 사용한다.
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${`ecount-import:${batchId}`}))`;

  const batch = await tx.ecountImportBatch.findUnique({
    where: { id: batchId },
    include: { lines: true },
  });

  if (!batch || batch.status === "COMMITTED" || batch.status === "VOIDED") {
    return;
  }

  const maps = await loadEcountResolutionMapsInTx(tx);
  const lineStatuses: EcountLineStatus[] = [];

  for (const line of batch.lines) {
    const storeId =
      maps.storeByRaw.get(storeAliasKey(line.rawStoreName)) ?? null;
    const productId =
      maps.productByRaw.get(
        productAliasKey(line.rawProductName, line.productSpec),
      ) ?? null;
    const resolution = resolveEcountLine({
      rawStoreName: line.rawStoreName,
      rawProductName: line.rawProductName,
      productSpec: line.productSpec,
      storeId,
      productId,
      error: line.errorMessage,
      storeExcluded: !storeId,
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
    data: {
      status: resolveBatchStatus(lineStatuses),
      errorMessage: null,
    },
  });
}
