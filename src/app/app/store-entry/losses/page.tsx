import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { LossStepClient } from "~/features/losses/components/loss-step-client";
import { getLossStepData } from "~/features/losses/queries";
import {
  getStoreManagerLedgerEditWorkspace,
  normalizeStoreIdParam,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { getKstBusinessDateParam } from "~/features/ledger/queries";

type LossEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
  }>;
};

type LossContentProps = {
  storeName: string;
  initialData: Awaited<ReturnType<typeof getLossStepData>>;
};

function LossContent({ storeName, initialData }: LossContentProps) {
  return <LossStepClient storeName={storeName} initialData={initialData} />;
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

  if (storeId) {
    const { user, store } = await requireStoreManagerLedgerEditAccess(storeId);
    const initialData = await getLossStepData(store.id, closingDate, user.id);

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <LossContent storeName={store.name} initialData={initialData} />
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
      <LossContent
        storeName={workspace.store.name}
        initialData={await getLossStepData(
          workspace.store.id,
          closingDate,
          workspace.user.id,
        )}
      />
    </StoreManagerShell>
  );
}
