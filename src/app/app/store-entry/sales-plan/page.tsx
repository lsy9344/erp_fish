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

// WO(2026-06-25): 판매 예정가 입력은 3단계 매입 화면으로 통합됐다. 기존 북마크/링크가
// 깨지지 않도록 이 route는 매입 단계로 redirect하고, storeId와 date query를 보존한다.
export default async function SalesPlanPage({
  searchParams,
}: SalesPlanPageProps) {
  const params = await searchParams;
  const storeId = normalizeStoreIdParam(params.storeId);
  const businessDate = normalizeBusinessDateParam(params.date);

  const query = new URLSearchParams({ step: "purchase" });
  if (storeId) {
    query.set("storeId", storeId);
  }
  if (businessDate) {
    query.set("date", businessDate);
  }

  redirect(`/app/store-entry?${query.toString()}`);
}
