import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { ChangeHistoryClient } from "~/features/audit/components/change-history-client";
import {
  getAuditHistoryForHeadquarters,
  normalizeAuditHistoryFilters,
} from "~/features/audit/audit-queries";
import { requireSettingsAccess } from "~/server/authz";

type ChangeHistoryPageProps = {
  searchParams: Promise<{
    targetType?: string | string[];
    actorId?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

export default async function ChangeHistoryPage({
  searchParams,
}: ChangeHistoryPageProps) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
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
        filters={history.filters}
      />
    </HeadquartersShell>
  );
}
