"use client";

import { useRef, useState, type FormEvent } from "react";
import { RefreshCwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { FieldErrors } from "~/lib/action-result";
import { updateAnomalyThresholdSettings } from "../threshold-actions";
import type { AnomalyThresholdSettingsView } from "../threshold-queries";

type AnomalyThresholdSettingsClientProps = {
  settings: AnomalyThresholdSettingsView | null;
};

type FormValues = AnomalyThresholdSettingsView["formValues"];

const emptyFormValues: FormValues = {
  salesDropRate: "",
  grossMarginDropRate: "",
  salesDifferenceAmount: "",
  lossAmount: "",
  inventoryDifferenceQuantity: "",
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function AnomalyThresholdSettingsClient({
  settings,
}: AnomalyThresholdSettingsClientProps) {
  const salesDropRef = useRef<HTMLInputElement>(null);
  const grossMarginDropRef = useRef<HTMLInputElement>(null);
  const salesDifferenceRef = useRef<HTMLInputElement>(null);
  const lossAmountRef = useRef<HTMLInputElement>(null);
  const inventoryDifferenceRef = useRef<HTMLInputElement>(null);
  const [formValues, setFormValues] = useState<FormValues>(
    settings?.formValues ?? emptyFormValues,
  );
  const [savedSettings, setSavedSettings] =
    useState<AnomalyThresholdSettingsView | null>(settings);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function setFieldValue(name: keyof FormValues, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.salesDropRate?.length) {
        salesDropRef.current?.focus();
        return;
      }

      if (errors.grossMarginDropRate?.length) {
        grossMarginDropRef.current?.focus();
        return;
      }

      if (errors.salesDifferenceAmount?.length) {
        salesDifferenceRef.current?.focus();
        return;
      }

      if (errors.lossAmount?.length) {
        lossAmountRef.current?.focus();
        return;
      }

      if (errors.inventoryDifferenceQuantity?.length) {
        inventoryDifferenceRef.current?.focus();
      }
    }, 0);
  }

  async function saveSettings() {
    setIsSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await updateAnomalyThresholdSettings(formValues);

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        toast.error(result.error.message, {
          action: {
            label: "재시도",
            onClick: () => void saveSettings(),
          },
        });
        return;
      }

      setSavedSettings(result.data);
      setFormValues(result.data.formValues);
      toast.success("기준값을 저장했습니다.");
    } catch {
      const message = "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
      setFormError(message);
      toast.error(message, {
        action: {
          label: "재시도",
          onClick: () => void saveSettings(),
        },
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveSettings();
  }

  const salesDropError = fieldErrors.salesDropRate?.[0];
  const grossMarginDropError = fieldErrors.grossMarginDropRate?.[0];
  const salesDifferenceError = fieldErrors.salesDifferenceAmount?.[0];
  const lossAmountError = fieldErrors.lossAmount?.[0];
  const inventoryDifferenceError = fieldErrors.inventoryDifferenceQuantity?.[0];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {!savedSettings ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          아직 기준값이 저장되지 않았습니다.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>기준값 입력</CardTitle>
          <CardDescription>
            기준일 정책 확인 필요. 입력한 값은 전체 지점 관제판에 공통 적용됩니다.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(salesDropError)}>
                <FieldLabel htmlFor="sales-drop-rate">매출 하락률(%)</FieldLabel>
                <Input
                  ref={salesDropRef}
                  id="sales-drop-rate"
                  inputMode="decimal"
                  value={formValues.salesDropRate}
                  onChange={(event) =>
                    setFieldValue("salesDropRate", event.currentTarget.value)
                  }
                  aria-invalid={Boolean(salesDropError)}
                  aria-describedby={
                    salesDropError ? "sales-drop-rate-error" : undefined
                  }
                />
                <FieldDescription>
                  기준일 정책 확인 필요. 매출 하락률 기준입니다.
                </FieldDescription>
                {salesDropError ? (
                  <FieldError id="sales-drop-rate-error">
                    {salesDropError}
                  </FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(grossMarginDropError)}>
                <FieldLabel htmlFor="gross-margin-drop-rate">
                  이익률 하락폭(%p)
                </FieldLabel>
                <Input
                  ref={grossMarginDropRef}
                  id="gross-margin-drop-rate"
                  inputMode="decimal"
                  value={formValues.grossMarginDropRate}
                  onChange={(event) =>
                    setFieldValue(
                      "grossMarginDropRate",
                      event.currentTarget.value,
                    )
                  }
                  aria-invalid={Boolean(grossMarginDropError)}
                  aria-describedby={
                    grossMarginDropError
                      ? "gross-margin-drop-rate-error"
                      : undefined
                  }
                />
                <FieldDescription>
                  기준일 정책 확인 필요. 이익률 하락폭 기준입니다.
                </FieldDescription>
                {grossMarginDropError ? (
                  <FieldError id="gross-margin-drop-rate-error">
                    {grossMarginDropError}
                  </FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(salesDifferenceError)}>
                <FieldLabel htmlFor="sales-difference-amount">
                  매출차액 금액(원)
                </FieldLabel>
                <Input
                  ref={salesDifferenceRef}
                  id="sales-difference-amount"
                  inputMode="numeric"
                  value={formValues.salesDifferenceAmount}
                  onChange={(event) =>
                    setFieldValue(
                      "salesDifferenceAmount",
                      event.currentTarget.value,
                    )
                  }
                  aria-invalid={Boolean(salesDifferenceError)}
                  aria-describedby={
                    salesDifferenceError
                      ? "sales-difference-amount-error"
                      : undefined
                  }
                />
                <FieldDescription>
                  현금/카드/기타 합계와 매출 차액 금액 기준입니다.
                </FieldDescription>
                {salesDifferenceError ? (
                  <FieldError id="sales-difference-amount-error">
                    {salesDifferenceError}
                  </FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(lossAmountError)}>
                <FieldLabel htmlFor="loss-amount">손실액(원)</FieldLabel>
                <Input
                  ref={lossAmountRef}
                  id="loss-amount"
                  inputMode="numeric"
                  value={formValues.lossAmount}
                  onChange={(event) =>
                    setFieldValue("lossAmount", event.currentTarget.value)
                  }
                  aria-invalid={Boolean(lossAmountError)}
                  aria-describedby={
                    lossAmountError ? "loss-amount-error" : undefined
                  }
                />
                <FieldDescription>손실 금액 기준입니다.</FieldDescription>
                {lossAmountError ? (
                  <FieldError id="loss-amount-error">
                    {lossAmountError}
                  </FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(inventoryDifferenceError)}>
                <FieldLabel htmlFor="inventory-difference-quantity">
                  재고 차이 기준(수량)
                </FieldLabel>
                <Input
                  ref={inventoryDifferenceRef}
                  id="inventory-difference-quantity"
                  inputMode="numeric"
                  value={formValues.inventoryDifferenceQuantity}
                  onChange={(event) =>
                    setFieldValue(
                      "inventoryDifferenceQuantity",
                      event.currentTarget.value,
                    )
                  }
                  aria-invalid={Boolean(inventoryDifferenceError)}
                  aria-describedby={
                    inventoryDifferenceError
                      ? "inventory-difference-quantity-error"
                      : undefined
                  }
                />
                <FieldDescription>
                  장부 재고와 실사 재고의 수량 차이 기준입니다.
                </FieldDescription>
                {inventoryDifferenceError ? (
                  <FieldError id="inventory-difference-quantity-error">
                    {inventoryDifferenceError}
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            {formError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {savedSettings ? (
                <>
                  마지막 저장: {formatUpdatedAt(savedSettings.updatedAt)} ·{" "}
                  {savedSettings.updatedByName}
                </>
              ) : (
                "저장 후 관제판에서 기준값 상태를 확인할 수 있습니다."
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormValues(savedSettings?.formValues ?? emptyFormValues);
                  setFieldErrors({});
                  setFormError(null);
                }}
                disabled={isSaving}
              >
                <RefreshCwIcon data-icon="inline-start" />
                되돌리기
              </Button>
              <Button type="submit" disabled={isSaving}>
                <SaveIcon data-icon="inline-start" />
                저장
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
