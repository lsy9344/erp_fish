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
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import {
  saveLedgerInventoryAdjustment,
  saveLedgerInventoryItems,
} from "~/features/inventory/actions";
import {
  type InventoryAdjustmentView,
  type InventoryStepData,
  type InventoryStepLine,
  type StoreManagerInventoryStepData,
} from "~/features/inventory/types";
import { type ActionResult, type FieldErrors } from "~/lib/action-result";

type InventoryStepClientProps = {
  storeName: string;
  initialData: InventoryDisplayData;
  saveItemsAction?: (
    input: unknown,
  ) => Promise<ActionResult<InventoryDisplayData>>;
  saveAdjustmentAction?: (
    input: unknown,
  ) => Promise<ActionResult<InventoryDisplayData>>;
  ledgerLabel?: string;
  showStepNavigation?: boolean;
};

type InventoryDisplayData = InventoryStepData | StoreManagerInventoryStepData;

type InventoryLineState = InventoryDisplayData["items"][number] & {
  currentQuantityInput: string;
  adjustmentReasonInput: string;
};

const categories = ["냉동", "생물"] as const;
const MAX_INVENTORY_INTEGER = 2_147_483_647;
const ROW_PAGING_THRESHOLD = 30;
const ROW_PAGE_SIZE = 50;
const carryoverLoadedMessage =
  "전일 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요.";
const carryoverManualMessage =
  "전일 장부나 이월 근거가 부족해 이월 공백 상태입니다. 직접 확인해 주세요.";

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

function hasSensitiveInventoryAmounts(
  item: InventoryDisplayData["items"][number],
): item is InventoryStepLine {
  return "unitPrice" in item;
}

function hasSensitiveAdjustmentAmounts(
  adjustment: InventoryLineState["adjustment"],
): adjustment is InventoryAdjustmentView {
  return Boolean(
    adjustment &&
    "differenceAmount" in adjustment &&
    adjustment.amountStatus === "CONFIRMED",
  );
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

function toLineState(data: InventoryDisplayData): InventoryLineState[] {
  return data.items.map((item) => ({
    ...item,
    currentQuantityInput:
      item.currentQuantity === null ? "" : String(item.currentQuantity),
    adjustmentReasonInput: item.adjustment?.reason ?? "",
  }));
}

function mergeAdjustedLineState(
  data: InventoryDisplayData,
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

function areInventoryLinesEqual(
  left: InventoryLineState[],
  right: InventoryLineState[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const [pageByCategory, setPageByCategory] = useState<
    Record<(typeof categories)[number], number>
  >({
    냉동: 1,
    생물: 1,
  });
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
  const showsSensitiveAmounts = items.some(hasSensitiveInventoryAmounts);

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
  const originalEditBlockedMessage =
    data.status === "HOLIDAY"
      ? "휴무 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요."
      : "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.";
  const nextStepHref = `/app/store-entry/losses?${new URLSearchParams({
    storeId: data.storeId,
    date: getKstLedgerDateParam(data.closingDate),
  }).toString()}`;
  const isAdjustmentSavePending = savingAdjustmentProductId !== null;
  // Contract: disabled={isClosed || savingAdjustmentProductId !== null}

  useEffect(() => {
    setData(initialData);
    setItems(toLineState(initialData));
    setPageByCategory({ 냉동: 1, 생물: 1 });
  }, [initialData]);

  function getCategoryItems(category: string) {
    return items.filter((item) => item.productCategory === category);
  }

  function getCategoryPage(category: (typeof categories)[number]) {
    const visibleItems = getCategoryItems(category);
    const pageCount = Math.max(
      1,
      Math.ceil(visibleItems.length / ROW_PAGE_SIZE),
    );

    return Math.min(pageByCategory[category] ?? 1, pageCount);
  }

  function setCategoryPage(
    category: (typeof categories)[number],
    page: number,
  ) {
    setPageByCategory((current) => ({ ...current, [category]: page }));
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;

        if (errors[`items.${index}.currentQuantity`]?.length) {
          const category = normalizeCategory(item.productCategory);
          const categoryIndex = getCategoryItems(category).findIndex(
            (candidate) => candidate.productId === item.productId,
          );
          setActiveCategory(category);
          setCategoryPage(
            category,
            Math.floor(Math.max(0, categoryIndex) / ROW_PAGE_SIZE) + 1,
          );
          window.setTimeout(() => {
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }

        if (errors[`items.${index}.quantity`]?.length) {
          const category = normalizeCategory(item.productCategory);
          const categoryIndex = getCategoryItems(category).findIndex(
            (candidate) => candidate.productId === item.productId,
          );
          setActiveCategory(category);
          setCategoryPage(
            category,
            Math.floor(Math.max(0, categoryIndex) / ROW_PAGE_SIZE) + 1,
          );
          window.setTimeout(() => {
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }
      }
    }, 0);
  }

  async function saveCurrentDraft() {
    if (isClosed) {
      setResultMessage(null);
      setFormError(originalEditBlockedMessage);
      setAdjustmentErrors({});
      toast.error(originalEditBlockedMessage);
      return false;
    }

    if (isAdjustmentSavePending) {
      const message = "재고 조정 저장이 끝난 뒤 다시 저장해 주세요.";
      setResultMessage(null);
      setFormError(message);
      toast.error(message);
      return false;
    }

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
    setAdjustmentErrors({});

    try {
      const result = await saveItemsAction({
        ledgerId: data.id,
        storeId: data.storeId,
        closingDate: getKstLedgerDateParam(data.closingDate),
        version: data.version,
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
        return false;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      setAdjustmentErrors({});
      setResultMessage("저장됐습니다.");
      toast.success("재고 정보를 저장했습니다.");
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
        storeId: data.storeId,
        closingDate: getKstLedgerDateParam(data.closingDate),
        version: data.version,
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

    switch (item.carryoverStatus) {
      case "PREVIOUS_CARRYOVER":
        badges.push({
          label: "전일 이월",
          detail: `직전 본사 마감 장부의 당일재고 후보입니다. 전일재고 ${formatQuantity(item.previousQuantity)}.`,
          className:
            "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300",
        });
        break;
      case "REVIEW_REQUIRED":
        badges.push({
          label: "검토 필요",
          detail: `직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 확인이 필요합니다. 전일재고 ${formatQuantity(item.previousQuantity)}.`,
          className:
            "border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300",
        });
        break;
      case "CARRYOVER_EMPTY":
        badges.push({
          label: "이월 공백",
          detail:
            "전일 장부나 이월 근거가 부족합니다. 표시된 0은 확정 재고가 아니라 확인이 필요한 기본 입력값입니다.",
          className:
            "border-rose-600 text-rose-700 dark:border-rose-400 dark:text-rose-300",
        });
        break;
      case "CARRYOVER_RECHECK_REQUIRED":
        badges.push({
          label: "이월 재확인 필요",
          detail:
            "마감 또는 정정으로 이월 기준이 바뀔 수 있습니다. 기존 입력값은 자동으로 덮어쓰지 않습니다.",
          className:
            "border-orange-600 text-orange-700 dark:border-orange-400 dark:text-orange-300",
        });
        break;
      case "OPENING_CARRYOVER":
        badges.push({
          label: "월초 이월",
          detail: `월초 재고 스냅샷에서 넘어온 품목입니다. 전일재고 ${formatQuantity(item.previousQuantity)}.`,
          className:
            "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300",
        });
        break;
      case "POLICY_UNCONFIRMED":
        badges.push({
          label: "기준 확인 필요",
          detail:
            "FIFO, 30%단가, 확정 재고금액 같은 정책 미정 항목은 이 화면에서 계산하지 않습니다.",
          className:
            "border-purple-600 text-purple-700 dark:border-purple-400 dark:text-purple-300",
        });
        break;
      case "DATA_INSUFFICIENT":
      default:
        badges.push({
          label: "데이터 부족",
          detail:
            "이월 기준 데이터가 부족합니다. 0이나 정상값으로 확정하지 말고 근거를 확인해 주세요.",
          className:
            "border-slate-500 text-slate-700 dark:border-slate-400 dark:text-slate-300",
        });
        break;
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
      const lossDetail = hasSensitiveInventoryAmounts(item)
        ? ` 손실 ${formatQuantity(item.lossQuantity)}, 손실액 ${formatKrw(item.lossAmount)}.`
        : ` 손실 ${formatQuantity(item.lossQuantity)}.`;

      badges.push({
        label: "오늘 손실",
        detail: `손실/폐기 입력에 저장된 수량입니다.${lossDetail}`,
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
          <span
            tabIndex={0}
            aria-label={`${label}: ${detail}`}
            className="inline-flex outline-none"
          >
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
    const visibleItems = getCategoryItems(category);
    const normalizedCategory = normalizeCategory(category);
    const page = getCategoryPage(normalizedCategory);
    const pagedItems =
      visibleItems.length > ROW_PAGING_THRESHOLD
        ? visibleItems.slice((page - 1) * ROW_PAGE_SIZE, page * ROW_PAGE_SIZE)
        : visibleItems;

    if (visibleItems.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={showsSensitiveAmounts ? 10 : 9}
            className="text-muted-foreground h-24 text-center"
          >
            표시할 품목이 없습니다.
          </TableCell>
        </TableRow>
      );
    }

    return pagedItems.map((item) => {
      const globalIndex = items.findIndex(
        (candidate) => candidate.productId === item.productId,
      );
      const quantityError =
        fieldErrors[`items.${globalIndex}.currentQuantity`]?.[0];
      const modified = isLineModified(item) || item.isModified;
      const adjusted = Boolean(item.adjustment);
      const adjustmentNeeded = !adjusted && isAdjustmentNeeded(item);
      const amount = hasSensitiveInventoryAmounts(item)
        ? getInventoryAmount(item.currentQuantityInput, item.unitPrice)
        : null;
      const systemQuantity = getSystemQuantity(item);
      const quantityDifference = getQuantityDifference(item);
      const reasonError = adjustmentErrors[item.productId];
      const isSavingThisAdjustment =
        savingAdjustmentProductId === item.productId;
      const sourceBadges = getSourceBadges(item);
      const adjustmentActionLabel = adjusted ? "수정" : "조정";
      const adjustmentAmountPolicyUnconfirmed =
        item.adjustment?.amountStatus === "POLICY_UNCONFIRMED";

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
                        ? `조정 사유가 저장됐습니다. 차이 ${formatSignedQuantity(item.adjustment.differenceQuantity)}개.`
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
              {hasSensitiveInventoryAmounts(item) ? (
                <span className="text-muted-foreground text-xs">
                  {formatKrw(item.lossAmount)}
                </span>
              ) : null}
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
              onFocus={(event) =>
                event.currentTarget.scrollIntoView({
                  block: "center",
                  inline: "nearest",
                })
              }
              onChange={(event) =>
                updateCurrentQuantity(item.productId, event.currentTarget.value)
              }
              disabled={isSaving || isClosed || isAdjustmentSavePending}
              className="h-11 tabular-nums sm:h-8"
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
          {showsSensitiveAmounts ? (
            <TableCell className="w-28 text-right tabular-nums">
              {formatKrw(amount)}
            </TableCell>
          ) : null}
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
                        {item.adjustment.beforeQuantity}
                        {hasSensitiveAdjustmentAmounts(item.adjustment)
                          ? ` / ${formatKrw(item.adjustment.beforeAmount)}`
                          : ""}
                      </span>
                    </p>
                    <p>
                      조정 후{" "}
                      <span className="tabular-nums">
                        {item.adjustment.afterQuantity}
                        {hasSensitiveAdjustmentAmounts(item.adjustment)
                          ? ` / ${formatKrw(item.adjustment.afterAmount)}`
                          : ""}
                      </span>
                    </p>
                    <p>
                      차이{" "}
                      <span className="tabular-nums">
                        {formatSignedQuantity(
                          item.adjustment.differenceQuantity,
                        )}
                        {hasSensitiveAdjustmentAmounts(item.adjustment)
                          ? ` / ${formatKrw(item.adjustment.differenceAmount)}`
                          : ""}
                      </span>
                    </p>
                    {adjustmentAmountPolicyUnconfirmed ? (
                      <p>금액 기준 확인 필요</p>
                    ) : null}
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
                    disabled={isAdjustmentSavePending || isClosed}
                    className="h-11 min-w-0 flex-1 sm:h-8"
                    placeholder="조정 사유"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${item.productName} 조정 ${adjustmentActionLabel}`}
                    onClick={() => handleAdjustmentSave(item)}
                    disabled={savingAdjustmentProductId !== null || isClosed}
                    className="h-11 shrink-0 px-2 text-xs sm:h-8"
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

  function renderPagingControls(category: (typeof categories)[number]) {
    const visibleItems = getCategoryItems(category);

    if (visibleItems.length <= ROW_PAGING_THRESHOLD) {
      return null;
    }

    const page = getCategoryPage(category);
    const pageCount = Math.ceil(visibleItems.length / ROW_PAGE_SIZE);
    const start = (page - 1) * ROW_PAGE_SIZE + 1;
    const end = Math.min(page * ROW_PAGE_SIZE, visibleItems.length);

    return (
      <div className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground tabular-nums">
          {start}-{end} / {visibleItems.length}행
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setCategoryPage(category, page - 1)}
          >
            이전
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setCategoryPage(category, page + 1)}
          >
            다음
          </Button>
        </div>
      </div>
    );
  }

  const isDirty = !areInventoryLinesEqual(items, toLineState(data));
  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <UnsavedChangeDialog
          open={guard.isDialogOpen}
          isSaving={isSaving}
          onOpenChange={guard.setIsDialogOpen}
          onSave={guard.saveAndContinue}
          onDiscard={guard.discard}
          onKeepEditing={guard.keepEditing}
        />

        <LedgerContextHeader
          ledgerLabel={ledgerLabel}
          title="재고 입력"
          storeName={storeName}
          storeId={data.storeId}
          closingDate={data.closingDate}
          authorDisplayName={data.authorDisplayName}
          status={data.status}
        />

        {showStepNavigation ? (
          <StoreEntryStepNavigation
            storeId={data.storeId}
            closingDate={data.closingDate}
            currentStep="inventory"
            stepCompletion={data.stepCompletion}
            onNavigateAttempt={guard.requestNavigation}
          />
        ) : null}

        <LedgerSaveStatus
          stepLabel="4단계 재고"
          authorDisplayName={data.authorDisplayName}
          updatedAt={data.updatedAt}
          isSaving={isSaving || isAdjustmentSavePending}
          errorMessage={formError}
          successMessage={resultMessage}
          unsavedFields={["현재 재고", "재고 조정 사유"]}
          onRetry={() => formRef.current?.requestSubmit()}
          retryDisabled={isSaving || isAdjustmentSavePending || isClosed}
        />

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
            <AlertTitle>
              {data.status === "HOLIDAY" ? "휴무 장부" : "본사 마감 장부"}
            </AlertTitle>
            <AlertDescription>{originalEditBlockedMessage}</AlertDescription>
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
                {renderPagingControls(category)}
                <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
                  <Table
                    aria-label="재고 품목"
                    className={
                      showsSensitiveAmounts ? "min-w-[940px]" : "min-w-[820px]"
                    }
                  >
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
                        {showsSensitiveAmounts ? (
                          <TableHead scope="col" className="w-28 text-right">
                            재고금액
                          </TableHead>
                        ) : null}
                        <TableHead scope="col" className="w-56">
                          상태/조정
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
              variant={
                resultMessage === "저장됐습니다." ? "outline" : "default"
              }
              className="min-h-11 w-full sm:w-auto"
              disabled={isSaving || isClosed || isAdjustmentSavePending}
            >
              {isSaving ? "저장 중..." : "저장"}
            </Button>
            {resultMessage === "저장됐습니다." ? (
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                onClick={(event) =>
                  guard.requestNavigation(nextStepHref, event.currentTarget)
                }
              >
                다음 단계로 →
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
