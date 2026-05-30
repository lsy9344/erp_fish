import { redirect } from "next/navigation";

import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import { LossStepClient } from "~/features/losses/components/loss-step-client";
import { getLossStepData } from "~/features/losses/queries";
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

type LossContentProps = {
  storeName: string;
  initialData: Awaited<ReturnType<typeof getLossStepData>>;
};

function LossContent({ storeName, initialData }: LossContentProps) {
  return <LossStepClient storeName={storeName} initialData={initialData} />;
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
    const initialData = await getLossStepData(store.id, user.id);

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
      <LossContent
        storeName={workspace.store.name}
        initialData={await getLossStepData(
          workspace.store.id,
          workspace.user.id,
        )}
      />
    </StoreManagerShell>
  );
}
