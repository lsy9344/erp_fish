import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { EcountSupplyUploadClient } from "~/features/ledger/components/ecount-supply-upload-client";
import { listEcountImportBatches } from "~/features/ledger/ecount-supply-queries";
import { requireEcountUploadPreviewAccess } from "~/server/authz";

export default async function EcountImportsPage() {
  const user = await requireEcountUploadPreviewAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const batches = await listEcountImportBatches();

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="이카운트 업로드"
        description="이카운트 엑셀(본사 출고/지점 입고) 파일을 업로드해 본사 장부 입고로 반영합니다."
      />
      <EcountSupplyUploadClient batches={batches} />
    </HeadquartersShell>
  );
}
