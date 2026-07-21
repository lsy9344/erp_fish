"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { FieldErrors } from "~/lib/action-result";
import { updateStoreReportMarginGapThresholdSettings } from "../threshold-actions";
import type { StoreReportMarginGapThresholdView } from "../threshold-queries";

type StoreThresholdFormValue = {
  storeId: string;
  storeName: string;
  marginGapRate: string;
};

type FormValues = {
  stores: StoreThresholdFormValue[];
  reason: string;
};

function toFormValues(stores: StoreReportMarginGapThresholdView[]): FormValues {
  return {
    stores: stores.map((store) => ({
      storeId: store.storeId,
      storeName: store.storeName,
      marginGapRate: store.formValues.marginGapRate,
    })),
    reason: "",
  };
}

function storeFieldKey(index: number, field: "marginGapRate" | "storeId") {
  return `stores.${index}.${field}`;
}

export function StoreReportMarginGapThresholdSettingsClient({
  stores,
}: {
  stores: StoreReportMarginGapThresholdView[];
}) {
  const thresholdRefs = useRef<Array<HTMLInputElement | null>>([]);
  const reasonRef = useRef<HTMLInputElement>(null);
  const pendingFocusErrorsRef = useRef<FieldErrors | null>(null);
  const formVersionRef = useRef(0);
  const [savedStores, setSavedStores] = useState(stores);
  const [formValues, setFormValues] = useState(() => toFormValues(stores));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isSaving || !pendingFocusErrorsRef.current) {
      return;
    }

    const errors = pendingFocusErrorsRef.current;
    pendingFocusErrorsRef.current = null;

    window.setTimeout(() => {
      const firstInvalidStoreIndex = formValues.stores.findIndex(
        (_store, index) =>
          Boolean(errors[storeFieldKey(index, "marginGapRate")]?.length) ||
          Boolean(errors[storeFieldKey(index, "storeId")]?.length),
      );

      if (firstInvalidStoreIndex >= 0) {
        thresholdRefs.current[firstInvalidStoreIndex]?.focus();
        return;
      }

      if (errors.stores?.length) {
        thresholdRefs.current[0]?.focus();
        return;
      }

      if (errors.reason?.length) {
        reasonRef.current?.focus();
      }
    }, 0);
  }, [formValues.stores, isSaving]);

  function setStoreValue(index: number, value: string) {
    formVersionRef.current += 1;
    setFormValues((current) => ({
      ...current,
      stores: current.stores.map((store, storeIndex) =>
        storeIndex === index ? { ...store, marginGapRate: value } : store,
      ),
    }));
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[storeFieldKey(index, "marginGapRate")];
      delete next[storeFieldKey(index, "storeId")];
      delete next.stores;
      return next;
    });
  }

  function setReason(value: string) {
    formVersionRef.current += 1;
    setFormValues((current) => ({ ...current, reason: value }));
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.reason;
      return next;
    });
  }

  async function saveSettings() {
    const submittedFormVersion = formVersionRef.current;

    setIsSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await updateStoreReportMarginGapThresholdSettings({
        stores: formValues.stores.map((store) => ({
          storeId: store.storeId,
          marginGapRate: store.marginGapRate,
        })),
        reason: formValues.reason,
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        pendingFocusErrorsRef.current = nextErrors;
        toast.error(result.error.message, {
          action: {
            label: "재시도",
            onClick: () => void saveSettings(),
          },
        });
        return;
      }

      setSavedStores(result.data);
      if (formVersionRef.current === submittedFormVersion) {
        setFormValues(toFormValues(result.data));
      }
      toast.success("지점별 마진 차이 기준을 저장했습니다.");
    } catch {
      const message =
        "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          지점별 리포트 마진 차이 기준
        </CardTitle>
        <CardDescription>
          아침 회의 리포트에서 실제 마진률과 예상 마진률의 차이가 지점 기준
          이상이면 빨간색으로 표시합니다. 신규 지점의 기본값은 1.50%p입니다.
        </CardDescription>
      </CardHeader>

      {savedStores.length === 0 ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">
            설정할 활성 지점이 없습니다.
          </p>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <CardContent>
            <FieldGroup>
              {formValues.stores.map((store, index) => {
                const marginGapError =
                  fieldErrors[storeFieldKey(index, "marginGapRate")]?.[0] ??
                  fieldErrors[storeFieldKey(index, "storeId")]?.[0] ??
                  (index === 0 ? fieldErrors.stores?.[0] : undefined);
                const inputId = `store-margin-gap-${store.storeId}`;
                const errorId = `${inputId}-error`;

                return (
                  <Field
                    key={store.storeId}
                    orientation="responsive"
                    data-invalid={Boolean(marginGapError)}
                  >
                    <FieldLabel htmlFor={inputId}>{store.storeName}</FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          ref={(element) => {
                            thresholdRefs.current[index] = element;
                          }}
                          id={inputId}
                          type="text"
                          inputMode="decimal"
                          value={store.marginGapRate}
                          disabled={isSaving}
                          onChange={(event) =>
                            setStoreValue(index, event.currentTarget.value)
                          }
                          aria-label={`${store.storeName} 마진 차이 기준`}
                          aria-invalid={Boolean(marginGapError)}
                          aria-describedby={
                            marginGapError ? errorId : undefined
                          }
                          className="max-w-40"
                        />
                        <span className="text-muted-foreground text-sm">
                          %p
                        </span>
                      </div>
                      {marginGapError ? (
                        <FieldError id={errorId}>{marginGapError}</FieldError>
                      ) : null}
                    </FieldContent>
                  </Field>
                );
              })}

              <Field data-invalid={Boolean(fieldErrors.reason?.[0])}>
                <FieldLabel htmlFor="store-margin-gap-reason">
                  지점별 기준 변경 사유
                </FieldLabel>
                <Input
                  ref={reasonRef}
                  id="store-margin-gap-reason"
                  type="text"
                  value={formValues.reason}
                  disabled={isSaving}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  aria-invalid={Boolean(fieldErrors.reason?.[0])}
                  aria-describedby={
                    fieldErrors.reason?.[0]
                      ? "store-margin-gap-reason-error"
                      : undefined
                  }
                />
                <FieldDescription>
                  변경 이력에 남길 사유를 입력해 주세요.
                </FieldDescription>
                {fieldErrors.reason?.[0] ? (
                  <FieldError id="store-margin-gap-reason-error">
                    {fieldErrors.reason[0]}
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>

            {formError ? (
              <p className="text-destructive mt-4 text-sm" role="alert">
                {formError}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "저장 중..." : "지점별 기준 저장"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
