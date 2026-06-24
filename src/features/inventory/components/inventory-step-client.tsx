"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { HqEditReasonField } from "~/features/ledger/components/hq-edit-reason-field";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import { inventoryTerms } from "~/features/inventory/terms";
import {
  getLedgerEditBlockReason,
  isLedgerReadOnly,
} from "~/features/ledger/status-policy";
import {
  saveLedgerInventoryAdjustment,
  saveLedgerInventoryItems,
} from "~/features/inventory/actions";
import { missingAdjustmentReasonMessage } from "~/features/inventory/adjustment-save-guard";
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
  hqEditReasonRequired?: boolean;
};

type InventoryDisplayData = InventoryStepData | StoreManagerInventoryStepData;

type InventoryLineState = InventoryDisplayData["items"][number] & {
  currentQuantityInput: string;
  adjustmentReasonInput: string;
};

const categories = ["냉동", "생물"] as const;
// 탭은 "전체"를 맨 왼쪽에 두고 기본값으로 사용한다. "전체"는 실제 품목 분류가
// 아니라 모든 분류를 한 번에 보여주는 보기 전용 탭이다. 데이터 정규화에는 여전히
// 실제 분류(categories)만 쓴다.
const viewTabs = ["전체", ...categories] as const;
type ViewTab = (typeof viewTabs)[number];
const DEFAULT_VIEW_TAB: ViewTab = "전체";
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

function normalizeViewTab(value: string): ViewTab {
  return (viewTabs as readonly string[]).includes(value)
    ? (value as ViewTab)
    : DEFAULT_VIEW_TAB;
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
  hqEditReasonRequired = false,
}: InventoryStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const currentQuantityRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const reasonRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [hqEditReason, setHqEditReason] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<ViewTab>(DEFAULT_VIEW_TAB);
  const [pageByCategory, setPageByCategory] = useState<Record<ViewTab, number>>(
    {
      전체: 1,
      냉동: 1,
      생물: 1,
    },
  );
  const [selectedCarryoverItem, setSelectedCarryoverItem] =
    useState<InventoryLineState | null>(null);
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
  const saveConflict = useSaveConflictDialog();
  const hqEditReasonError = fieldErrors.reason?.[0];

  useLedgerUpdatedAtSync(data.id, (updatedAt) => {
    setData((current) => ({ ...current, updatedAt }));
  });

  const carryoverMessage =
    data.carryover.message ||
    (data.carryover.status === "manual"
      ? carryoverManualMessage
      : carryoverLoadedMessage);
  const isOriginalEditBlocked = isLedgerReadOnly(data.status);
  const isClosed = isOriginalEditBlocked;
  const originalEditBlockedMessage = getLedgerEditBlockReason(
    data.status,
    "inventory-adjustment",
  ).message;
  const nextStepHref = `/app/store-entry/losses?${new URLSearchParams({
    storeId: data.storeId,
    date: getKstLedgerDateParam(data.closingDate),
  }).toString()}`;
  const isAdjustmentSavePending = savingAdjustmentProductId !== null;
  // Contract: disabled={isClosed || savingAdjustmentProductId !== null}
  const isDirty = !areInventoryLinesEqual(items, toLineState(data));
  const previousInitialDataRef = useRef(initialData);

  useEffect(() => {
    const previousInitialData = previousInitialDataRef.current;
    const previousItems = toLineState(previousInitialData);
    const nextItems = toLineState(initialData);

    setData(initialData);
    setItems((current) =>
      areInventoryLinesEqual(current, previousItems) ? nextItems : current,
    );
    previousInitialDataRef.current = initialData;
  }, [initialData]);

  function getCategoryItems(category: ViewTab) {
    // "전체" 탭은 분류와 무관하게 모든 품목을 보여준다.
    if (category === "전체") {
      return items;
    }

    return items.filter((item) => item.productCategory === category);
  }

  function getCategoryPage(category: ViewTab) {
    const visibleItems = getCategoryItems(category);
    const pageCount = Math.max(
      1,
      Math.ceil(visibleItems.length / ROW_PAGE_SIZE),
    );

    return Math.min(pageByCategory[category] ?? 1, pageCount);
  }

  function setCategoryPage(category: ViewTab, page: number) {
    setPageByCategory((current) => ({ ...current, [category]: page }));
  }

  // 오류/조정 항목으로 이동할 탭을 고른다. 현재 탭이 그 품목을 이미 보여주고
  // 있으면(=현재 탭이 "전체"거나 품목 분류와 일치) 탭을 바꾸지 않고, 아니면
  // 품목의 실제 분류 탭으로 전환한다. "전체" 보기에서 불필요하게 이탈하지 않도록.
  function resolveItemViewTab(item: InventoryLineState): ViewTab {
    if (activeCategory === "전체") {
      return "전체";
    }

    return normalizeCategory(item.productCategory);
  }

  function focusItemRow(item: InventoryLineState) {
    const tab = resolveItemViewTab(item);
    const tabIndex = getCategoryItems(tab).findIndex(
      (candidate) => candidate.productId === item.productId,
    );
    setActiveCategory(tab);
    setCategoryPage(tab, Math.floor(Math.max(0, tabIndex) / ROW_PAGE_SIZE) + 1);
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;

        if (
          errors[`items.${index}.currentQuantity`]?.length ||
          errors[`items.${index}.quantity`]?.length
        ) {
          focusItemRow(item);
          window.setTimeout(() => {
            currentQuantityRefs.current[item.productId]?.focus();
          }, 0);
          return;
        }
      }

      if (errors.reason?.length) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 0);
  }

  function validateInventorySaveAdjustments() {
    const nextErrors: Record<string, string> = {};
    let firstInvalidItem: InventoryLineState | null = null;

    for (const item of items) {
      const systemQuantity = getSystemQuantity(item);
      const currentQuantity = parseQuantityInput(
        currentQuantityRefs.current[item.productId]?.value ??
          item.currentQuantityInput,
      );

      if (
        systemQuantity === null ||
        currentQuantity === null ||
        currentQuantity === systemQuantity ||
        item.adjustment?.afterQuantity === currentQuantity
      ) {
        continue;
      }

      nextErrors[item.productId] = missingAdjustmentReasonMessage;
      firstInvalidItem ??= item;
    }

    if (!firstInvalidItem) {
      return true;
    }

    setAdjustmentErrors(nextErrors);
    setFormError(missingAdjustmentReasonMessage);
    focusItemRow(firstInvalidItem);
    window.setTimeout(() => {
      reasonRefs.current[firstInvalidItem.productId]?.focus();
    }, 0);
    toast.error(missingAdjustmentReasonMessage);

    return false;
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

    if (!validateInventorySaveAdjustments()) {
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
        ledgerUpdatedAt: data.updatedAt,
        items: items.map((item) => ({
          productId: item.productId,
          currentQuantity:
            currentQuantityRefs.current[item.productId]?.value ??
            item.currentQuantityInput,
          quantity:
            currentQuantityRefs.current[item.productId]?.value ??
            item.currentQuantityInput,
        })),
        ...(hqEditReasonRequired ? { reason: hqEditReason } : {}),
      });

      if (!result.ok) {
        if (saveConflict.captureConflict(result)) {
          setFormError(result.error.message);
          toast.error(result.error.message);
          return false;
        }

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
    const reason = hqEditReasonRequired
      ? hqEditReason.trim()
      : item.adjustmentReasonInput.trim();

    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
    setAdjustmentErrors((current) => {
      const next = { ...current };
      delete next[item.productId];
      return next;
    });

    if (!reason) {
      if (hqEditReasonRequired) {
        setFieldErrors({
          reason: ["본사 수정 사유를 입력해 주세요."],
        });
        setFormError("본사 수정 사유를 입력해 주세요.");
      } else {
        setAdjustmentErrors((current) => ({
          ...current,
          [item.productId]: inventoryTerms.adjustmentReasonRequired,
        }));
      }

      window.setTimeout(() => {
        if (hqEditReasonRequired) {
          hqEditReasonInputRef.current?.focus();
          return;
        }

        reasonRefs.current[item.productId]?.focus();
      }, 0);
      return;
    }

    const actualQuantityInput =
      currentQuantityRefs.current[item.productId]?.value ??
      item.currentQuantityInput;

    setSavingAdjustmentProductId(item.productId);

    try {
      const result = await saveAdjustmentAction({
        ledgerId: data.id,
        storeId: data.storeId,
        closingDate: getKstLedgerDateParam(data.closingDate),
        version: data.version,
        ledgerUpdatedAt: data.updatedAt,
        productId: item.productId,
        actualQuantity: actualQuantityInput,
        reason: hqEditReasonRequired ? hqEditReason : reason,
      });

      if (!result.ok) {
        if (saveConflict.captureConflict(result)) {
          setFormError(result.error.message);
          toast.error(result.error.message);
          return;
        }

        const reasonError = result.error.fieldErrors?.reason?.[0];
        const actualQuantityError =
          result.error.fieldErrors?.actualQuantity?.[0];

        if (reasonError) {
          if (!hqEditReasonRequired) {
            setAdjustmentErrors((current) => ({
              ...current,
              [item.productId]: reasonError,
            }));
          }

          window.setTimeout(() => {
            if (hqEditReasonRequired) {
              hqEditReasonInputRef.current?.focus();
              return;
            }

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

          focusItemRow(item);
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

  function formatOptionalQuantity(value: number | null) {
    return value === null ? "-" : formatQuantity(value);
  }

  function formatCarryoverBasisDate(
    detail: InventoryLineState["previousQuantityDetail"],
  ) {
    if (detail.sourceLedgerClosingDate) {
      return formatDate(detail.sourceLedgerClosingDate);
    }

    if (detail.sourceYearMonth) {
      return `${detail.sourceYearMonth} 기준`;
    }

    return "-";
  }

  function getCarryoverQuantityTimeline(item: InventoryLineState) {
    const detail = item.previousQuantityDetail;
    const basisDate = formatCarryoverBasisDate(detail);
    const currentLedgerDate = formatDate(data.closingDate);
    const rows: {
      label: string;
      date: string;
      quantity: number | null;
      note: string;
    }[] = [];

    if (detail.source === "OPENING_SNAPSHOT") {
      rows.push({
        label: "월초 스냅샷 수량",
        date: basisDate,
        quantity:
          detail.sourceQuantity ??
          detail.sourcePreviousQuantity ??
          detail.resolvedQuantity,
        note: "월초 기준으로 저장된 시작 재고입니다.",
      });
    } else {
      rows.push({
        label: "기준 장부 시작 수량",
        date: basisDate,
        quantity: detail.sourcePreviousQuantity,
        note: "근거 장부가 시작할 때의 재고입니다.",
      });
      rows.push({
        label: "기준 장부 매입 수량",
        date: basisDate,
        quantity: detail.sourcePurchasedQuantity,
        note: "근거 장부에 저장된 매입 수량입니다.",
      });
      rows.push({
        label: "기준 장부 손실 수량",
        date: basisDate,
        quantity: detail.sourceLossQuantity,
        note: "근거 장부에 저장된 손실/폐기 수량입니다.",
      });
      rows.push({
        label: "기준 장부 마감 수량",
        date: basisDate,
        quantity: detail.sourceCurrentQuantity ?? detail.sourceQuantity,
        note: "현재 장부로 넘어온 마감 기준 수량입니다.",
      });

      if (
        detail.sourceQuantity !== null &&
        detail.sourceCurrentQuantity !== null &&
        detail.sourceQuantity !== detail.sourceCurrentQuantity
      ) {
        rows.push({
          label: "기준 장부 표시 수량",
          date: basisDate,
          quantity: detail.sourceQuantity,
          note: "근거 장부 화면에 표시된 재고 수량입니다.",
        });
      }
    }

    rows.push({
      label: "현재 장부 전일재고",
      date: currentLedgerDate,
      quantity: detail.resolvedQuantity,
      note: "현재 재고 입력 화면에 표시되는 이월 수량입니다.",
    });

    return rows;
  }

  function getQuantityDifference(item: InventoryLineState) {
    const systemQuantity = getSystemQuantity(item);
    const actualQuantity = parseQuantityInput(item.currentQuantityInput);

    if (systemQuantity === null || actualQuantity === null) {
      return null;
    }

    return systemQuantity - actualQuantity;
  }

  function formatDifference(value: number | null) {
    if (value === null) {
      return "계산 불가";
    }

    if (value < 0) {
      return `${formatSignedQuantity(value)}개`;
    }

    return formatQuantity(value);
  }

  function formatDate(value: string | null) {
    return value ? value.slice(0, 10) : "-";
  }

  function formatSourceLabel(source: InventoryLineState["carryoverSource"]) {
    switch (source) {
      case "PREVIOUS_CLOSED_LEDGER":
        return "직전 본사 마감 장부";
      case "PREVIOUS_SAVED_LEDGER":
        return "직전 저장 장부";
      case "OPENING_SNAPSHOT":
        return "월초 스냅샷";
      case "MANUAL":
      default:
        return "수동/근거 부족";
    }
  }

  function formatStatusLabel(status: InventoryLineState["carryoverStatus"]) {
    switch (status) {
      case "PREVIOUS_CARRYOVER":
        return "전일 이월";
      case "REVIEW_REQUIRED":
        return "검토 필요";
      case "CARRYOVER_EMPTY":
        return "이월 공백";
      case "CARRYOVER_RECHECK_REQUIRED":
        return "이월 재확인 필요";
      case "OPENING_CARRYOVER":
        return "월초 이월";
      case "POLICY_UNCONFIRMED":
        return "기준 확인 필요";
      case "DATA_INSUFFICIENT":
      default:
        return "데이터 부족";
    }
  }

  function formatLedgerStatus(
    status: InventoryLineState["previousQuantityDetail"]["sourceLedgerStatus"],
  ) {
    switch (status) {
      case "HEADQUARTERS_CLOSED":
        return "본사 마감";
      case "IN_REVIEW":
        return "검토 대기";
      case "IN_PROGRESS":
        return "저장 중";
      case "HOLIDAY":
        return "휴무";
      default:
        return "-";
    }
  }

  function shouldWarnCarryoverDetail(item: InventoryLineState) {
    return [
      "REVIEW_REQUIRED",
      "CARRYOVER_EMPTY",
      "CARRYOVER_RECHECK_REQUIRED",
      "DATA_INSUFFICIENT",
      "POLICY_UNCONFIRMED",
    ].includes(item.previousQuantityDetail.status);
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
            "30%단가 같은 정책 미정 항목은 이 화면에서 계산하지 않습니다. 선입선출(FIFO) 기준 금액도 표에 표시하지 않습니다.",
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

  const inventoryFlowDifferenceHelp =
    inventoryTerms.inventoryFlowDifferenceHelp;

  function renderCarryoverDetailDialog() {
    if (!selectedCarryoverItem) {
      return null;
    }

    const detail = selectedCarryoverItem.previousQuantityDetail;
    const timelineRows = getCarryoverQuantityTimeline(selectedCarryoverItem);
    const basisLabel =
      detail.source === "OPENING_SNAPSHOT" ? "기준월" : "기준일";
    const basisDate = formatCarryoverBasisDate(detail);
    const summaryRows = [
      ["출처", formatSourceLabel(detail.source)],
      ["상태", formatStatusLabel(detail.status)],
      [basisLabel, basisDate],
      ["근거 장부 상태", formatLedgerStatus(detail.sourceLedgerStatus)],
    ];

    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCarryoverItem(null);
          }
        }}
      >
        <DialogContent className="h-[min(90vh,42rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="px-4 pt-4 pr-12 pb-3">
            <DialogTitle>{inventoryTerms.carryoverHistoryTitle}</DialogTitle>
            <DialogDescription>
              {selectedCarryoverItem.productName} 전일재고가 어느 날짜의 몇
              개에서 넘어왔는지 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="grid gap-4">
              {shouldWarnCarryoverDetail(selectedCarryoverItem) ? (
                <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
                  이 값은 확정값이 아니라 확인이 필요한 후보입니다.
                </p>
              ) : null}
              <section className="bg-muted/30 grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid gap-1">
                  <p className="text-muted-foreground text-xs">
                    현재 장부 전일재고
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatQuantity(detail.resolvedQuantity)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatDate(data.closingDate)} 재고 입력에 표시되는 수량
                  </p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {formatStatusLabel(detail.status)}
                </Badge>
              </section>
              <p className="text-muted-foreground text-sm">{detail.message}</p>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                {summaryRows.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">날짜별 수량 흐름</h3>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">구분</TableHead>
                        <TableHead scope="col" className="w-28">
                          날짜
                        </TableHead>
                        <TableHead scope="col" className="w-24 text-right">
                          수량
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timelineRows.map((row) => (
                        <TableRow key={`${row.label}-${row.date}`}>
                          <TableCell>
                            <div className="grid gap-0.5">
                              <span className="font-medium">{row.label}</span>
                              <span className="text-muted-foreground text-xs">
                                {row.note}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row.date}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatOptionalQuantity(row.quantity)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
              {detail.history.length > 0 ? (
                <section className="grid gap-2">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between">
                    <h3 className="text-sm font-semibold">
                      이전 날짜 재고 이력
                    </h3>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      최근 {detail.history.length}일
                    </p>
                  </div>
                  <div className="max-h-[18rem] overflow-auto overscroll-contain rounded-md border">
                    <Table className="min-w-[620px]">
                      <TableHeader className="bg-background sticky top-0 z-10">
                        <TableRow>
                          <TableHead scope="col" className="w-28">
                            날짜
                          </TableHead>
                          <TableHead scope="col" className="w-28">
                            상태
                          </TableHead>
                          <TableHead scope="col" className="w-24 text-right">
                            전일
                          </TableHead>
                          <TableHead scope="col" className="w-24 text-right">
                            매입
                          </TableHead>
                          <TableHead scope="col" className="w-24 text-right">
                            손실
                          </TableHead>
                          <TableHead scope="col" className="w-24 text-right">
                            마감
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.history.map((row) => (
                          <TableRow key={row.ledgerId}>
                            <TableCell className="tabular-nums">
                              {formatDate(row.closingDate)}
                            </TableCell>
                            <TableCell>
                              {formatLedgerStatus(row.ledgerStatus)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatQuantity(row.previousQuantity)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatQuantity(row.purchasedQuantity)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatOptionalQuantity(row.lossQuantity)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatOptionalQuantity(
                                row.currentQuantity ?? row.quantity,
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function renderRows(category: ViewTab) {
    const visibleItems = getCategoryItems(category);
    const page = getCategoryPage(category);
    const pagedItems =
      visibleItems.length > ROW_PAGING_THRESHOLD
        ? visibleItems.slice((page - 1) * ROW_PAGE_SIZE, page * ROW_PAGE_SIZE)
        : visibleItems;

    if (visibleItems.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={9}
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
      const systemQuantity = getSystemQuantity(item);
      const quantityDifference = getQuantityDifference(item);
      const reasonError = adjustmentErrors[item.productId];
      const isSavingThisAdjustment =
        savingAdjustmentProductId === item.productId;
      const sourceBadges = getSourceBadges(item);
      const adjustmentActionLabel = adjusted ? "수정" : "조정";
      const adjustmentButtonLabel = `${item.productName} 조정 기록`;
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
                      detail: `기준재고 ${formatQuantity(systemQuantity)}와 당일재고 ${formatQuantity(parseQuantityInput(item.currentQuantityInput))}가 다릅니다. 조정 사유를 남겨 주세요.`,
                      className:
                        "border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300",
                    })
                  : null}
                {adjusted
                  ? renderBadgeWithTooltip({
                      label: "조정됨",
                      detail: item.adjustment
                        ? `조정 사유가 저장됐습니다. 조정 차이 ${formatSignedQuantity(item.adjustment.differenceQuantity)}개.`
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
            <Button
              type="button"
              variant="link"
              size="sm"
              aria-label={`${item.productName} 전일재고 이력 보기`}
              onClick={() => setSelectedCarryoverItem(item)}
              className="h-11 min-w-11 px-1 text-right tabular-nums"
            >
              {item.previousQuantity}
            </Button>
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
              className="h-11 tabular-nums"
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
                      조정 차이{" "}
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
                    aria-label={`${item.productName} ${inventoryTerms.adjustmentReason}`}
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
                    className="h-11 min-w-0 flex-1"
                    placeholder={inventoryTerms.adjustmentReasonPlaceholder}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={adjustmentButtonLabel}
                    onClick={() => handleAdjustmentSave(item)}
                    disabled={savingAdjustmentProductId !== null || isClosed}
                    className="h-11 shrink-0 px-2 text-xs"
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

  function renderPagingControls(category: ViewTab) {
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

  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {renderCarryoverDetailDialog()}
        <UnsavedChangeDialog
          open={guard.isDialogOpen}
          isSaving={isSaving}
          onOpenChange={guard.setIsDialogOpen}
          onSave={guard.saveAndContinue}
          onDiscard={guard.discard}
          onKeepEditing={guard.keepEditing}
        />
        <SaveConflictDialog
          open={saveConflict.isOpen}
          conflict={saveConflict.conflict}
          onOpenChange={saveConflict.setIsOpen}
          onReload={saveConflict.reloadLatest}
          onKeepEditing={saveConflict.keepEditing}
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

        {hqEditReasonRequired ? (
          <section className="bg-card text-card-foreground rounded-lg border p-4">
            <HqEditReasonField
              id="inventory-hq-edit-reason"
              value={hqEditReason}
              error={hqEditReasonError}
              disabled={isSaving || isClosed || isAdjustmentSavePending}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          </section>
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
              setActiveCategory(normalizeViewTab(value))
            }
          >
            <TabsList
              variant="line"
              className="min-h-11 w-full justify-start border-b bg-transparent"
            >
              {viewTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="min-h-9 px-4">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            {viewTabs.map((tab) => (
              <TabsContent key={tab} value={tab}>
                {renderPagingControls(tab)}
                <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
                  <Table aria-label="재고 품목" className="min-w-[820px]">
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow>
                        <TableHead scope="col" className="w-40">
                          {inventoryTerms.product}
                        </TableHead>
                        <TableHead scope="col" className="w-20">
                          {inventoryTerms.spec}
                        </TableHead>
                        <TableHead scope="col" className="w-16 text-right">
                          {inventoryTerms.previousStock}
                        </TableHead>
                        <TableHead scope="col" className="w-16 text-right">
                          {inventoryTerms.purchase}
                        </TableHead>
                        <TableHead scope="col" className="w-20 text-right">
                          {inventoryTerms.loss}
                        </TableHead>
                        <TableHead scope="col" className="w-20 text-right">
                          {inventoryTerms.baselineStock}
                        </TableHead>
                        <TableHead scope="col" className="w-28">
                          {inventoryTerms.currentStock}
                        </TableHead>
                        <TableHead scope="col" className="w-28 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                aria-label={`${inventoryTerms.inventoryFlowDifference}: ${inventoryFlowDifferenceHelp}`}
                                className="inline-flex cursor-help outline-none"
                              >
                                {inventoryTerms.inventoryFlowDifference}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-64 leading-relaxed"
                            >
                              {inventoryFlowDifferenceHelp}
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead scope="col" className="w-56">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                aria-label={`${inventoryTerms.statusAndAdjustment}: ${inventoryTerms.statusAndAdjustmentHelp}`}
                                className="inline-flex cursor-help outline-none"
                              >
                                {inventoryTerms.statusAndAdjustment}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-64 leading-relaxed"
                            >
                              {inventoryTerms.statusAndAdjustmentHelp}
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{renderRows(tab)}</TableBody>
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
