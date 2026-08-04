import type { Prisma } from "../../../generated/prisma";

// DESIGN.md D6: 판매한 가격 수정은 마감 장부의 마스터 편집 전용이다. 서버 최종
// 판정을 순수 함수로 분리해 단위 테스트가 action 파일 없이 검증할 수 있게 한다.
export const salesPriceWriteForbiddenMessage =
  "판매한 가격은 마감 장부에서 마감 편집 권한을 가진 사용자만 수정할 수 있습니다.";

export function getSalesPriceWriteGateDecision(input: {
  hasPlannedPriceInput: boolean;
  closedEditAllowed: boolean;
  ledgerStatus: string;
}): { ok: true } | { ok: false; code: "LEDGER_NOT_EDITABLE"; message: string } {
  if (!input.hasPlannedPriceInput) {
    return { ok: true };
  }

  if (
    !input.closedEditAllowed ||
    input.ledgerStatus !== "HEADQUARTERS_CLOSED"
  ) {
    return {
      ok: false,
      code: "LEDGER_NOT_EDITABLE",
      message: salesPriceWriteForbiddenMessage,
    };
  }

  return { ok: true };
}

/**
 * DESIGN.md D6: 판매한 가격(StoreSalesPricePlan) 벌크 저장 helper.
 *
 * 품목별 upsert를 개별 호출하면 DB 왕복이 품목 수만큼 늘어난다. Prisma는 인터랙티브
 * 트랜잭션 안의 동시 요청을 한 왕복으로 묶어주지 않으므로 Promise.all도 소용없다
 * (프로덕션 Neon 측정: 41건 순차 9.1s / Promise.all 8.3s / 단일 statement 0.8s).
 * 저장 트랜잭션이 30s 타임아웃(P2028)을 넘기는 주원인이었다. 조회 1회 + 벌크 UPDATE
 * 1회 + createMany 1회로 품목 수와 무관하게 왕복 3회로 고정한다.
 *
 * 식별 키는 (storeId, businessDate, productId)다. 지점장 저장과 본사 마감 편집이
 * 같은 helper를 공유한다.
 */
export async function upsertInventorySalesPricePlansInTx(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    businessDate: Date;
    items: { productId: string; plannedUnitPrice: number }[];
    actorId: string;
  },
): Promise<void> {
  if (input.items.length === 0) {
    return;
  }

  const existingPlans = await tx.storeSalesPricePlan.findMany({
    where: {
      storeId: input.storeId,
      businessDate: input.businessDate,
      productId: { in: input.items.map((item) => item.productId) },
    },
    select: { productId: true },
  });
  const existingProductIds = new Set(
    existingPlans.map((plan) => plan.productId),
  );
  const plansToUpdate = input.items.filter((item) =>
    existingProductIds.has(item.productId),
  );
  const plansToCreate = input.items.filter(
    (item) => !existingProductIds.has(item.productId),
  );

  if (plansToUpdate.length > 0) {
    // 자리표시자는 배열 길이로만 만들고 값은 전부 바인딩 파라미터다(입력값이 SQL에
    // 섞이지 않는다). SET 목록을 plannedUnitPrice/updatedById/updatedAt으로 한정해
    // memo·createdAt·createdById를 건드리지 않는 기존 patch-only 계약을 유지한다.
    const rowValues = plansToUpdate
      .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2}::int)`)
      .join(", ");
    const tailIndex = plansToUpdate.length * 2;

    await tx.$executeRawUnsafe(
      `UPDATE "StoreSalesPricePlan" AS plan
          SET "plannedUnitPrice" = source."plannedUnitPrice",
              "updatedById" = $${tailIndex + 1},
              "updatedAt" = now()
         FROM (VALUES ${rowValues})
           AS source("productId", "plannedUnitPrice")
        WHERE plan."storeId" = $${tailIndex + 2}
          AND plan."businessDate" = $${tailIndex + 3}
          AND plan."productId" = source."productId"`,
      ...plansToUpdate.flatMap((item) => [
        item.productId,
        item.plannedUnitPrice,
      ]),
      input.actorId,
      input.storeId,
      input.businessDate,
    );
  }

  if (plansToCreate.length > 0) {
    await tx.storeSalesPricePlan.createMany({
      data: plansToCreate.map((item) => ({
        storeId: input.storeId,
        businessDate: input.businessDate,
        productId: item.productId,
        plannedUnitPrice: item.plannedUnitPrice,
        createdById: input.actorId,
        updatedById: input.actorId,
      })),
    });
  }
}
