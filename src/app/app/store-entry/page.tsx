import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { getActiveLedgerInputCodeOptions } from "~/features/master-data/code-queries";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import {
  getStoreManagerLedgerEditWorkspace,
  normalizeStoreIdParam,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import {
  getKstBusinessDateParam,
  getStoreLedger,
} from "~/features/ledger/queries";
import { isTodayKstDateParam } from "~/features/ledger/date";
import { getStoreManagerLedgerReviewStepData } from "~/features/ledger/review-queries";
import { CorrectionReadonlySummary } from "~/features/corrections/components/correction-readonly-summary";
import { getStoreReadableCorrectionRecordsForLedger } from "~/features/corrections/queries";
import type { CorrectionRecordListItem } from "~/features/corrections/types";
import { SalesPaymentStepClient } from "~/features/ledger/components/sales-payment-step-client";
import { ExpenseStepClient } from "~/features/ledger/components/expense-step-client";
import { InputCodeAliasEditor } from "~/features/master-data/components/input-code-alias-editor";
import { PurchaseStepClient } from "~/features/ledger/components/purchase-step-client";
import { WorkStepClient } from "~/features/ledger/components/workstep-client";
import { getActiveEmployeeOptions } from "~/features/labor/employees-queries";
import { ReviewSummaryClient } from "~/features/ledger/components/review-summary-client";

export const dynamic = "force-dynamic";

type StoreEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
    step?: string | string[];
  }>;
};

type StoreEntryStep = "sales" | "cost" | "purchase" | "work" | "review";
type LedgerReviewData = Awaited<
  ReturnType<typeof getStoreManagerLedgerReviewStepData>
>;
type LedgerInputCodeOption = Awaited<
  ReturnType<typeof getActiveLedgerInputCodeOptions>
>[number];
type ProductOption = Awaited<
  ReturnType<typeof getActiveProductOptions>
>[number];
type EmployeeOption = Awaited<
  ReturnType<typeof getActiveEmployeeOptions>
>[number];

function normalizeStoreEntryStep(
  value: string | string[] | undefined,
): StoreEntryStep {
  const step = Array.isArray(value) ? value[0] : value;

  if (
    step === "cost" ||
    step === "purchase" ||
    step === "work" ||
    step === "review" ||
    step === "sales"
  ) {
    return step;
  }

  // 지점 장부 기본 진입 화면을 1단계 매입으로 맞춘다(단계 순서 변경 2026-07-02).
  return "purchase";
}

function normalizeClosingDateParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return null;
  }

  try {
    return getKstBusinessDateParam(value ?? new Date());
  } catch {
    return null;
  }
}

type StoreEntryContentProps = {
  storeName: string;
  initialLedger: Awaited<ReturnType<typeof getStoreLedger>>;
  reviewData: LedgerReviewData | null;
  correctionRecords: CorrectionRecordListItem[];
  step: StoreEntryStep;
  expenseCodeOptions: LedgerInputCodeOption[];
  productOptions: ProductOption[];
  employeeOptions: EmployeeOption[];
};

function StoreEntryContent({
  storeName,
  initialLedger,
  reviewData,
  correctionRecords,
  step,
  expenseCodeOptions,
  productOptions,
  employeeOptions,
}: StoreEntryContentProps) {
  let content;

  if (step === "review") {
    if (!reviewData) {
      throw new Error("Review data is required for the review step.");
    }

    content = (
      <ReviewSummaryClient storeName={storeName} reviewData={reviewData} />
    );
  } else if (step === "cost") {
    content = (
      <div className="flex flex-col gap-4">
        <ExpenseStepClient
          initialLedger={initialLedger}
          expenseCodeOptions={expenseCodeOptions}
          storeName={storeName}
          currentStep={step}
        />
        <InputCodeAliasEditor
          storeId={initialLedger.storeId}
          groupKey="expenseItem"
          options={expenseCodeOptions.map((option) => ({
            id: option.id,
            name: option.name,
          }))}
        />
      </div>
    );
  } else if (step === "purchase") {
    content = (
      <PurchaseStepClient
        initialLedger={initialLedger}
        productOptions={productOptions}
        storeName={storeName}
        currentStep={step}
      />
    );
  } else if (step === "work") {
    content = (
      <WorkStepClient
        initialLedger={initialLedger}
        storeName={storeName}
        currentStep={step}
        employeeOptions={employeeOptions}
      />
    );
  } else {
    content = (
      <SalesPaymentStepClient
        initialLedger={initialLedger}
        storeName={storeName}
        currentStep={step}
      />
    );
  }

  return (
    <>
      {initialLedger.status === "HEADQUARTERS_CLOSED" ? (
        <CorrectionReadonlySummary records={correctionRecords} />
      ) : null}
      {content}
    </>
  );
}

export default async function StoreEntryPage({
  searchParams,
}: StoreEntryPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const closingDate = normalizeClosingDateParam(params.date);
  const step = normalizeStoreEntryStep(params.step);

  if ((params.storeId !== undefined && !storeId) || !closingDate) {
    redirect("/app/unauthorized");
  }

  if (closingDate && !isTodayKstDateParam(closingDate)) {
    redirect("/app/unauthorized");
  }

  if (storeId) {
    const { user, store } = await requireStoreManagerLedgerEditAccess(storeId);
    // WO-09: 지점장 화면이므로 비용 항목 표시명에 지점별 alias를 적용한다.
    const expenseCodeOptions = await getActiveLedgerInputCodeOptions(
      "EXPENSE_ITEM",
      store.id,
    );
    const [productOptions, employeeOptions] = await Promise.all([
      getActiveProductOptions(),
      getActiveEmployeeOptions(),
    ]);
    const [initialLedger, reviewData] = await Promise.all([
      getStoreLedger(store.id, closingDate, user.id),
      step === "review"
        ? getStoreManagerLedgerReviewStepData(store.id, closingDate, user.id)
        : Promise.resolve(null),
    ]);
    const correctionRecords =
      initialLedger.status === "HEADQUARTERS_CLOSED"
        ? await getStoreReadableCorrectionRecordsForLedger(
            initialLedger.id,
            store.id,
          )
        : [];

    if (
      initialLedger.status === "IN_PROGRESS" &&
      (step === "cost" ||
        step === "work" ||
        step === "sales" ||
        step === "review") &&
      initialLedger.stepCompletion.inventory !== true
    ) {
      const query = new URLSearchParams({
        storeId: store.id,
        date: closingDate,
        reason: "inventory-plan-incomplete",
      });
      redirect(`/app/store-entry/inventory?${query.toString()}`);
    }

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <StoreEntryContent
          storeName={store.name}
          initialLedger={initialLedger}
          reviewData={reviewData}
          correctionRecords={correctionRecords}
          step={step}
          expenseCodeOptions={expenseCodeOptions}
          productOptions={productOptions}
          employeeOptions={employeeOptions}
        />
      </StoreManagerShell>
    );
  }

  const workspace = await getStoreManagerLedgerEditWorkspace();

  if (workspace.status === "headquarters") {
    redirect("/app/dashboard");
  }

  if (workspace.status === "no-active-store") {
    return (
      <StoreManagerShell userName={workspace.user.name ?? "지점장"}>
        <NoActiveStoreMessage />
      </StoreManagerShell>
    );
  }

  // WO-09: 지점장 활성 지점 화면에서도 비용 항목 표시명에 지점별 alias를 적용한다.
  const expenseCodeOptions = await getActiveLedgerInputCodeOptions(
    "EXPENSE_ITEM",
    workspace.store.id,
  );
  const [productOptions, employeeOptions] = await Promise.all([
    getActiveProductOptions(),
    getActiveEmployeeOptions(),
  ]);
  const initialLedger = await getStoreLedger(
    workspace.store.id,
    closingDate,
    workspace.user.id,
  );
  const reviewData =
    step === "review"
      ? await getStoreManagerLedgerReviewStepData(
          workspace.store.id,
          closingDate,
          workspace.user.id,
        )
      : null;
  const correctionRecords =
    initialLedger.status === "HEADQUARTERS_CLOSED"
      ? await getStoreReadableCorrectionRecordsForLedger(
          initialLedger.id,
          workspace.store.id,
        )
      : [];

  return (
    <StoreManagerShell
      userName={workspace.user.name ?? "지점장"}
      storeName={workspace.store.name}
      storeId={workspace.store.id}
    >
      <StoreEntryContent
        storeName={workspace.store.name}
        initialLedger={initialLedger}
        reviewData={reviewData}
        correctionRecords={correctionRecords}
        step={step}
        expenseCodeOptions={expenseCodeOptions}
        productOptions={productOptions}
        employeeOptions={employeeOptions}
      />
    </StoreManagerShell>
  );
}
