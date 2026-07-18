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
import { Field, FieldLabel } from "~/components/ui/field";
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
import {
  formatKrwInput,
  toRawKrwInputValue,
} from "~/features/ledger/components/krw-input-format";
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
import {
  describeAdjustmentReason,
  missingAdjustmentReasonMessage,
} from "~/features/inventory/adjustment-save-guard";
import {
  getInventoryQuantityRelation,
  isManualFirstInventoryEntry,
} from "~/features/inventory/inventory-persist-policy";
import {
  mapInventorySaveErrors,
  type InventoryErrorFocusTarget,
} from "~/features/inventory/inventory-save-errors";
import {
  type InventoryAdjustmentView,
  type InventoryManualProductOption,
  type InventoryStepData,
  type InventoryStepLine,
  type StoreManagerInventoryStepData,
} from "~/features/inventory/types";
import { type ActionResult, type FieldErrors } from "~/lib/action-result";
import {
  parseStockQuantityDraft,
  toStockQuantitySaveInput,
} from "~/lib/decimal";
import { formatQuantityValue } from "~/lib/format";
import { cn } from "~/lib/utils";

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
  manualUnitPriceInput: string;
  adjustmentReasonInput: string;
};

const categories = ["전체", "냉동", "생물"] as const;
const MAX_INVENTORY_QUANTITY = 9_999_999_999.99;
const ROW_PAGING_THRESHOLD = 30;
const ROW_PAGE_SIZE = 50;
const carryoverLoadedMessage =
  "전일 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요.";
const carryoverManualMessage =
  "전날 재고를 자동으로 가져오지 못했습니다. 실제 재고를 확인해 입력해 주세요.";

function formatKrw(value: number | null) {
  if (value === null) {
    return "계산 불가";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function isValidQuantity(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_INVENTORY_QUANTITY &&
    hasAtMostTwoDecimals(value)
  );
}

function parseQuantityInput(
  value: string,
  storedQuantity: number | null | undefined = null,
) {
  const parsed = parseStockQuantityDraft(value, storedQuantity);

  return parsed !== null && isValidQuantity(parsed)
    ? roundQuantity(parsed)
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

// 당일 매입/손실이 있는 품목은 판매량(전일+매입-당일재고)이 잡히므로, 당일재고를
// 사용자가 직접 확인/입력해야 한다. 아직 저장된 적 없는 seed 행(id===productId)은
// 전일재고가 디폴트로 들어오는데, 매입 품목은 그 값이 0이라 화면에 "0"으로 보여
// "전량 판매"로 오해되기 쉽다. 이런 행은 입력란을 빈칸으로 시작해 직접 입력을 요구한다.
function requiresCurrentQuantityEntry(
  item: InventoryDisplayData["items"][number],
) {
  return (
    item.id === item.productId &&
    (item.purchasedQuantity > 0 || item.lossQuantity > 0)
  );
}

function toLineState(data: InventoryDisplayData): InventoryLineState[] {
  return data.items.map((item) => ({
    ...item,
    currentQuantityInput:
      item.currentQuantity === null || requiresCurrentQuantityEntry(item)
        ? ""
        : String(item.currentQuantity),
    manualUnitPriceInput: "",
    adjustmentReasonInput: item.adjustment?.reason ?? "",
  }));
}

// "품목 추가"로 직접 넣은 행. 근거가 없으므로 전일/매입/손실은 0, 상태는 이월 공백,
// 입력값은 빈 값으로 시작한다(0개 재고처럼 보이지 않게). id=productId로 두어 저장
// 정책(shouldPersistInventoryLine)이 미입력 행을 건너뛰게 한다. 저장 액션은
// before.items에 없는 이 행을 입력값이 있을 때만 별도로 기록한다.
function toManualLineState(
  option: InventoryManualProductOption,
): InventoryLineState {
  return {
    id: option.productId,
    productId: option.productId,
    productName: option.productName,
    productCategory: option.productCategory,
    productSpec: option.productSpec,
    purchasePrice: option.purchasePrice,
    unitPrice: 0,
    previousQuantity: 0,
    purchasedQuantity: 0,
    purchaseAmount: 0,
    lossQuantity: 0,
    lossAmount: 0,
    currentQuantity: null,
    quantity: null,
    inventoryAmount: null,
    fifoLots: [],
    carryoverSource: "MANUAL",
    carryoverStatus: "CARRYOVER_EMPTY",
    carryoverLedgerId: null,
    previousQuantityDetail: {
      source: "MANUAL",
      status: "CARRYOVER_EMPTY",
      resolvedQuantity: 0,
      sourceLedgerId: null,
      sourceLedgerClosingDate: null,
      sourceLedgerStatus: null,
      sourceYearMonth: null,
      sourceSnapshotId: null,
      sourcePreviousQuantity: null,
      sourcePurchasedQuantity: null,
      sourceLossQuantity: null,
      sourceCurrentQuantity: null,
      sourceQuantity: null,
      message:
        "직접 추가한 품목입니다. 전일/매입/손실 근거가 없으니 실제 재고를 입력해 주세요.",
      history: [],
    },
    isModified: false,
    adjustment: null,
    currentQuantityInput: "",
    manualUnitPriceInput: "",
    adjustmentReasonInput: "",
  };
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
  if (value === "전체") return "전체";
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
  hqEditReasonRequired = false,
}: InventoryStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const manualProductSelectRef = useRef<HTMLSelectElement>(null);
  const currentQuantityRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const manualUnitPriceRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const reasonRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingFocusTargetRef = useRef<InventoryErrorFocusTarget | null>(null);
  const pendingFocusOriginRef = useRef<Element | null>(null);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [hqEditReason, setHqEditReason] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<(typeof categories)[number]>("전체");
  const [pageByCategory, setPageByCategory] = useState<
    Record<(typeof categories)[number], number>
  >({
    전체: 1,
    냉동: 1,
    생물: 1,
  });
  const [selectedCarryoverItem, setSelectedCarryoverItem] =
    useState<InventoryLineState | null>(null);
  // WO-11(2026-06-28): 상단 "전날 재고 보기" 전체 목록 모달.
  const [isPreviousStockOpen, setIsPreviousStockOpen] = useState(false);
  // 직접 추가했지만 아직 저장하지 않은 행. 상태 배지를 "이월 공백" 대신 "직접 입력"으로
  // 보여줘 0개 재고로 오해하지 않게 한다. 저장 후에는 실제 저장 행이 되므로 비운다.
  const [addedManualIds, setAddedManualIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
  // 지금 편집 중인 행. 카드가 모두 비슷해 포커스가 어디로 갔는지 헷갈리던
  // 문제를 해결하려고 활성 행에 강한 강조(ring/배경)를 준다.
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
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
  const nextStepHref = `/app/store-entry?${new URLSearchParams({
    storeId: data.storeId,
    date: getKstLedgerDateParam(data.closingDate),
    step: "cost",
  }).toString()}`;
  const isAdjustmentSavePending = savingAdjustmentProductId !== null;
  // Contract: disabled={isClosed || savingAdjustmentProductId !== null}
  // WO-03(2026-06-28): 미입력 필수 수량은 "사용자가 값을 바꾼 상태(dirty)"가 아니라
  // "저장 전에 막아야 하는 validation 상태"다. 둘을 분리한다. 예전엔 이걸 dirty에 섞어
  // 진입 직후(아무것도 안 바꾼 화면)에도 미저장 경고가 떴다(false positive).
  // 필수 수량 미입력은 saveCurrentDraft의 validateRequiredCurrentQuantities로 막고,
  // "다음 단계로" 버튼은 저장 성공 후에만 보이므로 그 경로에서도 이미 검증을 통과한다.
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

  function getCategoryItems(category: string) {
    if (category === "전체") {
      return items;
    }
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

  function focusInventoryError(target?: InventoryErrorFocusTarget) {
    if (!target) {
      return;
    }

    const item = items.find(
      (candidate) => candidate.productId === target.productId,
    );

    if (!item) {
      return;
    }

    const category = normalizeCategory(item.productCategory);
    const categoryIndex = getCategoryItems(category).findIndex(
      (candidate) => candidate.productId === target.productId,
    );
    setActiveCategory(category);
    setCategoryPage(
      category,
      Math.floor(Math.max(0, categoryIndex) / ROW_PAGE_SIZE) + 1,
    );
    pendingFocusTargetRef.current = target;
    pendingFocusOriginRef.current = document.activeElement;
  }

  useEffect(() => {
    const target = pendingFocusTargetRef.current;

    if (!target || isSaving) {
      return;
    }

    const refs =
      target.field === "reason"
        ? reasonRefs
        : target.field === "unitPrice"
          ? manualUnitPriceRefs
          : currentQuantityRefs;
    const input = refs.current[target.productId];
    const activeElement = document.activeElement;

    if (
      input &&
      !input.disabled &&
      (activeElement === document.body ||
        activeElement === pendingFocusOriginRef.current ||
        activeElement === input)
    ) {
      input.focus();
    }

    window.setTimeout(() => {
      const currentInput = refs.current[target.productId];
      const activeElement = document.activeElement;

      if (pendingFocusTargetRef.current === target) {
        if (
          currentInput &&
          !currentInput.disabled &&
          (activeElement === document.body ||
            activeElement === pendingFocusOriginRef.current ||
            activeElement === input)
        ) {
          currentInput.focus();
        }

        pendingFocusTargetRef.current = null;
        pendingFocusOriginRef.current = null;
      }
    }, 250);
  }, [activeCategory, adjustmentErrors, fieldErrors, isSaving, pageByCategory]);

  function focusFirstError(errors: FieldErrors) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;

      if (errors[`items.${index}.unitPrice`]?.length) {
        focusInventoryError({
          productId: item.productId,
          currentIndex: index,
          field: "unitPrice",
        });
        return;
      }

      if (
        errors[`items.${index}.currentQuantity`]?.length ||
        errors[`items.${index}.quantity`]?.length
      ) {
        focusInventoryError({
          productId: item.productId,
          currentIndex: index,
          field: "quantity",
        });
        return;
      }
    }

    if (errors.reason?.length) {
      window.setTimeout(() => {
        hqEditReasonInputRef.current?.focus();
      }, 0);
    }
  }

  // 매입/손실이 있어 판매량이 잡히는 품목은 당일재고를 직접 입력해야 한다. 빈칸으로 두면
  // (디폴트값 그대로 넘어가면) 판매량이 전일+매입으로 잡혀 "전량 판매"로 오해되므로,
  // 저장/다음단계로 넘어가기 전에 막는다.
  function validateRequiredCurrentQuantities() {
    const nextErrors: FieldErrors = {};
    let firstInvalidItem: InventoryLineState | null = null;

    items.forEach((item, index) => {
      if (!requiresCurrentQuantityEntry(item)) {
        return;
      }

      const raw =
        currentQuantityRefs.current[item.productId]?.value ??
        item.currentQuantityInput;

      if (raw.trim() !== "") {
        return;
      }

      nextErrors[`items.${index}.currentQuantity`] = [
        "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
      ];
      firstInvalidItem ??= item;
    });

    if (!firstInvalidItem) {
      return true;
    }

    const message =
      "당일재고를 입력하지 않은 매입·손실 품목이 있습니다. 남은 재고를 입력해 주세요.";
    setFieldErrors(nextErrors);
    setFormError(message);
    focusFirstError(nextErrors);
    toast.error(message);

    return false;
  }

  function validateInventorySaveAdjustments() {
    const nextErrors: Record<string, string> = {};
    let firstInvalidItem: InventoryLineState | null = null;

    for (const item of items) {
      // 직접 추가한 신규 행은 조정할 기준 재고가 없다(매입/이월 0). 차이를 "고친 이유"로
      // 막지 않고 일반 저장으로 처음 입력하게 둔다. 서버는 before.items에 없는 이 행을
      // buildManualInventoryRows로 직접 기록한다.
      if (addedManualIds.has(item.productId)) {
        continue;
      }

      if (isManualFirstInventoryEntry(item)) {
        continue;
      }

      const systemQuantity = getSystemQuantity(item);
      const currentQuantity = parseQuantityInput(
        currentQuantityRefs.current[item.productId]?.value ??
          item.currentQuantityInput,
        item.currentQuantity,
      );

      if (
        getInventoryQuantityRelation({ ...item, currentQuantity }) !==
        "OVERSTOCK"
      ) {
        continue;
      }

      // 행별 "고친 이유"가 입력돼 있으면 통과(일반 저장이 이 사유로 조정을 만든다).
      const reasonInput = (
        reasonRefs.current[item.productId]?.value ??
        item.adjustmentReasonInput ??
        ""
      ).trim();

      if (
        systemQuantity === null ||
        currentQuantity === null ||
        item.adjustment?.afterQuantity === currentQuantity ||
        reasonInput
      ) {
        continue;
      }

      // 왜 사유를 묻는지 숫자로 보여준다(손실 외 추가 차이 = 판매인지 재고 오차인지 사람만 앎).
      nextErrors[item.productId] = describeAdjustmentReason(
        systemQuantity,
        currentQuantity,
        item.lossQuantity,
      );
      firstInvalidItem ??= item;
    }

    if (!firstInvalidItem) {
      return true;
    }

    const firstSystemQuantity = getSystemQuantity(firstInvalidItem);
    const firstCurrentQuantity = parseQuantityInput(
      currentQuantityRefs.current[firstInvalidItem.productId]?.value ??
        firstInvalidItem.currentQuantityInput,
      firstInvalidItem.currentQuantity,
    );
    const firstMessage =
      firstSystemQuantity !== null && firstCurrentQuantity !== null
        ? describeAdjustmentReason(
            firstSystemQuantity,
            firstCurrentQuantity,
            firstInvalidItem.lossQuantity,
          )
        : missingAdjustmentReasonMessage;

    setAdjustmentErrors(nextErrors);
    setFormError(firstMessage);
    focusInventoryError({
      productId: firstInvalidItem.productId,
      currentIndex: items.findIndex(
        (item) => item.productId === firstInvalidItem.productId,
      ),
      field: "reason",
    });
    toast.error(firstMessage);

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
      const message = "재고를 고친 이유 저장이 끝난 뒤 다시 저장해 주세요.";
      setResultMessage(null);
      setFormError(message);
      toast.error(message);
      return false;
    }

    if (!validateRequiredCurrentQuantities()) {
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

    const submittedItems = items.map((item) => {
      const quantityInput = toStockQuantitySaveInput(
        currentQuantityRefs.current[item.productId]?.value ??
          item.currentQuantityInput,
        item.currentQuantity,
      );

      return {
        productId: item.productId,
        currentQuantity: quantityInput,
        quantity: quantityInput,
        unitPrice: addedManualIds.has(item.productId)
          ? toRawKrwInputValue(
              manualUnitPriceRefs.current[item.productId]?.value ??
                item.manualUnitPriceInput,
            )
          : null,
        adjustmentReason:
          reasonRefs.current[item.productId]?.value ??
          item.adjustmentReasonInput,
      };
    });
    const submittedProductIds = submittedItems.map((item) => item.productId);

    try {
      const result = await saveItemsAction({
        ledgerId: data.id,
        storeId: data.storeId,
        closingDate: getKstLedgerDateParam(data.closingDate),
        version: data.version,
        ledgerUpdatedAt: data.updatedAt,
        items: submittedItems,
        ...(hqEditReasonRequired ? { reason: hqEditReason } : {}),
      });

      if (!result.ok) {
        if (saveConflict.captureConflict(result)) {
          setFormError(result.error.message);
          toast.error(result.error.message);
          return false;
        }

        const mappedErrors = mapInventorySaveErrors(
          result.error.fieldErrors ?? {},
          submittedProductIds,
          items.map((item) => item.productId),
        );
        setFieldErrors(mappedErrors.fieldErrors);
        setAdjustmentErrors(mappedErrors.adjustmentErrors);
        setFormError(result.error.message);
        if (mappedErrors.firstFocusTarget) {
          focusInventoryError(mappedErrors.firstFocusTarget);
        } else {
          focusFirstError(mappedErrors.fieldErrors);
        }
        toast.error(result.error.message);
        return false;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      setAddedManualIds(new Set());
      pendingFocusTargetRef.current = null;
      pendingFocusOriginRef.current = null;
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
    pendingFocusTargetRef.current = null;
    pendingFocusOriginRef.current = null;
    setFieldErrors({});
    setFormError(null);
    setAdjustmentErrors({});
    const normalized = normalizeNumericInput(value);
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, currentQuantityInput: normalized }
          : item,
      ),
    );
  }

  function updateManualUnitPrice(productId: string, value: string) {
    pendingFocusTargetRef.current = null;
    pendingFocusOriginRef.current = null;
    setFieldErrors({});
    setFormError(null);
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, manualUnitPriceInput: formatKrwInput(value) }
          : item,
      ),
    );
  }

  const visibleProductIds = new Set(items.map((item) => item.productId));
  const availableManualOptions = data.manualProductOptions.filter(
    (option) => !visibleProductIds.has(option.productId),
  );

  function handleAddManualProduct() {
    const selectedProductId = manualProductSelectRef.current?.value ?? "";
    const option = availableManualOptions.find(
      (candidate) => candidate.productId === selectedProductId,
    );

    if (!option) {
      setResultMessage(null);
      setFormError("추가할 품목을 선택해 주세요.");
      return;
    }

    const line = toManualLineState(option);

    setItems((current) => [...current, line]);
    setAddedManualIds((current) => new Set(current).add(option.productId));
    if (manualProductSelectRef.current) {
      manualProductSelectRef.current.value = "";
    }
    setActiveCategory(normalizeCategory(option.productCategory));
    setResultMessage(null);
    window.setTimeout(() => {
      currentQuantityRefs.current[option.productId]?.focus();
    }, 0);
  }

  function updateAdjustmentReason(productId: string, value: string) {
    pendingFocusTargetRef.current = null;
    pendingFocusOriginRef.current = null;
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
    const quantity = roundQuantity(
      item.previousQuantity + item.purchasedQuantity - item.lossQuantity,
    );

    return isValidQuantity(quantity) ? quantity : null;
  }

  function formatSignedQuantity(value: number) {
    const prefix = value > 0 ? "+" : "";

    return `${prefix}${formatQuantityValue(value)}`;
  }

  function isAdjustmentNeeded(item: InventoryLineState) {
    // 직접 추가한 신규 행은 기준 재고(0)와의 차이를 "조정"으로 보지 않는다. 첫 입력이므로
    // 일반 저장으로 기록한다.
    if (addedManualIds.has(item.productId)) {
      return false;
    }

    if (isManualFirstInventoryEntry(item)) {
      return false;
    }

    const systemQuantity = getSystemQuantity(item);
    const actualQuantity = parseQuantityInput(
      item.currentQuantityInput,
      item.currentQuantity,
    );

    return (
      systemQuantity !== null &&
      getInventoryQuantityRelation({
        ...item,
        currentQuantity: actualQuantity,
      }) === "OVERSTOCK"
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
      setResultMessage("고친 내용이 저장됐습니다.");
      toast.success("재고를 고친 이유를 저장했습니다.");
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingAdjustmentProductId(null);
    }
  }

  function isLineModified(item: InventoryLineState) {
    const currentQuantity = parseQuantityInput(
      item.currentQuantityInput,
      item.currentQuantity,
    );

    return (
      currentQuantity !== null && currentQuantity !== item.previousQuantity
    );
  }

  function formatQuantity(value: number | null) {
    if (value === null) {
      return "계산 불가";
    }

    return `${formatQuantityValue(value)}개`;
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
    const actualQuantity = parseQuantityInput(
      item.currentQuantityInput,
      item.currentQuantity,
    );

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
      return formatSignedQuantity(value);
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
        return "전날 재고 확인";
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

    // 직접 추가했지만 미저장인 행은 "이월 공백"(0 오해) 대신 "직접 입력·근거 없음"으로
    // 표시한다. 추가 후보는 당일 매입/손실이 없는 품목뿐이라 다른 배지는 붙지 않는다.
    if (
      addedManualIds.has(item.productId) ||
      isManualFirstInventoryEntry(item)
    ) {
      badges.push({
        label: "직접 입력",
        detail:
          "직접 추가한 품목입니다. 전일/매입/손실 근거가 없으니 실제 재고를 직접 입력해 주세요. 입력 전에는 저장되지 않습니다.",
        className:
          "border-slate-500 text-slate-700 dark:border-slate-400 dark:text-slate-300",
      });

      return badges;
    }

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
          label: "전날 재고 확인",
          detail:
            "전날 남은 재고 기록이 없어 0으로 표시됩니다. 실제 재고가 있으면 수량을 직접 입력해 주세요.",
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
            "30%단가 같은 정책 미정 항목은 이 화면에서 계산하지 않습니다. 재고 근거는 선입선출(FIFO) 기준으로 추적합니다.",
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
        detail: `1단계 매입에 저장된 수량입니다. 매입 ${formatQuantity(item.purchasedQuantity)}.`,
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

  const dailySalesQuantityHelp = inventoryTerms.dailySalesQuantityHelp;

  // WO-11(2026-06-28): 전날 재고 전체 보기. 품목명/규격/수량/FIFO 기준일/전일 장부
  // 상태만 보여준다. 금액·단가·원가·마진·FIFO 금액은 노출하지 않는다(지점장 민감값 차단).
  function renderPreviousStockDialog() {
    return (
      <Dialog open={isPreviousStockOpen} onOpenChange={setIsPreviousStockOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>전날 재고 보기</DialogTitle>
            <DialogDescription>
              전날 기준 재고 수량입니다. 금액·단가는 표시하지 않으며, 전날
              장부는 여기서 수정할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {items.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              전날 재고 항목이 없습니다.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>품목</TableHead>
                    <TableHead>규격</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead>FIFO 기준일</TableHead>
                    <TableHead>전일 장부</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell>{item.productSpec || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(item.previousQuantity)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatCarryoverBasisDate(item.previousQuantityDetail)}
                      </TableCell>
                      <TableCell>
                        {formatLedgerStatus(
                          item.previousQuantityDetail.sourceLedgerStatus,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

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
          <TableCell className="text-muted-foreground h-24 text-center">
            표시할 품목이 없습니다.
          </TableCell>
        </TableRow>
      );
    }

    const pageOffset =
      visibleItems.length > ROW_PAGING_THRESHOLD
        ? (page - 1) * ROW_PAGE_SIZE
        : 0;

    return pagedItems.map((item, pagedIndex) => {
      const rowNumber = pageOffset + pagedIndex + 1;
      const globalIndex = items.findIndex(
        (candidate) => candidate.productId === item.productId,
      );
      const quantityError =
        fieldErrors[`items.${globalIndex}.currentQuantity`]?.[0];
      const unitPriceError = fieldErrors[`items.${globalIndex}.unitPrice`]?.[0];
      const modified = isLineModified(item) || item.isModified;
      const adjusted = Boolean(item.adjustment);
      const adjustmentNeeded = !adjusted && isAdjustmentNeeded(item);
      const systemQuantity = getSystemQuantity(item);
      const quantityDifference = getQuantityDifference(item);
      const reasonError = adjustmentErrors[item.productId];
      const isSavingThisAdjustment =
        savingAdjustmentProductId === item.productId;
      const sourceBadges = getSourceBadges(item);
      const adjustmentActionLabel = adjusted ? "수정" : "저장";
      const adjustmentButtonLabel = `${item.productName} 고친 이유 저장`;
      const adjustmentAmountPolicyUnconfirmed =
        item.adjustment?.amountStatus === "POLICY_UNCONFIRMED";

      // 카드형 레이아웃: 품목당 1행(<tr>)을 유지하되 셀 1개 안에 카드를 그린다.
      // 한 화면에서 입력·조정 버튼이 가로 스크롤 없이 바로 보이고, 조정 상세는
      // 펼침(details)으로 빼서 셀 내용이 바뀌어도 행이 늘어나지 않게 한다.
      return (
        <TableRow
          key={item.productId}
          aria-label={`${item.productName} 재고 행${modified ? ", 수정됨" : ""}${adjusted ? ", 고침 완료" : ""}`}
          data-focused={focusedProductId === item.productId || undefined}
          className={cn(
            "transition-colors",
            (modified || adjusted) && "border-primary bg-primary/5 border-l-4",
            // 편집 중인 행: 강한 ring + 배경으로 "지금 이 행"임을 분명히 한다.
            // 모든 카드가 비슷해 포커스 이동 시 어디로 갔는지 헷갈리던 문제 해결.
            focusedProductId === item.productId &&
              "ring-primary bg-primary/10 relative z-10 rounded-sm shadow-sm ring-2 ring-inset",
          )}
        >
          <TableCell className="p-3 align-top whitespace-normal">
            <div className="flex flex-col gap-2.5">
              {/* 1줄: 행 번호 + 품목명 + 규격 + 상태 뱃지 */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  aria-hidden
                  className="text-muted-foreground bg-muted inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-xs font-medium tabular-nums"
                >
                  {rowNumber}
                </span>
                <span className="font-medium break-keep">
                  {item.productName}
                </span>
                {item.productSpec ? (
                  <span className="text-muted-foreground text-xs">
                    {item.productSpec}
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {modified ? (
                    <Badge
                      variant="outline"
                      className="border-primary text-primary text-[10px]"
                    >
                      수정됨
                    </Badge>
                  ) : null}
                  {adjustmentNeeded && systemQuantity !== null
                    ? renderBadgeWithTooltip({
                        label: "고칠 내용 있음",
                        detail: describeAdjustmentReason(
                          systemQuantity,
                          parseQuantityInput(
                            item.currentQuantityInput,
                            item.currentQuantity,
                          ) ?? systemQuantity,
                          item.lossQuantity,
                        ),
                        className:
                          "border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300",
                      })
                    : null}
                  {adjusted
                    ? renderBadgeWithTooltip({
                        label: "고침 완료",
                        detail: item.adjustment
                          ? `바꾼 이유가 저장됐습니다. 바뀐 수량 ${formatSignedQuantity(item.adjustment.differenceQuantity)}.`
                          : "바꾼 이유가 저장됐습니다.",
                        className:
                          "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
                      })
                    : null}
                  {sourceBadges.map(renderBadgeWithTooltip)}
                </div>
              </div>

              <p className="text-muted-foreground text-xs tabular-nums">
                {item.purchasePrice
                  ? `${item.purchasePrice.kind === "TODAY" ? "당일" : "최근"} 매입단가 · ${item.purchasePrice.businessDate} · ${formatKrw(item.purchasePrice.unitPrice)}/1박스`
                  : "매입 이력 없음"}
              </p>

              {/* 2줄: 전일→기준 흐름 요약 (한 줄, 행 높이 고정) */}
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                <span>
                  {inventoryTerms.previousStock}{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    aria-label={`${item.productName} 전일재고 이력 보기`}
                    onClick={() => setSelectedCarryoverItem(item)}
                    className="text-foreground h-auto p-0 align-baseline font-medium tabular-nums"
                  >
                    {formatQuantityValue(item.previousQuantity)}
                  </Button>
                </span>
                <span>
                  {inventoryTerms.purchase}{" "}
                  <span className="text-foreground font-medium">
                    {formatQuantityValue(item.purchasedQuantity)}
                  </span>
                </span>
                <span>
                  {inventoryTerms.loss}{" "}
                  <span className="text-foreground font-medium">
                    {formatQuantityValue(item.lossQuantity)}
                  </span>
                  {hasSensitiveInventoryAmounts(item) && item.lossQuantity > 0
                    ? ` (${formatKrw(item.lossAmount)})`
                    : ""}
                </span>
                <span aria-hidden>→</span>
                <span>
                  {inventoryTerms.baselineStock}{" "}
                  <span className="text-foreground font-medium">
                    {formatQuantity(systemQuantity)}
                  </span>
                </span>
              </div>

              {/* 3줄: 당일재고 입력 + 재고 차이 */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`inventory-quantity-${item.productId}`}
                    className="text-muted-foreground text-xs"
                  >
                    {inventoryTerms.currentStock}
                  </label>
                  <Input
                    id={`inventory-quantity-${item.productId}`}
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
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={
                      requiresCurrentQuantityEntry(item)
                        ? "입력 필요"
                        : undefined
                    }
                    value={item.currentQuantityInput}
                    onFocus={(event) => {
                      setFocusedProductId(item.productId);
                      // block: "nearest"는 입력칸이 화면 밖일 때만 스크롤한다.
                      // "center"는 이미 보이는 행도 화면 중앙으로 끌어와 "왜
                      // 움직였지?" 하는 혼란을 줬다.
                      event.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                    onBlur={() =>
                      setFocusedProductId((current) =>
                        current === item.productId ? null : current,
                      )
                    }
                    onChange={(event) =>
                      updateCurrentQuantity(
                        item.productId,
                        event.currentTarget.value,
                      )
                    }
                    disabled={isSaving || isClosed || isAdjustmentSavePending}
                    className="h-11 w-24 tabular-nums"
                  />
                </div>
                {addedManualIds.has(item.productId) ? (
                  <Field
                    data-invalid={Boolean(unitPriceError)}
                    className="w-auto gap-1"
                  >
                    <FieldLabel
                      htmlFor={`inventory-unit-price-${item.productId}`}
                    >
                      매입단가
                    </FieldLabel>
                    <Input
                      id={`inventory-unit-price-${item.productId}`}
                      ref={(node) => {
                        manualUnitPriceRefs.current[item.productId] = node;
                      }}
                      aria-label={`${item.productName} 매입단가`}
                      aria-invalid={Boolean(unitPriceError)}
                      aria-describedby={
                        unitPriceError
                          ? `inventory-unit-price-${item.productId}-error`
                          : undefined
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      value={item.manualUnitPriceInput}
                      onChange={(event) =>
                        updateManualUnitPrice(
                          item.productId,
                          event.currentTarget.value,
                        )
                      }
                      disabled={isSaving || isClosed || isAdjustmentSavePending}
                      className="h-11 w-32 tabular-nums"
                    />
                  </Field>
                ) : null}
                <div className="flex flex-col gap-1 pb-2.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        aria-label={`${inventoryTerms.dailySalesQuantity}: ${dailySalesQuantityHelp}`}
                        className="text-muted-foreground inline-flex w-fit cursor-help text-xs outline-none"
                      >
                        {inventoryTerms.dailySalesQuantity}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-64 leading-relaxed"
                    >
                      {dailySalesQuantityHelp}
                    </TooltipContent>
                  </Tooltip>
                  <span
                    className={
                      adjustmentNeeded
                        ? "text-destructive font-medium tabular-nums"
                        : "tabular-nums"
                    }
                  >
                    {formatDifference(quantityDifference)}
                  </span>
                </div>
              </div>
              {quantityError ? (
                <p
                  id={`inventory-quantity-${item.productId}-error`}
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {quantityError}
                </p>
              ) : null}
              {unitPriceError ? (
                <p
                  id={`inventory-unit-price-${item.productId}-error`}
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {unitPriceError}
                </p>
              ) : null}

              {/* 4줄: 조정 사유 입력 + 저장 버튼 (항상 보임, 가로 스크롤 불필요) */}
              {isClosed ? (
                <p className="text-muted-foreground text-xs">정정 기록 사용</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      ref={(node) => {
                        reasonRefs.current[item.productId] = node;
                      }}
                      aria-label={`${item.productName} ${inventoryTerms.adjustmentReasonAriaLabel}`}
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
                    {/* 정책 반전(2026-06-28): 단독 재고조정 저장 버튼은 본사 전용이다. 지점장은
                        사유만 입력하고 일반 저장을 누르면, 차이 행에 대해 서버가 그 사유로 조정을
                        만든다(applyInventoryAdjustmentReasonsInTx). 단독 조정 액션은 본사만. */}
                    {hqEditReasonRequired ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={adjustmentButtonLabel}
                        onClick={() => handleAdjustmentSave(item)}
                        disabled={
                          savingAdjustmentProductId !== null || isClosed
                        }
                        className="h-11 shrink-0 px-3 text-xs"
                      >
                        {isSavingThisAdjustment
                          ? "저장 중"
                          : adjustmentActionLabel}
                      </Button>
                    ) : null}
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

                  {/* 조정 상세는 펼침으로 분리해 행 높이를 늘리지 않는다.
                      e2e는 상세 텍스트가 보여야 하므로 open 기본값. */}
                  {adjusted && item.adjustment ? (
                    <details open className="text-muted-foreground text-xs">
                      <summary className="cursor-pointer select-none">
                        조정 상세
                      </summary>
                      <div className="mt-1 grid gap-0.5">
                        <p>
                          고치기 전{" "}
                          <span className="tabular-nums">
                            {item.adjustment.beforeQuantity}
                            {hasSensitiveAdjustmentAmounts(item.adjustment)
                              ? ` / ${formatKrw(item.adjustment.beforeAmount)}`
                              : ""}
                          </span>
                        </p>
                        <p>
                          고친 후{" "}
                          <span className="tabular-nums">
                            {item.adjustment.afterQuantity}
                            {hasSensitiveAdjustmentAmounts(item.adjustment)
                              ? ` / ${formatKrw(item.adjustment.afterAmount)}`
                              : ""}
                          </span>
                        </p>
                        <p>
                          바뀐 수량{" "}
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
                    </details>
                  ) : null}
                </div>
              )}
            </div>
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

  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {renderCarryoverDetailDialog()}
        {renderPreviousStockDialog()}
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
          stepLabel="3단계 재고"
          authorDisplayName={data.authorDisplayName}
          updatedAt={data.updatedAt}
          isSaving={isSaving || isAdjustmentSavePending}
          errorMessage={formError}
          successMessage={resultMessage}
          unsavedFields={["현재 재고", "바꾼 이유"]}
          onRetry={() => formRef.current?.requestSubmit()}
          retryDisabled={isSaving || isAdjustmentSavePending || isClosed}
        />

        {/* WO-11(2026-06-28): 상단 전날 재고 전체 보기 버튼. */}
        <div className="flex justify-end">
          <Button
            type="button"
            className="min-h-11 font-semibold"
            onClick={() => setIsPreviousStockOpen(true)}
          >
            전날 재고 보기
          </Button>
        </div>

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
          {!isClosed && availableManualOptions.length > 0 ? (
            <div className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <label
                  htmlFor="inventory-manual-product"
                  className="text-muted-foreground text-xs"
                >
                  품목 추가
                </label>
                <select
                  id="inventory-manual-product"
                  ref={manualProductSelectRef}
                  aria-label="추가할 품목 선택"
                  defaultValue=""
                  disabled={isSaving || isAdjustmentSavePending}
                  className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">근거 없는 품목 직접 추가</option>
                  {availableManualOptions.map((option) => (
                    <option key={option.productId} value={option.productId}>
                      {option.productName}
                      {option.productSpec ? ` / ${option.productSpec}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddManualProduct}
                disabled={isSaving || isAdjustmentSavePending}
                className="min-h-11 shrink-0"
              >
                추가
              </Button>
            </div>
          ) : null}

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
                <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
                  {/* 카드 리스트: 품목당 1행. 가로 스크롤이 사라져 입력·저장
                      버튼이 한 화면에 보이고, 셀 내용 변화로 칸 폭이 흔들리지
                      않는다(컬럼이 1개라 auto-layout 재계산 영향 없음). */}
                  <Table
                    aria-label="재고 품목"
                    className="[&_td]:border-b [&_tr:last-child_td]:border-0"
                  >
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
