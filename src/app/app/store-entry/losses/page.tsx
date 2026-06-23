import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { LossStepClient } from "~/features/losses/components/loss-step-client";
import { LossTypeAliasEditor } from "~/features/master-data/components/loss-type-alias-editor";
import { getLossStepData } from "~/features/losses/queries";
import { SalesPlanLossContext } from "~/features/sales-plan/components/sales-plan-loss-context";
import { getSalesPlanLossContext } from "~/features/sales-plan/queries";
import { type SalesPlanLossContextItem } from "~/features/sales-plan/types";
import {
  getStoreManagerLedgerEditWorkspace,
  normalizeStoreIdParam,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { getKstBusinessDateParam } from "~/features/ledger/queries";
import { isTodayKstDateParam } from "~/features/ledger/date";

type LossEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
  }>;
};

type LossContentProps = {
  storeName: string;
  initialData: Awaited<ReturnType<typeof getLossStepData>>;
  salesPlanContext: SalesPlanLossContextItem[];
};

function LossContent({
  storeName,
  initialData,
  salesPlanContext,
}: LossContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <SalesPlanLossContext items={salesPlanContext} />
      <LossStepClient storeName={storeName} initialData={initialData} />
      <LossTypeAliasEditor
        storeId={initialData.storeId}
        options={initialData.lossTypeOptions.map((option) => ({
          id: option.id,
          name: option.name,
        }))}
      />
    </div>
  );
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

export default async function LossEntryPage({
  searchParams,
}: LossEntryPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const closingDate = normalizeClosingDateParam(params.date);

  if ((params.storeId !== undefined && !storeId) || !closingDate) {
    redirect("/app/unauthorized");
  }

  if (closingDate && !isTodayKstDateParam(closingDate)) {
    redirect("/app/unauthorized");
  }

  if (storeId) {
    const { user, store } = await requireStoreManagerLedgerEditAccess(storeId);
    const [initialData, salesPlanContext] = await Promise.all([
      getLossStepData(store.id, closingDate, user.id),
      getSalesPlanLossContext(store.id, closingDate),
    ]);

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <LossContent
          storeName={store.name}
          initialData={initialData}
          salesPlanContext={salesPlanContext}
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

  const [workspaceLossData, workspaceSalesPlanContext] = await Promise.all([
    getLossStepData(workspace.store.id, closingDate, workspace.user.id),
    getSalesPlanLossContext(workspace.store.id, closingDate),
  ]);

  return (
    <StoreManagerShell
      userName={workspace.user.name ?? "지점장"}
      storeName={workspace.store.name}
      storeId={workspace.store.id}
    >
      <LossContent
        storeName={workspace.store.name}
        initialData={workspaceLossData}
        salesPlanContext={workspaceSalesPlanContext}
      />
    </StoreManagerShell>
  );
}
