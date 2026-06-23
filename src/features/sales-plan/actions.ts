"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  assertStoreManagerClosingDateIsToday,
  getKstBusinessDate,
} from "~/features/ledger/date";
import { revalidateStoreEntryPaths } from "~/server/revalidation";
import {
  salesPricePlanSchema,
  salesPricePlanStoreAccessSchema,
  toFieldErrors,
  type SalesPricePlanInput,
  type SalesPricePlanStoreAccessInput,
} from "./schemas";
import { getSalesPricePlanStepDataInTx } from "./queries";
import { type SalesPricePlanStepData } from "./types";

function parseSalesPricePlanInput(
  input: unknown,
): ActionResult<SalesPricePlanInput> {
  const parsed = salesPricePlanSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseSalesPricePlanStoreAccessInput(
  input: unknown,
): ActionResult<SalesPricePlanStoreAccessInput> {
  const parsed = salesPricePlanStoreAccessSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function mapStoreActionError(): ActionResult<never> {
  return actionError(
    "SALES_PLAN_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

export async function saveSalesPricePlan(
  input: unknown,
): Promise<ActionResult<SalesPricePlanStepData>> {
  const access = parseSalesPricePlanStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseSalesPricePlanInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  // WO-A 후속(point_summary.md:33): 지점장 전용 저장 액션은 KST 오늘 날짜만 허용한다.
  // 화면은 비당일 날짜를 막지만, 요청 조작으로 과거/미래 판매가 계획을 저장하는 것을
  // 서버에서 차단한다. (손실/장부 저장 액션과 동일한 가드)
  const dateGuard = assertStoreManagerClosingDateIsToday(
    parsed.data.businessDate,
  );

  if (!dateGuard.ok) {
    return actionError(dateGuard.code, dateGuard.message);
  }

  const businessDateValue = getKstBusinessDate(parsed.data.businessDate);

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getSalesPricePlanStepDataInTx(
        tx,
        parsed.data.storeId,
        parsed.data.businessDate,
      );

      // 같은 품목을 여러 번 입력하면 마지막 값만 유지한다(품목당 1행 보장).
      const planByProductId = new Map<
        string,
        SalesPricePlanInput["plans"][number]
      >();
      for (const plan of parsed.data.plans) {
        planByProductId.set(plan.productId, plan);
      }

      const productIds = [...planByProductId.keys()];
      const activeProducts =
        productIds.length > 0
          ? await tx.product.findMany({
              where: { id: { in: productIds }, isActive: true },
              select: { id: true },
            })
          : [];
      const activeProductIds = new Set(
        activeProducts.map((product) => product.id),
      );

      for (let index = 0; index < parsed.data.plans.length; index += 1) {
        const plan = parsed.data.plans[index]!;

        if (!activeProductIds.has(plan.productId)) {
          return actionError<SalesPricePlanStepData>(
            "VALIDATION_ERROR",
            "활성 품목만 저장할 수 있습니다.",
            {
              [`plans.${index}.productId`]: ["활성 품목을 선택해 주세요."],
            },
          );
        }
      }

      // 입력에 없는 품목의 기존 계획은 삭제(품목 행 제거 = 계획 취소).
      const keepProductIds = [...activeProductIds];
      await tx.storeSalesPricePlan.deleteMany({
        where: {
          storeId: parsed.data.storeId,
          businessDate: businessDateValue,
          ...(keepProductIds.length > 0
            ? { productId: { notIn: keepProductIds } }
            : {}),
        },
      });

      for (const productId of keepProductIds) {
        const plan = planByProductId.get(productId)!;

        await tx.storeSalesPricePlan.upsert({
          where: {
            storeId_businessDate_productId: {
              storeId: parsed.data.storeId,
              businessDate: businessDateValue,
              productId,
            },
          },
          update: {
            plannedUnitPrice: plan.plannedUnitPrice,
            memo: plan.memo,
            updatedById: actor.user.id,
          },
          create: {
            storeId: parsed.data.storeId,
            businessDate: businessDateValue,
            productId,
            plannedUnitPrice: plan.plannedUnitPrice,
            memo: plan.memo,
            createdById: actor.user.id,
            updatedById: actor.user.id,
          },
        });
      }

      const after = await getSalesPricePlanStepDataInTx(
        tx,
        parsed.data.storeId,
        parsed.data.businessDate,
      );

      await writeAuditLog(tx, {
        action: "sales_plan.saved",
        targetType: "StoreSalesPricePlan",
        targetId: `${parsed.data.storeId}:${parsed.data.businessDate}`,
        actorId: actor.user.id,
        before,
        after,
      });

      return actionOk(after);
    });

    if (!result.ok) {
      return result;
    }

    revalidateStoreEntryPaths(["sales-plan", "losses"]);

    return result;
  } catch {
    return mapStoreActionError();
  }
}
