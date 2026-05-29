import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { CodeManagementClient } from "~/features/master-data/components/code-management-client";
import {
  getLedgerInputCodesForHeadquarters,
  normalizeLedgerInputCodeGroupFilter,
  normalizeLedgerInputCodeSearch,
  normalizeLedgerInputCodeStatusFilter,
} from "~/features/master-data/code-queries";
import { requireHeadquartersUser } from "~/server/authz";

type CodeManagementPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    group?: string | string[];
    status?: string | string[];
  }>;
};

export default async function CodeManagementPage({
  searchParams,
}: CodeManagementPageProps) {
  const user = await requireHeadquartersUser();
  const params = await searchParams;
  const filters = {
    q: normalizeLedgerInputCodeSearch(params.q),
    group: normalizeLedgerInputCodeGroupFilter(params.group),
    status: normalizeLedgerInputCodeStatusFilter(params.status),
  };
  const codes = await getLedgerInputCodesForHeadquarters(filters);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <PageHeader
        title="코드 관리"
        description="장부 입력에서 사용할 결제수단, 비용 항목, 손실 유형 코드를 관리합니다."
      />
      <CodeManagementClient codes={codes} filters={filters} />
    </HeadquartersShell>
  );
}
