import Link from "next/link";

import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { EcountSupplyDetailClient } from "~/features/ledger/components/ecount-supply-detail-client";
import { getEcountSupplyImportDetail } from "~/features/ledger/ecount-supply-queries";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import {
  getHeadquartersStoreScope,
  requireEcountUploadPreviewAccess,
} from "~/server/authz";

type EcountImportDetailPageProps = {
  params: Promise<{ batchId: string }>;
};

export default async function EcountImportDetailPage({
  params,
}: EcountImportDetailPageProps) {
  const user = await requireEcountUploadPreviewAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const { batchId } = await params;

  const detail = await getEcountSupplyImportDetail(batchId);

  if (!detail) {
    return (
      <HeadquartersShell
        userName={user.name ?? "본사 사용자"}
        userEmail={user.email ?? "headquarters"}
        navigationItems={navigationItems}
      >
        <PageHeader
          title="이카운트 업로드"
          description="해당 업로드를 찾을 수 없습니다."
        />
        <div className="bg-card flex flex-col items-start gap-3 rounded-lg border p-6 shadow-sm">
          <p className="text-muted-foreground text-sm">
            요청한 업로드 batch를 찾을 수 없습니다.
          </p>
          <Button asChild variant="outline">
            <Link href="/app/ecount-imports">목록으로 돌아가기</Link>
          </Button>
        </div>
      </HeadquartersShell>
    );
  }

  const [storeScope, productOptions] = await Promise.all([
    getHeadquartersStoreScope(),
    getActiveProductOptions(),
  ]);

  const storeOptions = storeScope.stores.map((store) => ({
    id: store.id,
    name: store.name,
  }));

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="이카운트 업로드 상세"
        description="지점/품목 매핑을 마치고 본사 장부 입고로 반영합니다."
      />
      <EcountSupplyDetailClient
        detail={detail}
        storeOptions={storeOptions}
        productOptions={productOptions}
      />
    </HeadquartersShell>
  );
}
