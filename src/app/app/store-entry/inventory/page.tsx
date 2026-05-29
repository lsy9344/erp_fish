import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { InventoryStepClient } from "~/features/inventory/components/inventory-step-client";
import { getInventoryStepData } from "~/features/inventory/queries";
import {
  getStoreManagerWorkspace,
  normalizeStoreIdParam,
  requireStoreAccess,
} from "~/server/authz";

type InventoryEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
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

export default async function InventoryEntryPage({
  searchParams,
}: InventoryEntryPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);

  if (params.storeId !== undefined && !storeId) {
    redirect("/app/unauthorized");
  }

  if (storeId) {
    const { user, store } = await requireStoreAccess(storeId);
    const initialData = await getInventoryStepData(store.id, user.id);

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
          workspace.user.id,
        )}
      />
    </StoreManagerShell>
  );
}
