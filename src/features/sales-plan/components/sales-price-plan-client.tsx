"use client";

import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveSalesPricePlan } from "~/features/sales-plan/actions";
import { type SalesPricePlanStepData } from "~/features/sales-plan/types";
import { type ActionResult, type FieldErrors } from "~/lib/action-result";

type SalesPlanLineState = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  plannedUnitPrice: string;
  memo: string;
};

type SalesPricePlanClientProps = {
  storeName: string;
  initialData: SalesPricePlanStepData;
  saveAction?: (
    input: unknown,
  ) => Promise<ActionResult<SalesPricePlanStepData>>;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// 활성 품목 전체를 한 줄씩 보여주고, 저장된 계획값을 채워 넣는다.
function toLineState(data: SalesPricePlanStepData): SalesPlanLineState[] {
  const planByProductId = new Map(
    data.plans.map((plan) => [plan.productId, plan]),
  );

  return data.productOptions.map((product) => {
    const plan = planByProductId.get(product.id);

    return {
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      plannedUnitPrice:
        plan?.plannedUnitPrice !== undefined
          ? String(plan.plannedUnitPrice)
          : "",
      memo: plan?.memo ?? "",
    };
  });
}

function parseNumber(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return 0;
  }

  const parsed = Number(trimmed);

  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function hasPrice(value: string) {
  return value.trim().length > 0;
}

function findProductIndex(data: SalesPricePlanStepData, productId: string) {
  return data.productOptions.findIndex((product) => product.id === productId);
}

export function SalesPricePlanClient({
  storeName,
  initialData,
  saveAction = saveSalesPricePlan,
}: SalesPricePlanClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const priceRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function clearFeedback() {
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
  }

  function updateLine(productId: string, next: Partial<SalesPlanLineState>) {
    clearFeedback();
    setItems((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, ...next } : line,
      ),
    );
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      const pricedItems = items.filter((item) =>
        hasPrice(item.plannedUnitPrice),
      );

      for (let index = 0; index < pricedItems.length; index += 1) {
        if (errors[`plans.${index}.plannedUnitPrice`]?.length) {
          const productIndex = findProductIndex(
            data,
            pricedItems[index]!.productId,
          );

          priceRefs.current[productIndex]?.focus();
          return;
        }
      }
    }, 50);
  }

  async function saveCurrentDraft() {
    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const plans = items
        .filter((item) => hasPrice(item.plannedUnitPrice))
        .map((item) => ({
          productId: item.productId,
          plannedUnitPrice: item.plannedUnitPrice,
          memo: item.memo,
        }));

      const result = await saveAction({
        storeId: data.storeId,
        businessDate: data.businessDate,
        plans,
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return false;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      const savedCount = result.data.plans.length;
      const message =
        savedCount > 0
          ? `예상 판매가 ${savedCount}건을 저장했습니다.`
          : "저장됐습니다.";
      setResultMessage(message);
      toast.success(message);
      return true;
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentDraft();
  }

  const hasOptions = data.productOptions.length > 0;
  const pricedCount = items.filter((item) =>
    hasPrice(item.plannedUnitPrice),
  ).length;
  const draftTotalPlannedPrice = items.reduce(
    (sum, item) => sum + parseNumber(item.plannedUnitPrice),
    0,
  );
  const savedAt = formatDateTime(data.updatedAt);

  // 가격이 입력된 행만 서버 plans 배열로 전송되므로, 품목별로 서버 인덱스를
  // 미리 계산해 두고 필드 오류를 해당 행에 매핑한다.
  const serverPlanIndexByProductId = new Map<string, number>();
  items
    .filter((item) => hasPrice(item.plannedUnitPrice))
    .forEach((item, index) => {
      serverPlanIndexByProductId.set(item.productId, index);
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium">
              개점 전 계획
            </p>
            <h1 className="text-lg font-semibold">판매가 계획</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {storeName} · 영업일 {data.businessDate}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">저장된 계획</p>
            <p className="font-semibold tabular-nums">{pricedCount}건</p>
            {savedAt ? (
              <p className="text-muted-foreground text-xs">
                마지막 저장 {savedAt}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">저장 전</p>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          개점 전에 품목별 예상 판매가를 입력해 두면, 마감 후 손실/대시보드에서
          계획 대비 실적을 참고할 수 있습니다. 실제 품목별 판매 단가가 없어 계획
          대비 금액은 모두 추정값으로만 표시됩니다.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        {resultMessage ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
            <p
              className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
              {resultMessage}
            </p>
          </div>
        ) : null}

        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <section className="bg-card text-card-foreground rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">품목별 예상 판매가</p>
            <div className="bg-muted/40 rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">입력 중 합계 </span>
              <span className="font-semibold tabular-nums">
                {formatKrw(draftTotalPlannedPrice)}
              </span>
            </div>
          </div>

          {!hasOptions ? (
            <p className="text-destructive text-sm">
              선택 가능한 active 품목이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, productIndex) => {
                const serverPlanIndex = serverPlanIndexByProductId.get(
                  item.productId,
                );
                const priceError =
                  serverPlanIndex !== undefined
                    ? fieldErrors[
                        `plans.${serverPlanIndex}.plannedUnitPrice`
                      ]?.[0]
                    : undefined;
                const memoError =
                  serverPlanIndex !== undefined
                    ? fieldErrors[`plans.${serverPlanIndex}.memo`]?.[0]
                    : undefined;

                return (
                  <div
                    key={item.productId}
                    className="grid gap-3 rounded-md border p-3"
                  >
                    <div className="bg-muted/40 text-muted-foreground rounded-md p-3 text-xs">
                      품목명: {item.productName} · 구분:{" "}
                      {item.productCategory || "-"} · 규격:{" "}
                      {item.productSpec || "-"}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={Boolean(priceError)}>
                        <FieldLabel
                          htmlFor={`sales-plan-price-${item.productId}`}
                        >
                          예상 판매가(원)
                        </FieldLabel>
                        <Input
                          id={`sales-plan-price-${item.productId}`}
                          ref={(node) => {
                            priceRefs.current[productIndex] = node;
                          }}
                          inputMode="numeric"
                          autoComplete="off"
                          value={item.plannedUnitPrice}
                          onChange={(event) =>
                            updateLine(item.productId, {
                              plannedUnitPrice: event.currentTarget.value,
                            })
                          }
                          disabled={isSaving}
                          className="min-h-11 tabular-nums"
                          aria-invalid={Boolean(priceError)}
                          aria-describedby={
                            priceError
                              ? `sales-plan-price-${item.productId}-error`
                              : undefined
                          }
                        />
                        {priceError ? (
                          <FieldError
                            id={`sales-plan-price-${item.productId}-error`}
                          >
                            {priceError}
                          </FieldError>
                        ) : null}
                      </Field>

                      <Field data-invalid={Boolean(memoError)}>
                        <FieldLabel
                          htmlFor={`sales-plan-memo-${item.productId}`}
                        >
                          메모(선택)
                        </FieldLabel>
                        <Input
                          id={`sales-plan-memo-${item.productId}`}
                          autoComplete="off"
                          value={item.memo}
                          onChange={(event) =>
                            updateLine(item.productId, {
                              memo: event.currentTarget.value,
                            })
                          }
                          disabled={isSaving}
                          className="min-h-11"
                          aria-invalid={Boolean(memoError)}
                          aria-describedby={
                            memoError
                              ? `sales-plan-memo-${item.productId}-error`
                              : undefined
                          }
                        />
                        <FieldDescription>
                          비워 두면 해당 품목 계획을 저장하지 않습니다.
                        </FieldDescription>
                        {memoError ? (
                          <FieldError
                            id={`sales-plan-memo-${item.productId}-error`}
                          >
                            {memoError}
                          </FieldError>
                        ) : null}
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="submit"
            variant={resultMessage ? "outline" : "default"}
            className="min-h-11 w-full sm:w-auto"
            disabled={isSaving || !hasOptions}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
