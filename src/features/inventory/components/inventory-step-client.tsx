"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import {
  saveLedgerInventoryAdjustment,
  saveLedgerInventoryItems,
} from "~/features/inventory/actions";
import { type InventoryStepData } from "~/features/inventory/types";
import { type ActionResult, type FieldErrors } from "~/lib/action-result";

type InventoryStepClientProps = {
  storeName: string;
  initialData: InventoryStepData;
  saveItemsAction?: (
    input: unknown,
  ) => Promise<ActionResult<InventoryStepData>>;
  saveAdjustmentAction?: (
    input: unknown,
  ) => Promise<ActionResult<InventoryStepData>>;
  ledgerLabel?: string;
  showStepNavigation?: boolean;
};

type InventoryLineState = InventoryStepData["items"][number] & {
  currentQuantityInput: string;
  adjustmentReasonInput: string;
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
    adjustmentReasonInput: item.adjustment?.reason ?? "",
  }));
}

function mergeAdjustedLineState(
  data: InventoryStepData,
  currentItems: InventoryLineState[],
  adjustedProductId: string,
) {
  const currentByProductId = new Map(
    currentItems.map((item) => [item.productId, item]),
  );

  return toLineState(data).map((item) => {
    if (item.productId === adjustedProductId) {
      return item;
    }

    const current = currentByProductId.get(item.productId);

    if (!current) {
      return item;
    }

    return {
      ...item,
      currentQuantityInput: current.currentQuantityInput,
      adjustmentReasonInput: current.adjustmentReasonInput,
    };
  });
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
  saveItemsAction = saveLedgerInventoryItems,
  saveAdjustmentAction = saveLedgerInventoryAdjustment,
  ledgerLabel = "오늘 장부",
  showStepNavigation = true,
}: InventoryStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const currentQuantityRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const reasonRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [activeCategory, setActiveCategory] =
    useState<(typeof categories)[number]>("냉동");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [adjustmentErrors, setAdjustmentErrors] = useState<
    Record<string, string>
  >({});
  const [savingAdjustmentProductId, setSavingAdjustmentProductId] = useState<
    string | null
  >(null);

  useLedgerUpdatedAtSync(data.id, (updatedAt) => {
    setData((current) => ({ ...current, updatedAt }));
  });

  const carryoverMessage =
    data.carryover.message ||
    (data.carryover.status === "manual"
      ? carryoverManualMessage
      : carryoverLoadedMessage);
  const isOriginalEditBlocked =
    data.status === "HEADQUARTERS_CLOSED" || data.status === "HOLIDAY";
  const isClosed = isOriginalEditBlocked;
  const nextStepHref = `/app/store-entry/losses?storeId=${data.storeId}`;
  const isAdjustmentSavePending = savingAdjustmentProductId !== null;
  // Contract: disabled={isClosed || savingAdjustmentProductId !== null}

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
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }
      }
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isClosed) {
      setResultMessage(null);
      const message =
        "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.";
      setFormError(message);
      setAdjustmentErrors({});
      toast.error(message);
      return;
    }

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
    setAdjustmentErrors({});

    try {
      const result = await saveItemsAction({
        ledgerId: data.id,
        ledgerUpdatedAt: data.updatedAt,
        storeId: data.storeId,
        items: items.map((item) => ({
          productId: item.productId,
          currentQuantity:
            currentQuantityRefs.current[item.productId]?.value ??
            item.currentQuantityInput,
          quantity:
            currentQuantityRefs.current[item.productId]?.value ??
            item.currentQuantityInput,
        })),
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      setAdjustmentErrors({});
      setResultMessage("저장됐습니다.");
      toast.success("재고 정보를 저장했습니다.");
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  function normalizeNumericInput(value: string) {
    if (value === "" || value === "0") return value;
    // 숫자만 있는 경우 선행 0 제거 (예: "01" → "1", "007" → "7")
    if (/^\d+$/.test(value)) return String(Number(value));
    return value;
  }

  function updateCurrentQuantity(productId: string, value: string) {
    const normalized = normalizeNumericInput(value);
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, currentQuantityInput: normalized }
          : item,
      ),
    );
  }

  function updateAdjustmentReason(productId: string, value: string) {
    setAdjustmentErrors((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, adjustmentReasonInput: value }
          : item,
      ),
    );
  }

  function getSystemQuantity(item: InventoryLineState) {
    const quantity =
      item.previousQuantity + item.purchasedQuantity - item.lossQuantity;

    return Number.isSafeInteger(quantity) &&
      quantity >= 0 &&
      quantity <= MAX_INVENTORY_INTEGER
      ? quantity
      : null;
  }

  function formatSignedQuantity(value: number) {
    return value > 0 ? `+${value}` : String(value);
  }

  function isAdjustmentNeeded(item: InventoryLineState) {
    const systemQuantity = getSystemQuantity(item);
    const actualQuantity = parseQuantityInput(item.currentQuantityInput);

    return (
      systemQuantity !== null &&
      actualQuantity !== null &&
      actualQuantity !== systemQuantity
    );
  }

  async function handleAdjustmentSave(item: InventoryLineState) {
    const reason = item.adjustmentReasonInput.trim();

    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
    setAdjustmentErrors((current) => {
      const next = { ...current };
      delete next[item.productId];
      return next;
    });

    if (!reason) {
      setAdjustmentErrors((current) => ({
        ...current,
        [item.productId]: "조정 사유를 입력해 주세요.",
      }));
      window.setTimeout(() => {
        reasonRefs.current[item.productId]?.focus();
      }, 0);
      return;
    }

    setSavingAdjustmentProductId(item.productId);

    try {
      const result = await saveAdjustmentAction({
        ledgerId: data.id,
        ledgerUpdatedAt: data.updatedAt,
        storeId: data.storeId,
        productId: item.productId,
        actualQuantity: item.currentQuantityInput,
        reason,
      });

      if (!result.ok) {
        const reasonError = result.error.fieldErrors?.reason?.[0];
        const actualQuantityError =
          result.error.fieldErrors?.actualQuantity?.[0];

        if (reasonError) {
          setAdjustmentErrors((current) => ({
            ...current,
            [item.productId]: reasonError,
          }));
          window.setTimeout(() => {
            reasonRefs.current[item.productId]?.focus();
          }, 0);
        }

        if (actualQuantityError) {
          const globalIndex = items.findIndex(
            (candidate) => candidate.productId === item.productId,
          );

          if (globalIndex >= 0) {
            setFieldErrors((current) => ({
              ...current,
              [`items.${globalIndex}.currentQuantity`]: [actualQuantityError],
            }));
          }

          setActiveCategory(normalizeCategory(item.productCategory));
          window.setTimeout(() => {
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
        }

        setFormError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      setData(result.data);
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      setItems((current) =>
        mergeAdjustedLineState(result.data, current, item.productId),
      );
      setFieldErrors({});
      setAdjustmentErrors({});
      setResultMessage("조정이 저장됐습니다.");
      toast.success("재고 조정을 저장했습니다.");
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingAdjustmentProductId(null);
    }
  }

  function isLineModified(item: InventoryLineState) {
    const currentQuantity = parseQuantityInput(item.currentQuantityInput);

    return (
      currentQuantity !== null && currentQuantity !== item.previousQuantity
    );
  }

  function formatQuantity(value: number | null) {
    if (value === null) {
      return "계산 불가";
    }

    return `${new Intl.NumberFormat("ko-KR").format(value)}개`;
  }

  function getQuantityDifference(item: InventoryLineState) {
    const systemQuantity = getSystemQuantity(item);
    const actualQuantity = parseQuantityInput(item.currentQuantityInput);

    if (systemQuantity === null || actualQuantity === null) {
      return null;
    }

    return actualQuantity - systemQuantity;
  }

  function formatDifference(value: number | null) {
    if (value === null) {
      return "계산 불가";
    }

    return `${formatSignedQuantity(value)}개`;
  }

  function getSourceBadges(item: InventoryLineState) {
    const badges: {
      label: string;
      detail: string;
      className?: string;
    }[] = [];

    if (item.carryoverSource === "PREVIOUS_CLOSED_LEDGER") {
      badges.push({
        label: "전일 이월",
        detail: `최근 본사 마감 장부의 재고가 넘어온 품목입니다. 전일재고 ${formatQuantity(item.previousQuantity)}.`,
        className:
          "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300",
      });
    } else if (item.carryoverSource === "OPENING_SNAPSHOT") {
      badges.push({
        label: "월초 이월",
        detail: `월초 재고 스냅샷에서 넘어온 품목입니다. 전일재고 ${formatQuantity(item.previousQuantity)}.`,
        className:
          "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300",
      });
    } else {
      badges.push({
        label: "등록 품목",
        detail:
          "전일 재고 자동 이월이 불가하거나 기준 재고가 없어, 활성 품목 목록에서 표시된 항목입니다.",
        className:
          "border-slate-500 text-slate-700 dark:border-slate-400 dark:text-slate-300",
      });
    }

    if (item.purchasedQuantity > 0) {
      badges.push({
        label: "오늘 매입",
        detail: `3단계 매입에 저장된 수량입니다. 매입 ${formatQuantity(item.purchasedQuantity)}.`,
        className:
          "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
      });
    }

    if (item.lossQuantity > 0) {
      badges.push({
        label: "오늘 손실",
        detail: `손실/폐기 입력에 저장된 수량입니다. 손실 ${formatQuantity(item.lossQuantity)}, 손실액 ${formatKrw(item.lossAmount)}.`,
        className:
          "border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300",
      });
    }

    return badges;
  }

  function renderBadgeWithTooltip({
    label,
    detail,
    className,
  }: {
    label: string;
    detail: string;
    className?: string;
  }) {
    return (
      <Tooltip key={`${label}-${detail}`}>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex outline-none">
            <Badge
              variant="outline"
              className={`text-[10px] ${className ?? ""}`}
            >
              {label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 leading-relaxed">
          {detail}
        </TooltipContent>
      </Tooltip>
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
            colSpan={10}
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
      const modified = isLineModified(item) || item.isModified;
      const adjusted = Boolean(item.adjustment);
      const adjustmentNeeded = !adjusted && isAdjustmentNeeded(item);
      const amount = getInventoryAmount(
        item.currentQuantityInput,
        item.unitPrice,
      );
      const systemQuantity = getSystemQuantity(item);
      const quantityDifference = getQuantityDifference(item);
      const reasonError = adjustmentErrors[item.productId];
      const isSavingThisAdjustment =
        savingAdjustmentProductId === item.productId;
      const sourceBadges = getSourceBadges(item);
      const adjustmentActionLabel = adjusted ? "수정" : "조정";

      return (
        <TableRow
          key={item.productId}
          aria-label={`${item.productName} 재고 행${modified ? ", 수정됨" : ""}${adjusted ? ", 조정됨" : ""}`}
          className={
            modified || adjusted
              ? "border-primary bg-primary/5 border-l-4"
              : undefined
          }
        >
          <TableCell className="w-40">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{item.productName}</span>
              <div className="flex flex-wrap gap-1">
                {modified ? (
                  <Badge
                    variant="outline"
                    className="border-primary text-primary text-[10px]"
                  >
                    수정됨
                  </Badge>
                ) : null}
                {adjustmentNeeded
                  ? renderBadgeWithTooltip({
                      label: "조정 필요",
                      detail: `기준재고 ${formatQuantity(systemQuantity)}와 당일재고 ${formatQuantity(parseQuantityInput(item.currentQuantityInput))}가 다릅니다. 차이 사유를 남겨 주세요.`,
                      className:
                        "border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300",
                    })
                  : null}
                {adjusted
                  ? renderBadgeWithTooltip({
                      label: "조정됨",
                      detail: item.adjustment
                        ? `조정 사유가 저장됐습니다. 차이 ${formatSignedQuantity(item.adjustment.differenceQuantity)}개, ${formatKrw(item.adjustment.differenceAmount)}.`
                        : "조정 사유가 저장됐습니다.",
                      className:
                        "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
                    })
                  : null}
                {sourceBadges.map(renderBadgeWithTooltip)}
              </div>
            </div>
          </TableCell>
          <TableCell className="w-20 text-sm">{item.productSpec}</TableCell>
          <TableCell className="w-16 text-right tabular-nums">
            {item.previousQuantity}
          </TableCell>
          <TableCell className="w-16 text-right tabular-nums">
            {item.purchasedQuantity}
          </TableCell>
          <TableCell className="w-20 text-right tabular-nums">
            <div className="grid gap-0.5">
              <span>{item.lossQuantity}</span>
              <span className="text-muted-foreground text-xs">
                {formatKrw(item.lossAmount)}
              </span>
            </div>
          </TableCell>
          <TableCell className="w-20 text-right tabular-nums">
            {formatQuantity(systemQuantity)}
          </TableCell>
          <TableCell className="w-28">
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
                updateCurrentQuantity(item.productId, event.currentTarget.value)
              }
              disabled={isSaving || isClosed || isAdjustmentSavePending}
              className="h-8 tabular-nums"
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
          <TableCell className="w-28 text-right tabular-nums">
            <span
              className={
                quantityDifference === null || quantityDifference === 0
                  ? undefined
                  : "text-destructive font-medium"
              }
            >
              {formatDifference(quantityDifference)}
            </span>
          </TableCell>
          <TableCell className="w-28 text-right tabular-nums">
            {formatKrw(amount)}
          </TableCell>
          <TableCell className="w-56">
            {isClosed ? (
              <p className="text-muted-foreground text-xs">정정 기록 사용</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {adjusted && item.adjustment ? (
                  <div className="text-muted-foreground grid gap-0.5 text-xs">
                    <p>
                      조정 전{" "}
                      <span className="tabular-nums">
                        {item.adjustment.beforeQuantity} /{" "}
                        {formatKrw(item.adjustment.beforeAmount)}
                      </span>
                    </p>
                    <p>
                      조정 후{" "}
                      <span className="tabular-nums">
                        {item.adjustment.afterQuantity} /{" "}
                        {formatKrw(item.adjustment.afterAmount)}
                      </span>
                    </p>
                    <p>
                      차이{" "}
                      <span className="tabular-nums">
                        {formatSignedQuantity(
                          item.adjustment.differenceQuantity,
                        )}{" "}
                        / {formatKrw(item.adjustment.differenceAmount)}
                      </span>
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <Input
                    ref={(node) => {
                      reasonRefs.current[item.productId] = node;
                    }}
                    aria-label={`${item.productName} 조정 사유`}
                    aria-invalid={Boolean(reasonError)}
                    aria-describedby={
                      reasonError
                        ? `inventory-adjustment-reason-${item.productId}-error`
                        : undefined
                    }
                    autoComplete="off"
                    value={item.adjustmentReasonInput}
                    onChange={(event) =>
                      updateAdjustmentReason(
                        item.productId,
                        event.currentTarget.value,
                      )
                    }
                    disabled={isAdjustmentSavePending}
                    className="h-8 min-w-0 flex-1"
                    placeholder="조정 사유"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${item.productName} 조정 ${adjustmentActionLabel}`}
                    onClick={() => handleAdjustmentSave(item)}
                    disabled={savingAdjustmentProductId !== null}
                    className="h-8 shrink-0 px-2 text-xs"
                  >
                    {isSavingThisAdjustment ? "저장 중" : adjustmentActionLabel}
                  </Button>
                </div>
                {reasonError ? (
                  <p
                    id={`inventory-adjustment-reason-${item.productId}-error`}
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {reasonError}
                  </p>
                ) : systemQuantity !== null ? (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    기준 {systemQuantity}
                  </p>
                ) : null}
              </div>
            )}
          </TableCell>
        </TableRow>
      );
    });
  }

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="bg-card text-card-foreground rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{ledgerLabel}</p>
          <h1 className="text-2xl font-semibold tracking-normal">재고 입력</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {storeName} · 영업일: {formatClosingDate(data.closingDate)}
          </p>
        </header>

        {showStepNavigation ? (
          <StoreEntryStepNavigation
            storeId={data.storeId}
            currentStep="inventory"
            stepCompletion={data.stepCompletion}
          />
        ) : null}

        <Alert
          variant={
            data.carryover.status === "manual" ? "destructive" : "default"
          }
        >
          <AlertTitle>
            {data.carryover.status === "manual"
              ? "수동 입력 필요"
              : "전일재고 이월"}
          </AlertTitle>
          <AlertDescription>{carryoverMessage}</AlertDescription>
        </Alert>

        {isOriginalEditBlocked ? (
          <Alert variant="destructive">
            <AlertTitle>본사 마감 장부</AlertTitle>
            <AlertDescription>
              {
                "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요."
              }
            </AlertDescription>
          </Alert>
        ) : null}

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
            <TabsList
              variant="line"
              className="min-h-11 w-full justify-start border-b bg-transparent"
            >
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
                <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
                  <Table aria-label="재고 품목" className="min-w-[940px]">
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow>
                        <TableHead scope="col" className="w-40">
                          품목
                        </TableHead>
                        <TableHead scope="col" className="w-20">
                          규격
                        </TableHead>
                        <TableHead scope="col" className="w-16 text-right">
                          전일재고
                        </TableHead>
                        <TableHead scope="col" className="w-16 text-right">
                          매입
                        </TableHead>
                        <TableHead scope="col" className="w-20 text-right">
                          손실
                        </TableHead>
                        <TableHead scope="col" className="w-20 text-right">
                          기준재고
                        </TableHead>
                        <TableHead scope="col" className="w-28">
                          당일재고
                        </TableHead>
                        <TableHead scope="col" className="w-28 text-right">
                          차이
                        </TableHead>
                        <TableHead scope="col" className="w-28 text-right">
                          재고금액
                        </TableHead>
                        <TableHead scope="col" className="w-56">
                          정정
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{renderRows(category)}</TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>

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

          <div className="bg-background/95 sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 border-t p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <Button
              type="submit"
              variant={resultMessage === "저장됐습니다." ? "outline" : "default"}
              className="min-h-11 w-full sm:w-auto"
              disabled={isSaving || isClosed}
            >
              {isSaving ? "저장 중..." : "저장"}
            </Button>
            {resultMessage === "저장됐습니다." ? (
              <Button asChild className="min-h-11 w-full sm:w-auto">
                <a href={nextStepHref}>다음 단계로 →</a>
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
