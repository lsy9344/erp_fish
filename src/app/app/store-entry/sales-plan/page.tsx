import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { SalesPricePlanClient } from "~/features/sales-plan/components/sales-price-plan-client";
import { getSalesPricePlanStepData } from "~/features/sales-plan/queries";
import {
  getStoreManagerLedgerEditWorkspace,
  normalizeStoreIdParam,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { getKstBusinessDateParam } from "~/features/ledger/queries";
import { isTodayKstDateParam } from "~/features/ledger/date";

type SalesPlanPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
  }>;
};

function normalizeBusinessDateParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return null;
  }

  try {
    return getKstBusinessDateParam(value ?? new Date());
  } catch {
    return null;
  }
}

export default async function SalesPlanPage({
  searchParams,
}: SalesPlanPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const businessDate = normalizeBusinessDateParam(params.date);

  if ((params.storeId !== undefined && !storeId) || !businessDate) {
    redirect("/app/unauthorized");
  }

  if (businessDate && !isTodayKstDateParam(businessDate)) {
    redirect("/app/unauthorized");
  }

  if (storeId) {
    const { user, store } = await requireStoreManagerLedgerEditAccess(storeId);
    const initialData = await getSalesPricePlanStepData(store.id, businessDate);

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <SalesPricePlanClient
          storeName={store.name}
          initialData={initialData}
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

  return (
    <StoreManagerShell
      userName={workspace.user.name ?? "지점장"}
      storeName={workspace.store.name}
      storeId={workspace.store.id}
    >
      <SalesPricePlanClient
        storeName={workspace.store.name}
        initialData={await getSalesPricePlanStepData(
          workspace.store.id,
          businessDate,
        )}
      />
    </StoreManagerShell>
  );
}
