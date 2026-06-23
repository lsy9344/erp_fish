"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
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
  createHeadquartersExpense,
  updateHeadquartersExpense,
} from "../actions";
import type {
  HeadquartersExpenseListItem,
  HeadquartersExpenseListView,
} from "../queries";

type HeadquartersExpenseClientProps = {
  view: HeadquartersExpenseListView;
};

type FormValues = {
  expenseDate: string;
  storeId: string;
  category: string;
  amount: string;
  memo: string;
};

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

function toEmptyFormValues(): FormValues {
  return {
    expenseDate: getCurrentDateInput(),
    storeId: "",
    category: "",
    amount: "",
    memo: "",
  };
}

function toEditFormValues(expense: HeadquartersExpenseListItem): FormValues {
  return {
    expenseDate: expense.expenseDate,
    storeId: expense.storeId ?? "",
    category: expense.category,
    amount: String(expense.amount),
    memo: expense.memo ?? "",
  };
}

export function HeadquartersExpenseClient({
  view,
}: HeadquartersExpenseClientProps) {
  const router = useRouter();
  const categoryRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(toEmptyFormValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function setFieldValue<K extends keyof FormValues>(
    name: K,
    value: FormValues[K],
  ) {
    setFormValues((current) => ({ ...current, [name]: value }));
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function resetForm() {
    setEditingId(null);
    setFormValues(toEmptyFormValues());
    setFieldErrors({});
    setFormError(null);
  }

  function startEditing(expense: HeadquartersExpenseListItem) {
    setEditingId(expense.id);
    setFormValues(toEditFormValues(expense));
    setFieldErrors({});
    setFormError(null);
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.category?.length) {
        categoryRef.current?.focus();
        return;
      }

      if (errors.amount?.length) {
        amountRef.current?.focus();
      }
    }, 0);
  }

  async function saveExpense() {
    setIsSaving(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      expenseDate: formValues.expenseDate,
      storeId: formValues.storeId,
      category: formValues.category,
      amount: formValues.amount,
      memo: formValues.memo,
    };

    try {
      const result = editingId
        ? await updateHeadquartersExpense({ id: editingId, ...payload })
        : await createHeadquartersExpense(payload);

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return;
      }

      toast.success(
        editingId
          ? "본사 지출을 수정했습니다."
          : "본사 지출을 등록했습니다.",
      );
      resetForm();
      router.refresh();
    } catch {
      const message = "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveExpense();
  }

  const categoryError = fieldErrors.category?.[0];
  const amountError = fieldErrors.amount?.[0];
  const expenseDateError = fieldErrors.expenseDate?.[0];
  const storeIdError = fieldErrors.storeId?.[0];
  const memoError = fieldErrors.memo?.[0];

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
            지점 일일 장부와 분리된 본사 전용 지출입니다. 지점장에게는 노출되지
            않습니다.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent>
            <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4">
              <Field data-invalid={Boolean(expenseDateError)}>
                <FieldLabel htmlFor="expense-date">지출 일자</FieldLabel>
                <Input
                  id="expense-date"
                  type="date"
                  value={formValues.expenseDate}
                  onChange={(event) =>
                    setFieldValue("expenseDate", event.currentTarget.value)
                  }
                  aria-invalid={Boolean(expenseDateError)}
                />
                {expenseDateError ? (
                  <FieldError>{expenseDateError}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(storeIdError)}>
                <FieldLabel htmlFor="expense-store">
                  귀속 지점(선택)
                </FieldLabel>
                <select
                  id="expense-store"
                  value={formValues.storeId}
                  onChange={(event) =>
                    setFieldValue("storeId", event.currentTarget.value)
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  aria-invalid={Boolean(storeIdError)}
                >
                  <option value="">본사 공통(지점 없음)</option>
                  {view.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                <FieldDescription>
                  특정 지점에 귀속할 지출만 선택하세요.
                </FieldDescription>
                {storeIdError ? (
                  <FieldError>{storeIdError}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(categoryError)}>
                <FieldLabel htmlFor="expense-category">지출 분류</FieldLabel>
                <Input
                  ref={categoryRef}
                  id="expense-category"
                  value={formValues.category}
                  onChange={(event) =>
                    setFieldValue("category", event.currentTarget.value)
                  }
                  placeholder="예: 본사 임차료"
                  aria-invalid={Boolean(categoryError)}
                />
                {categoryError ? (
                  <FieldError>{categoryError}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(amountError)}>
                <FieldLabel htmlFor="expense-amount">지출 금액(원)</FieldLabel>
                <Input
                  ref={amountRef}
                  id="expense-amount"
                  inputMode="numeric"
                  value={formValues.amount}
                  onChange={(event) =>
                    setFieldValue("amount", event.currentTarget.value)
                  }
                  aria-invalid={Boolean(amountError)}
                />
                {amountError ? (
                  <FieldError>{amountError}</FieldError>
                ) : null}
              </Field>

              <Field
                className="sm:col-span-2"
                data-invalid={Boolean(memoError)}
              >
                <FieldLabel htmlFor="expense-memo">메모(선택)</FieldLabel>
                <textarea
                  id="expense-memo"
                  value={formValues.memo}
                  onChange={(event) =>
                    setFieldValue("memo", event.currentTarget.value)
                  }
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  aria-invalid={Boolean(memoError)}
                />
                {memoError ? <FieldError>{memoError}</FieldError> : null}
              </Field>
            </FieldGroup>
            {formError ? (
              <p className="text-destructive mt-4 text-sm" role="alert">
                {formError}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            {editingId ? (
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSaving}
              >
                <RefreshCwIcon data-icon="inline-start" />
                취소
              </Button>
            ) : null}
            <Button type="submit" disabled={isSaving}>
              {editingId ? (
                <SaveIcon data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              {editingId ? "수정 저장" : "지출 등록"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>지출 일자</TableHead>
              <TableHead>귀속 지점</TableHead>
              <TableHead>분류</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>최종 변경</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.expenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                  <TableCell className="tabular-nums whitespace-nowrap">
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
