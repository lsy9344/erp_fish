"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { FieldErrors } from "~/lib/action-result";
import {
  createHeadquartersExpenses,
  updateHeadquartersExpense,
} from "../actions";
import type {
  HeadquartersExpenseListItem,
  HeadquartersExpenseListView,
} from "../queries";
import {
  HEADQUARTERS_EXPENSE_CATEGORIES,
  headquartersExpenseBatchCreateSchema,
  headquartersExpenseUpdateSchema,
  toFieldErrors,
} from "../schemas";
import { formatKrwInput } from "~/features/ledger/components/krw-input-format";

type HeadquartersExpenseClientProps = {
  view: HeadquartersExpenseListView;
};

type ExpenseLine = {
  key: string;
  category: string;
  otherCategory: string;
  amount: string;
  adjustmentReason: string;
  memo: string;
};

type FormValues = {
  expenseDate: string;
  storeId: string;
  items: ExpenseLine[];
};

const OTHER_CATEGORY = "__other__";
const COMMON_STORE = "__common__";
const textareaClassName =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 min-h-11 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";
const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function getCurrentDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function emptyLine(key: string): ExpenseLine {
  return {
    key,
    category: "",
    otherCategory: "",
    amount: "",
    adjustmentReason: "",
    memo: "",
  };
}

function toEmptyFormValues(): FormValues {
  return {
    expenseDate: getCurrentDateInput(),
    storeId: "",
    items: [emptyLine("0")],
  };
}

function resolveCategory(item: ExpenseLine) {
  return item.category === OTHER_CATEGORY ? item.otherCategory : item.category;
}

function toPayload(values: FormValues) {
  return {
    expenseDate: values.expenseDate,
    storeId: values.storeId,
    items: values.items.map((item) => ({
      category: resolveCategory(item),
      amount: item.amount,
      adjustmentReason: item.adjustmentReason,
      memo: item.memo,
    })),
  };
}

export function HeadquartersExpenseClient({
  view,
}: HeadquartersExpenseClientProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nextKey = useRef(1);
  const [draft, setDraft] = useState<FormValues>(toEmptyFormValues);
  const [editing, setEditing] = useState<{
    id: string;
    values: FormValues;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  useEffect(() => setIsReady(true), []);
  const formValues = editing?.values ?? draft;
  const editingId = editing?.id;
  const totalAmount = formValues.items.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) && amount >= 0 ? amount : 0);
  }, 0);
  const storeName =
    view.stores.find((store) => store.id === formValues.storeId)?.name ??
    "본사 공통";

  function updateForm(updater: (current: FormValues) => FormValues) {
    if (editing) {
      setEditing((current) =>
        current ? { ...current, values: updater(current.values) } : current,
      );
    } else {
      setDraft(updater);
    }
  }

  function clearError(path: string) {
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  function itemErrorPath(index: number, field: string) {
    return editingId ? field : `items.${index}.${field}`;
  }

  function setSharedValue(name: "expenseDate" | "storeId", value: string) {
    updateForm((current) => ({ ...current, [name]: value }));
    clearError(name);
  }

  function setItemValue(index: number, name: keyof ExpenseLine, value: string) {
    updateForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [name]: value } : item,
      ),
    }));
    clearError(
      itemErrorPath(index, name === "otherCategory" ? "category" : name),
    );
  }

  function handleAmountChange(
    index: number,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const charactersToRight = input.value
      .slice(input.selectionStart ?? input.value.length)
      .replace(/,/g, "").length;
    setItemValue(index, "amount", input.value.replace(/,/g, ""));
    requestAnimationFrame(() => {
      let position = input.value.length;
      let remaining = charactersToRight;
      while (position > 0 && remaining > 0) {
        position -= 1;
        if (input.value[position] !== ",") remaining -= 1;
      }
      input.setSelectionRange(position, position);
    });
  }

  function addItem() {
    const key = String(nextKey.current++);
    updateForm((current) => ({
      ...current,
      items: [...current.items, emptyLine(key)],
    }));
    clearError("items");
    requestAnimationFrame(() =>
      document.getElementById(`expense-category-${key}`)?.focus(),
    );
  }

  function removeItem(index: number) {
    updateForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
    setFieldErrors({});
    setFormError(null);
    requestAnimationFrame(() => {
      const remainingItem =
        formValues.items[index + 1] ?? formValues.items[index - 1];
      document
        .getElementById(`expense-category-${remainingItem?.key}`)
        ?.focus();
    });
  }

  function startEditing(expense: HeadquartersExpenseListItem) {
    const isPreset = HEADQUARTERS_EXPENSE_CATEGORIES.some(
      (category) => category === expense.category,
    );
    setEditing({
      id: expense.id,
      values: {
        expenseDate: expense.expenseDate,
        storeId: expense.storeId ?? "",
        items: [
          {
            key: String(nextKey.current++),
            category: isPreset ? expense.category : OTHER_CATEGORY,
            otherCategory: isPreset ? "" : expense.category,
            amount: String(expense.amount),
            adjustmentReason: expense.adjustmentReason ?? "",
            memo: expense.memo ?? "",
          },
        ],
      },
    });
    setFieldErrors({});
    setFormError(null);
    requestAnimationFrame(() =>
      document.getElementById("expense-date")?.focus(),
    );
  }

  function showErrors(errors: FieldErrors, message: string) {
    setFieldErrors(errors);
    setFormError(message);
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus(),
    );
  }

  async function saveExpense() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    const payload = toPayload(formValues);
    try {
      const result = editingId
        ? await updateHeadquartersExpense({
            id: editingId,
            expenseDate: payload.expenseDate,
            storeId: payload.storeId,
            ...payload.items[0],
          })
        : await createHeadquartersExpenses(payload);
      if (!result.ok) {
        setIsReviewOpen(false);
        showErrors(result.error.fieldErrors ?? {}, result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(
        editingId
          ? "본사 지출을 수정했습니다."
          : `본사 지출 ${payload.items.length}건을 등록했습니다.`,
      );
      setIsReviewOpen(false);
      setEditing(null);
      if (!editingId) {
        const item = emptyLine(String(nextKey.current++));
        setDraft((current) => ({ ...current, items: [item] }));
      }
      setFieldErrors({});
      router.refresh();
    } catch {
      const message =
        "저장 중 오류가 발생했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const payload = toPayload(formValues);
    const parsed = editingId
      ? headquartersExpenseUpdateSchema.safeParse({
          id: editingId,
          expenseDate: payload.expenseDate,
          storeId: payload.storeId,
          ...payload.items[0],
        })
      : headquartersExpenseBatchCreateSchema.safeParse(payload);
    if (!parsed.success) {
      showErrors(toFieldErrors(parsed.error), "입력값을 확인해 주세요.");
      return;
    }
    setFieldErrors({});
    setFormError(null);
    if (editingId) void saveExpense();
    else setIsReviewOpen(true);
  }

  const expenseDateError = fieldErrors.expenseDate?.[0];
  const storeIdError = fieldErrors.storeId?.[0];

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card min-w-0 rounded-lg border p-4 shadow-sm">
          <p className="text-muted-foreground text-sm break-words">
            본사 지출 합계
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {krwFormatter.format(view.totalAmount)}
          </p>
        </div>
        <div className="bg-card min-w-0 rounded-lg border p-4 shadow-sm">
          <p className="text-muted-foreground text-sm break-words">
            지점 귀속 지출
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {krwFormatter.format(view.storeAttributedAmount)}
          </p>
        </div>
        <div className="bg-card min-w-0 rounded-lg border p-4 shadow-sm">
          <p className="text-muted-foreground text-sm break-words">
            본사 공통 지출
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {krwFormatter.format(view.unattributedAmount)}
          </p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? "본사 지출 수정" : "본사 지출 등록"}
          </CardTitle>
          <CardDescription>
            {editingId
              ? "저장된 지출 내역을 수정합니다."
              : "날짜와 귀속 지점을 한 번 선택하고, 지출 내역을 추가해 한꺼번에 저장하세요."}
          </CardDescription>
        </CardHeader>
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          <CardContent className="flex flex-col gap-6">
            <FieldSet disabled={!isReady || isSaving}>
              <FieldLegend>공통 정보</FieldLegend>
              {!editingId && (
                <FieldDescription>
                  아래 모든 내역에 동일하게 적용됩니다. 저장 후에도 선택한
                  날짜와 지점은 유지됩니다.
                </FieldDescription>
              )}
              <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4">
                <Field
                  data-invalid={Boolean(expenseDateError)}
                  data-disabled={isSaving}
                >
                  <FieldLabel htmlFor="expense-date">지출 일자</FieldLabel>
                  <Input
                    id="expense-date"
                    type="date"
                    className="h-11"
                    value={formValues.expenseDate}
                    onChange={(event) =>
                      setSharedValue("expenseDate", event.currentTarget.value)
                    }
                    aria-invalid={Boolean(expenseDateError)}
                    aria-describedby={
                      expenseDateError ? "expense-date-error" : undefined
                    }
                  />
                  {expenseDateError && (
                    <FieldError id="expense-date-error">
                      {expenseDateError}
                    </FieldError>
                  )}
                </Field>
                <Field
                  data-invalid={Boolean(storeIdError)}
                  data-disabled={isSaving}
                >
                  <FieldLabel htmlFor="expense-store">
                    귀속 지점(선택)
                  </FieldLabel>
                  <Select
                    value={formValues.storeId || COMMON_STORE}
                    onValueChange={(value) =>
                      setSharedValue(
                        "storeId",
                        value === COMMON_STORE ? "" : value,
                      )
                    }
                    disabled={!isReady || isSaving}
                  >
                    <SelectTrigger
                      id="expense-store"
                      className="w-full data-[size=default]:h-11"
                      aria-invalid={Boolean(storeIdError)}
                      aria-describedby={
                        storeIdError ? "expense-store-error" : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={COMMON_STORE}>
                          본사 공통(지점 없음)
                        </SelectItem>
                        {view.stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {storeIdError && (
                    <FieldError id="expense-store-error">
                      {storeIdError}
                    </FieldError>
                  )}
                </Field>
              </FieldGroup>
            </FieldSet>

            <div className="flex flex-col gap-5">
              {formValues.items.map((item, index) => {
                const categoryError =
                  fieldErrors[itemErrorPath(index, "category")]?.[0];
                const amountError =
                  fieldErrors[itemErrorPath(index, "amount")]?.[0];
                const memoError =
                  fieldErrors[itemErrorPath(index, "memo")]?.[0];
                const adjustmentReasonError =
                  fieldErrors[itemErrorPath(index, "adjustmentReason")]?.[0];
                const isOther = item.category === OTHER_CATEGORY;
                const prefix = `expense-${item.key}`;
                return (
                  <FieldSet
                    key={item.key}
                    disabled={!isReady || isSaving}
                    className="border-t pt-5"
                    data-testid="hq-expense-draft-row"
                  >
                    <FieldLegend
                      variant="label"
                      className="flex w-full items-center justify-between gap-3"
                    >
                      <span>지출 내역 {index + 1}</span>
                      {!editingId && formValues.items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => removeItem(index)}
                          disabled={isSaving}
                          aria-label={`지출 내역 ${index + 1} 삭제`}
                        >
                          <Trash2Icon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          내역 삭제
                        </Button>
                      )}
                    </FieldLegend>
                    <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                      <Field
                        data-invalid={Boolean(categoryError)}
                        data-disabled={isSaving}
                      >
                        <FieldLabel htmlFor={`expense-category-${item.key}`}>
                          지출 분류
                        </FieldLabel>
                        <Select
                          value={item.category}
                          onValueChange={(value) =>
                            setItemValue(index, "category", value)
                          }
                          disabled={isSaving}
                        >
                          <SelectTrigger
                            id={`expense-category-${item.key}`}
                            className="w-full data-[size=default]:h-11"
                            aria-invalid={Boolean(categoryError) && !isOther}
                            aria-describedby={
                              categoryError && !isOther
                                ? `${prefix}-category-error`
                                : undefined
                            }
                          >
                            <SelectValue placeholder="분류 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {HEADQUARTERS_EXPENSE_CATEGORIES.map(
                                (category) => (
                                  <SelectItem key={category} value={category}>
                                    {category}
                                  </SelectItem>
                                ),
                              )}
                              <SelectItem value={OTHER_CATEGORY}>
                                기타 입력
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {isOther && (
                          <>
                            <FieldLabel htmlFor={`${prefix}-other-category`}>
                              기타 지출 내용
                            </FieldLabel>
                            <Input
                              id={`${prefix}-other-category`}
                              className="h-11"
                              value={item.otherCategory}
                              onChange={(event) =>
                                setItemValue(
                                  index,
                                  "otherCategory",
                                  event.currentTarget.value,
                                )
                              }
                              placeholder="지출 분류명을 입력하세요"
                              maxLength={80}
                              aria-invalid={Boolean(categoryError)}
                              aria-describedby={
                                categoryError
                                  ? `${prefix}-category-error`
                                  : undefined
                              }
                            />
                          </>
                        )}
                        {categoryError && (
                          <FieldError id={`${prefix}-category-error`}>
                            {categoryError}
                          </FieldError>
                        )}
                      </Field>
                      <Field
                        data-invalid={Boolean(amountError)}
                        data-disabled={isSaving}
                      >
                        <FieldLabel htmlFor={`${prefix}-amount`}>
                          지출 금액(원)
                        </FieldLabel>
                        <Input
                          id={`${prefix}-amount`}
                          className="h-11 text-right tabular-nums"
                          inputMode="numeric"
                          value={
                            /^\d*$/.test(item.amount)
                              ? formatKrwInput(item.amount)
                              : item.amount
                          }
                          onChange={(event) => handleAmountChange(index, event)}
                          placeholder="0"
                          aria-invalid={Boolean(amountError)}
                          aria-describedby={
                            amountError ? `${prefix}-amount-error` : undefined
                          }
                        />
                        {amountError && (
                          <FieldError id={`${prefix}-amount-error`}>
                            {amountError}
                          </FieldError>
                        )}
                      </Field>
                      <Field
                        data-invalid={Boolean(memoError)}
                        data-disabled={isSaving}
                        className="sm:col-span-2 lg:col-span-1"
                      >
                        <FieldLabel htmlFor={`${prefix}-memo`}>
                          메모(선택)
                        </FieldLabel>
                        <textarea
                          id={`${prefix}-memo`}
                          className={textareaClassName}
                          rows={1}
                          value={item.memo}
                          onChange={(event) =>
                            setItemValue(
                              index,
                              "memo",
                              event.currentTarget.value,
                            )
                          }
                          maxLength={500}
                          placeholder="추가로 남길 내용"
                          aria-invalid={Boolean(memoError)}
                          aria-describedby={
                            memoError ? `${prefix}-memo-error` : undefined
                          }
                        />
                        {memoError && (
                          <FieldError id={`${prefix}-memo-error`}>
                            {memoError}
                          </FieldError>
                        )}
                      </Field>
                      {resolveCategory(item).trim() === "본사조정" && (
                        <Field
                          className="sm:col-span-2 lg:col-span-3"
                          data-invalid={Boolean(adjustmentReasonError)}
                          data-disabled={isSaving}
                        >
                          <FieldLabel htmlFor={`${prefix}-adjustment-reason`}>
                            조정사유(본사조정일 때)
                          </FieldLabel>
                          <textarea
                            id={`${prefix}-adjustment-reason`}
                            className={textareaClassName}
                            rows={1}
                            value={item.adjustmentReason}
                            onChange={(event) =>
                              setItemValue(
                                index,
                                "adjustmentReason",
                                event.currentTarget.value,
                              )
                            }
                            maxLength={500}
                            aria-invalid={Boolean(adjustmentReasonError)}
                            aria-describedby={
                              adjustmentReasonError
                                ? `${prefix}-adjustment-error`
                                : undefined
                            }
                          />
                          {adjustmentReasonError && (
                            <FieldError id={`${prefix}-adjustment-error`}>
                              {adjustmentReasonError}
                            </FieldError>
                          )}
                        </Field>
                      )}
                    </FieldGroup>
                  </FieldSet>
                );
              })}
              {!editingId && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 self-start"
                  onClick={addItem}
                  disabled={!isReady || isSaving}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  내역 추가
                </Button>
              )}
            </div>
            {formError && (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex flex-col items-stretch gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              role="status"
              aria-atomic="true"
            >
              <span className="text-muted-foreground text-sm">
                입력 {formValues.items.length}건 · 합계
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {krwFormatter.format(totalAmount)}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setEditing(null);
                    setFieldErrors({});
                    setFormError(null);
                  }}
                  disabled={isSaving}
                >
                  취소
                </Button>
              )}
              <Button
                type="submit"
                className="min-h-11"
                disabled={!isReady || isSaving}
              >
                {isSaving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {isSaving
                  ? "저장 중…"
                  : editingId
                    ? "수정 저장"
                    : "입력 내역 확인"}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>

      <Dialog
        open={isReviewOpen}
        onOpenChange={(open) => {
          if (!isSaving) setIsReviewOpen(open);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target =
                formRef.current?.querySelector<HTMLElement>(
                  '[aria-invalid="true"]',
                ) ??
                formRef.current?.querySelector<HTMLButtonElement>(
                  'button[type="submit"]',
                );
              target?.focus();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>본사 지출 저장 확인</DialogTitle>
            <DialogDescription>
              날짜, 귀속 지점과 아래 내역을 확인한 후 전체 저장하세요.
            </DialogDescription>
          </DialogHeader>
          <dl className="bg-muted/50 grid grid-cols-2 gap-4 rounded-lg p-4">
            <div>
              <dt className="text-muted-foreground text-sm">지출 일자</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {formValues.expenseDate}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">귀속 지점</dt>
              <dd className="mt-1 font-medium break-words">{storeName}</dd>
            </div>
          </dl>
          <ol className="flex flex-col divide-y">
            {formValues.items.map((item, index) => (
              <li key={item.key} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="min-w-0 break-words">
                    {index + 1}. {resolveCategory(item).trim()}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {krwFormatter.format(Number(item.amount))}
                  </span>
                </div>
                {item.memo.trim() && (
                  <p className="text-muted-foreground text-sm break-words">
                    메모: {item.memo}
                  </p>
                )}
                {resolveCategory(item).trim() === "본사조정" &&
                  item.adjustmentReason.trim() && (
                    <p className="text-muted-foreground text-sm break-words">
                      조정사유: {item.adjustmentReason}
                    </p>
                  )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-4">
            <span>총 {formValues.items.length}건</span>
            <strong className="text-xl tabular-nums">
              {krwFormatter.format(totalAmount)}
            </strong>
          </div>
          {formError && (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setIsReviewOpen(false)}
              disabled={isSaving}
            >
              돌아가서 수정
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void saveExpense()}
              disabled={isSaving}
            >
              {isSaving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <SaveIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {isSaving ? "저장 중…" : `${formValues.items.length}건 전체 저장`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>지출 일자</TableHead>
              <TableHead>귀속 지점</TableHead>
              <TableHead>분류</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>조정사유</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>최종 변경</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.expenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-8 text-center text-sm break-words"
                >
                  선택한 월에 등록된 본사 지출이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              view.expenses.map((expense) => (
                <TableRow
                  key={expense.id}
                  data-testid={`hq-expense-row-${expense.id}`}
                >
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {expense.expenseDateLabel}
                  </TableCell>
                  <TableCell className="break-words">
                    {expense.storeName ? (
                      <Badge variant="outline">{expense.storeName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">본사 공통</span>
                    )}
                  </TableCell>
                  <TableCell className="break-words">
                    {expense.category}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {krwFormatter.format(expense.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-60 break-words">
                    {expense.adjustmentReason ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-60 break-words">
                    {expense.memo ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground break-words">
                    {expense.updatedByName}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(expense)}
                      disabled={isSaving}
                    >
                      수정
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
