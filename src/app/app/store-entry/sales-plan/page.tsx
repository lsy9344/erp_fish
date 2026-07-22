import { redirect } from "next/navigation";

import { getKstBusinessDateParam } from "~/features/ledger/queries";
import { normalizeStoreIdParam } from "~/server/authz";

type SalesPlanPageProps = {
  searchParams: Promise<{
    storeId?: string | string[];
    date?: string | string[];
  }>;
};

function normalizeBusinessDateParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return null;
  }

  try {
    return getKstBusinessDateParam(value ?? new Date());
  } catch {
    return null;
  }
}

// 판매한 가격 입력은 3단계 재고 화면으로 이동했다. 기존 북마크의 지점/날짜는 보존한다.
export default async function SalesPlanPage({
  searchParams,
}: SalesPlanPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const businessDate = normalizeBusinessDateParam(params.date);

  const query = new URLSearchParams();
  if (storeId) {
    query.set("storeId", storeId);
  }
  if (businessDate) {
    query.set("date", businessDate);
  }

  redirect(`/app/store-entry/inventory?${query.toString()}`);
}
