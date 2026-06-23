import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { InventoryStepClient } from "~/features/inventory/components/inventory-step-client";
import { getInventoryStepData } from "~/features/inventory/queries";
import {
  getStoreManagerLedgerEditWorkspace,
  normalizeStoreIdParam,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { getKstBusinessDateParam } from "~/features/ledger/queries";
import { isTodayKstDateParam } from "~/features/ledger/date";

type InventoryEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
  }>;
};

type InventoryContentProps = {
  storeName: string;
  initialData: Awaited<ReturnType<typeof getInventoryStepData>>;
};

function InventoryContent({ storeName, initialData }: InventoryContentProps) {
  return (
    <InventoryStepClient storeName={storeName} initialData={initialData} />
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

export default async function InventoryEntryPage({
  searchParams,
}: InventoryEntryPageProps) {
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
    const initialData = await getInventoryStepData(
      store.id,
      closingDate,
      user.id,
    );

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <InventoryContent storeName={store.name} initialData={initialData} />
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
      <InventoryContent
        storeName={workspace.store.name}
        initialData={await getInventoryStepData(
          workspace.store.id,
          closingDate,
          workspace.user.id,
        )}
      />
    </StoreManagerShell>
  );
}
