import { redirect } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";

import { PageHeader } from "~/components/page-header";
import { NoActiveStoreMessage } from "~/components/store-manager-panels";
import { StoreManagerShell } from "~/components/store-manager-shell";
import {
  getStoreManagerWorkspace,
  normalizeStoreIdParam,
  requireStoreAccess,
} from "~/server/authz";

type StoreEntryPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
  }>;
};

function formatToday() {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function StoreEntryContent({ storeName }: { storeName: string }) {
  return (
    <>
      <PageHeader
        title="오늘 장부 시작"
        description="오늘 지점 업무를 시작하기 전 상태를 확인합니다."
      />
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border bg-card p-5 text-card-foreground">
          <div className="flex items-start gap-3">
            <CalendarDaysIcon className="mt-0.5 size-5 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{formatToday()}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal">{storeName}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                오늘 장부는 아직 시작 전입니다.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 text-card-foreground">
          <h2 className="text-base font-semibold">업무 진입</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            장부, 재고, 손실 입력 기능은 다음 스토리에서 저장 흐름과 연결됩니다.
          </p>
        </div>
      </section>
    </>
  );
}

export default async function StoreEntryPage({ searchParams }: StoreEntryPageProps) {
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
        <StoreEntryContent storeName={store.name} />
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
      <StoreEntryContent storeName={workspace.store.name} />
    </StoreManagerShell>
  );
}
