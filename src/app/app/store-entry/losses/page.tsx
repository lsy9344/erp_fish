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

type LossEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
  }>;
};

function LossContent({ storeName }: { storeName: string }) {
  return (
    <StorePreparationPanel
      title="손실 입력 준비"
      storeName={storeName}
      description="오늘 손실 입력을 시작할 지점을 확인합니다."
    />
  );
}

export default async function LossEntryPage({
  searchParams,
}: LossEntryPageProps) {
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
        <LossContent storeName={store.name} />
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
      <LossContent storeName={workspace.store.name} />
    </StoreManagerShell>
  );
}
