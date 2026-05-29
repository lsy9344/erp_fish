"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { saveLedgerInventoryItems } from "~/features/inventory/actions";
import { type InventoryStepData } from "~/features/inventory/types";
import { type FieldErrors } from "~/lib/action-result";

type InventoryStepClientProps = {
  storeName: string;
  initialData: InventoryStepData;
};

type InventoryLineState = InventoryStepData["items"][number] & {
  currentQuantityInput: string;
  quantityInput: string;
};

const categories = ["냉동", "생물"] as const;
const MAX_INVENTORY_INTEGER = 2_147_483_647;
const carryoverLoadedMessage =
  "전일 재고를 불러왔습니다. 변경된 품목만 수정하세요.";
const carryoverManualMessage =
  "전일 장부가 마감되지 않아 자동 이월이 불가합니다. 직접 입력하거나 본사에 문의해 주세요.";

function formatKrw(value: number | null) {
  if (value === null) {
    return "계산 불가";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function parseQuantityInput(value: string) {
  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isSafeInteger(parsed) && parsed <= MAX_INVENTORY_INTEGER
    ? parsed
    : null;
}

function getInventoryAmount(value: string, unitPrice: number) {
  const quantity = parseQuantityInput(value);

  if (quantity === null) {
    return null;
  }

  const amount = quantity * unitPrice;

  if (!Number.isSafeInteger(amount) || amount > MAX_INVENTORY_INTEGER) {
    return null;
  }

  return amount;
}

function toLineState(data: InventoryStepData): InventoryLineState[] {
  return data.items.map((item) => ({
    ...item,
    currentQuantityInput:
      item.currentQuantity === null ? "" : String(item.currentQuantity),
    quantityInput: item.quantity === null ? "" : String(item.quantity),
  }));
}

function normalizeCategory(value: string): (typeof categories)[number] {
  return value === "생물" ? "생물" : "냉동";
}

function formatClosingDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function InventoryStepClient({
  storeName,
  initialData,
}: InventoryStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const currentQuantityRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [activeCategory, setActiveCategory] =
    useState<(typeof categories)[number]>("냉동");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const carryoverMessage =
    data.carryover.message ||
    (data.carryover.status === "manual"
      ? carryoverManualMessage
      : carryoverLoadedMessage);

  useEffect(() => {
    setData(initialData);
    setItems(toLineState(initialData));
  }, [initialData]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;

        if (errors[`items.${index}.currentQuantity`]?.length) {
          setActiveCategory(normalizeCategory(item.productCategory));
          window.setTimeout(() => {
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }

        if (errors[`items.${index}.quantity`]?.length) {
          setActiveCategory(normalizeCategory(item.productCategory));
          window.setTimeout(() => {
            quantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }
      }
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await saveLedgerInventoryItems({
        storeId: data.storeId,
        items: items.map((item) => ({
          productId: item.productId,
          currentQuantity: item.currentQuantityInput,
          quantity: item.quantityInput,
        })),
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        return;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      setResultMessage("저장됐습니다.");
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateQuantity(productId: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantityInput: value }
          : item,
      ),
    );
  }

  function updateCurrentQuantity(productId: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, currentQuantityInput: value }
          : item,
      ),
    );
  }

  function isLineModified(item: InventoryLineState) {
    const currentQuantity = parseQuantityInput(item.currentQuantityInput);
    const quantity = parseQuantityInput(item.quantityInput);

    return (
      (currentQuantity !== null && currentQuantity !== item.previousQuantity) ||
      (quantity !== null && quantity !== item.previousQuantity)
    );
  }

  function renderRows(category: string) {
    const visibleItems = items.filter(
      (item) => item.productCategory === category,
    );

    if (visibleItems.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={8}
            className="text-muted-foreground h-24 text-center"
          >
            표시할 품목이 없습니다.
          </TableCell>
        </TableRow>
      );
    }

    return visibleItems.map((item) => {
      const globalIndex = items.findIndex(
        (candidate) => candidate.productId === item.productId,
      );
      const quantityError =
        fieldErrors[`items.${globalIndex}.currentQuantity`]?.[0];
      const amountQuantityError =
        fieldErrors[`items.${globalIndex}.quantity`]?.[0];
      const modified = isLineModified(item) || item.isModified;
      const amount = getInventoryAmount(item.quantityInput, item.unitPrice);

      return (
        <TableRow
          key={item.productId}
          aria-label={`${item.productName} 재고 행${modified ? ", 수정됨" : ""}`}
          className={
            modified ? "border-l-primary bg-primary/5 border-l-4" : undefined
          }
        >
          <TableCell className="min-w-44">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{item.productName}</span>
              {modified ? (
                <Badge
                  variant="outline"
                  className="border-primary text-primary"
                >
                  수정됨
                </Badge>
              ) : null}
            </div>
          </TableCell>
          <TableCell className="min-w-24">{item.productSpec}</TableCell>
          <TableCell className="min-w-24 text-right tabular-nums">
            {item.previousQuantity}
          </TableCell>
          <TableCell className="min-w-24 text-right tabular-nums">
            {item.purchasedQuantity}
          </TableCell>
          <TableCell className="min-w-36">
            <Input
              ref={(node) => {
                currentQuantityRefs.current[item.productId] = node;
              }}
              aria-label={`${item.productName} 당일재고`}
              aria-invalid={Boolean(quantityError)}
              aria-describedby={
                quantityError
                  ? `inventory-quantity-${item.productId}-error`
                  : undefined
              }
              inputMode="numeric"
              autoComplete="off"
              value={item.currentQuantityInput}
              onChange={(event) =>
                updateCurrentQuantity(
                  item.productId,
                  event.currentTarget.value,
                )
              }
              className="min-h-11 min-w-24 tabular-nums"
            />
            {quantityError ? (
              <p
                id={`inventory-quantity-${item.productId}-error`}
                role="alert"
                className="text-destructive mt-1 text-xs"
              >
                {quantityError}
              </p>
            ) : null}
          </TableCell>
          <TableCell className="min-w-32 text-right tabular-nums">
            {formatKrw(amount)}
          </TableCell>
          <TableCell className="min-w-24">
            <Input
              ref={(node) => {
                quantityRefs.current[item.productId] = node;
              }}
              aria-label={`${item.productName} 수량`}
              aria-invalid={Boolean(amountQuantityError)}
              aria-describedby={
                amountQuantityError
                  ? `inventory-amount-quantity-${item.productId}-error`
                  : undefined
              }
              inputMode="numeric"
              autoComplete="off"
              value={item.quantityInput}
              onChange={(event) =>
                updateQuantity(item.productId, event.currentTarget.value)
              }
              className="min-h-11 min-w-24 tabular-nums"
            />
            {amountQuantityError ? (
              <p
                id={`inventory-amount-quantity-${item.productId}-error`}
                role="alert"
                className="text-destructive mt-1 text-xs"
              >
                {amountQuantityError}
              </p>
            ) : null}
          </TableCell>
          <TableCell className="min-w-24">
            {modified ? "수정됨" : "이월"}
          </TableCell>
        </TableRow>
      );
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="bg-card text-card-foreground rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">오늘 장부</p>
        <h1 className="text-2xl font-semibold tracking-normal">재고 입력</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {storeName} · 영업일: {formatClosingDate(data.closingDate)}
        </p>
      </header>

      <Alert
        variant={data.carryover.status === "manual" ? "destructive" : "default"}
      >
        <AlertTitle>
          {data.carryover.status === "manual"
            ? "수동 입력 필요"
            : "전일재고 이월"}
        </AlertTitle>
        <AlertDescription>{carryoverMessage}</AlertDescription>
      </Alert>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <Tabs
          value={activeCategory}
          onValueChange={(value) =>
            setActiveCategory(normalizeCategory(value))
          }
        >
          <TabsList className="min-h-11">
            {categories.map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                className="min-h-9 px-4"
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category} value={category}>
              <div className="overflow-x-auto rounded-md border">
                <Table aria-label="재고 품목" className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">품목</TableHead>
                      <TableHead scope="col">규격</TableHead>
                      <TableHead scope="col" className="text-right">
                        전일재고
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        매입
                      </TableHead>
                      <TableHead scope="col">당일재고</TableHead>
                      <TableHead scope="col" className="text-right">
                        재고금액
                      </TableHead>
                      <TableHead scope="col">수량</TableHead>
                      <TableHead scope="col">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{renderRows(category)}</TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {resultMessage ? (
          <p
            className="text-sm text-emerald-700 dark:text-emerald-300"
            role="status"
          >
            {resultMessage}
          </p>
        ) : null}

        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="min-h-11" disabled={isSaving}>
          {isSaving ? "저장 중..." : "저장"}
        </Button>
      </form>
    </div>
  );
}
