import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { getActiveLedgerInputCodeOptions } from "~/features/master-data/code-queries";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import { getActivePurchaseStandardOptions } from "~/features/master-data/purchase-standard-queries";
import {
  getStoreManagerWorkspace,
  normalizeStoreIdParam,
  requireStoreAccess,
} from "~/server/authz";
import { getTodayStoreLedger } from "~/features/ledger/queries";
import { SalesPaymentStepClient } from "~/features/ledger/components/sales-payment-step-client";
import { ExpenseStepClient } from "~/features/ledger/components/expense-step-client";
import { PurchaseStepClient } from "~/features/ledger/components/purchase-step-client";
import { WorkStepClient } from "~/features/ledger/components/workstep-client";

type StoreEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    step?: string | string[];
  }>;
};

type StoreEntryStep = "sales" | "cost" | "purchase" | "work";
type LedgerInputCodeOption = Awaited<
  ReturnType<typeof getActiveLedgerInputCodeOptions>
>[number];
type ProductOption = Awaited<
  ReturnType<typeof getActiveProductOptions>
>[number];
type PurchaseStandardOption = Awaited<
  ReturnType<typeof getActivePurchaseStandardOptions>
>[number];

function normalizeStoreEntryStep(
  value: string | string[] | undefined,
): StoreEntryStep {
  const step = Array.isArray(value) ? value[0] : value;

  if (
    step === "cost" ||
    step === "purchase" ||
    step === "work" ||
    step === "sales"
  ) {
    return step;
  }

  return "sales";
}

type StoreEntryContentProps = {
  storeName: string;
  initialLedger: Awaited<ReturnType<typeof getTodayStoreLedger>>;
  step: StoreEntryStep;
  expenseCodeOptions: LedgerInputCodeOption[];
  productOptions: ProductOption[];
  purchaseStandardOptions: PurchaseStandardOption[];
};

function StoreEntryContent({
  storeName,
  initialLedger,
  step,
  expenseCodeOptions,
  productOptions,
  purchaseStandardOptions,
}: StoreEntryContentProps) {
  if (step === "cost") {
    return (
      <ExpenseStepClient
        initialLedger={initialLedger}
        expenseCodeOptions={expenseCodeOptions}
        storeName={storeName}
        currentStep={step}
      />
    );
  }

  if (step === "purchase") {
    return (
      <PurchaseStepClient
        initialLedger={initialLedger}
        productOptions={productOptions}
        purchaseStandardOptions={purchaseStandardOptions}
        storeName={storeName}
        currentStep={step}
      />
    );
  }

  if (step === "work") {
    return (
      <WorkStepClient
        initialLedger={initialLedger}
        storeName={storeName}
        currentStep={step}
      />
    );
  }

  return (
    <SalesPaymentStepClient
      initialLedger={initialLedger}
      storeName={storeName}
      currentStep={step}
    />
  );
}

export default async function StoreEntryPage({
  searchParams,
}: StoreEntryPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const step = normalizeStoreEntryStep(params.step);

  if (params.storeId !== undefined && !storeId) {
    redirect("/app/unauthorized");
  }

  if (storeId) {
    const { user, store } = await requireStoreAccess(storeId);
    const expenseCodeOptions =
      await getActiveLedgerInputCodeOptions("EXPENSE_ITEM");
    const [productOptions, purchaseStandardOptions] = await Promise.all([
      getActiveProductOptions(),
      getActivePurchaseStandardOptions(),
    ]);
    const initialLedger = await getTodayStoreLedger(store.id, user.id);

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <StoreEntryContent
          storeName={store.name}
          initialLedger={initialLedger}
          step={step}
          expenseCodeOptions={expenseCodeOptions}
          productOptions={productOptions}
          purchaseStandardOptions={purchaseStandardOptions}
        />
      </StoreManagerShell>
    );
  }

  const workspace = await getStoreManagerWorkspace();

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

  const expenseCodeOptions =
    await getActiveLedgerInputCodeOptions("EXPENSE_ITEM");
  const [productOptions, purchaseStandardOptions] = await Promise.all([
    getActiveProductOptions(),
    getActivePurchaseStandardOptions(),
  ]);

  return (
    <StoreManagerShell
      userName={workspace.user.name ?? "지점장"}
      storeName={workspace.store.name}
      storeId={workspace.store.id}
    >
      <StoreEntryContent
        storeName={workspace.store.name}
        initialLedger={await getTodayStoreLedger(
          workspace.store.id,
          workspace.user.id,
        )}
        step={step}
        expenseCodeOptions={expenseCodeOptions}
        productOptions={productOptions}
        purchaseStandardOptions={purchaseStandardOptions}
      />
    </StoreManagerShell>
  );
}
