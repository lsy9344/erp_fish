import { Suspense } from "react";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { ChangeHistoryClient } from "~/features/audit/components/change-history-client";
import {
  getAuditHistoryForHeadquarters,
  normalizeAuditHistoryFilters,
} from "~/features/audit/audit-queries";
import { requireSettingsAccess } from "~/server/authz";
import ChangeHistoryLoading from "./change-history-loading";

type ChangeHistoryPageProps = {
  searchParams: Promise<{
    targetType?: string | string[];
    actorId?: string | string[];
    from?: string | string[];
    to?: string | string[];
    cursor?: string | string[];
  }>;
};

// loading.tsx 경계는 같은 경로에서 쿼리만 바뀌면 재사용되어, 운영 빌드에서 필터 이동이
// 커밋되지 않는다(vercel/next.js#86151). 쿼리마다 새 Suspense 경계를 만든다.
export default async function ChangeHistoryPage({
  searchParams,
}: ChangeHistoryPageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ChangeHistoryLoading />}>
      <ChangeHistoryContent params={params} />
    </Suspense>
  );
}

async function ChangeHistoryContent({
  params,
}: {
  params: Awaited<ChangeHistoryPageProps["searchParams"]>;
}) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const filters = normalizeAuditHistoryFilters(params);
  const history = await getAuditHistoryForHeadquarters(filters);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="변경 이력"
        description="기준정보와 사용자 권한 변경 이력을 시간 역순으로 확인합니다."
      />
      <ChangeHistoryClient
        history={history.items}
        actorOptions={history.actorOptions}
        visibleTargetTypeOptions={history.visibleTargetTypeOptions}
        filters={history.filters}
        nextCursor={history.nextCursor}
      />
    </HeadquartersShell>
  );
}
