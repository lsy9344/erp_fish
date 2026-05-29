import { redirect } from "next/navigation";

import {
  NoActiveStoreMessage,
  StorePreparationPanel,
} from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
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

function InventoryContent({ storeName }: { storeName: string }) {
  return (
    <StorePreparationPanel
      title="재고 입력 준비"
      storeName={storeName}
      description="오늘 재고 입력을 시작할 지점을 확인합니다."
    />
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

    return (
      <StoreManagerShell
        userName={user.name ?? "지점장"}
        storeName={store.name}
        storeId={store.id}
      >
        <InventoryContent storeName={store.name} />
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
      <InventoryContent storeName={workspace.store.name} />
    </StoreManagerShell>
  );
}
