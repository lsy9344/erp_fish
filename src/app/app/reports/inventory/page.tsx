import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import { InventoryPositionReportTable } from "~/features/reports/components/inventory-position-report-table";
import { ReportsNav } from "~/features/reports/components/reports-nav";
import { getHqInventoryPositionReport } from "~/features/reports/inventory-position-queries";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

type InventoryPositionReportPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    storeId?: string | string[];
    category?: string | string[];
    product?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryPositionReportPage({
  searchParams,
}: InventoryPositionReportPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const canExportReports = await hasActionPermission(
    user.id,
    PermissionAction.EXPORT_CREATE,
  );
  const params = await searchParams;
  const date = firstParam(params.date);
  const storeId = firstParam(params.storeId);
  const category = firstParam(params.category);
  const product = firstParam(params.product);
  const report = await getHqInventoryPositionReport({
    date,
    storeId,
    category,
    product,
  });
  const selectedStoreLabel = report.filters.storeName ?? "전체 활성 지점";
  const summaryItems = [
    {
      label: "대상 지점",
      value: report.summary.storeCount.toLocaleString("ko-KR"),
      variant: "default" as const,
    },
    {
      label: "품목 수",
      value: report.summary.productCount.toLocaleString("ko-KR"),
      variant: "default" as const,
    },
    {
      label: "입력됨",
      value: report.summary.enteredRowCount.toLocaleString("ko-KR"),
      variant: "success" as const,
    },
    {
      label: "미입력",
      value: report.summary.missingRowCount.toLocaleString("ko-KR"),
      variant: "muted" as const,
    },
    {
      label: "재고 금액 합계",
      value:
        report.summary.totalInventoryAmount === null
          ? "계산 불가"
          : krwFormatter.format(report.summary.totalInventoryAmount),
      variant: "default" as const,
    },
  ];
  const exportParams = new URLSearchParams({
    report: "inventory",
    date: report.filters.dateInput,
    format: "csv",
  });

  if (report.filters.storeId) {
    exportParams.set("storeId", report.filters.storeId);
  }

  if (report.filters.category) {
    exportParams.set("category", report.filters.category);
  }

  if (report.filters.productQuery) {
    exportParams.set("product", report.filters.productQuery);
  }

  const exportHref = `/api/reports/export?${exportParams.toString()}`;

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <ReportsNav active="inventory" />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="전 지점 재고 현황"
          description={`${report.filters.dateInput} 기준 ${selectedStoreLabel}의 지점·품목별 남은 재고를 한 화면에서 봅니다. 미입력·계산 불가 상태를 실측값과 구분해 표시합니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <form
            action="/app/reports/inventory"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grid gap-1">
              <label className="text-muted-foreground text-xs" htmlFor="date">
                조회 날짜
              </label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={report.filters.dateInput}
                className="h-9 w-36"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="storeId"
              >
                지점
              </label>
              <select
                id="storeId"
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="border-input bg-card ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">전체 활성 지점</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="category"
              >
                분류
              </label>
              <select
                id="category"
                name="category"
                defaultValue={report.filters.category ?? ""}
                className="border-input bg-card ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 min-w-32 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">전체 분류</option>
                {report.categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="product"
              >
                품목
              </label>
              <Input
                id="product"
                name="product"
                type="text"
                placeholder="품목명 검색"
                defaultValue={report.filters.productQuery ?? ""}
                className="h-9 w-40"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              조회
            </Button>
            {canExportReports ? (
              <Button asChild variant="outline" size="sm">
                <a href={exportHref}>
                  <DownloadIcon data-icon="inline-start" />
                  CSV
                </a>
              </Button>
            ) : null}
          </form>
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="전 지점 재고 현황 요약"
      >
        {summaryItems.map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            variant={item.variant}
          />
        ))}
      </section>

      {report.errorMessages.length > 0 ? (
        <div className="grid gap-2">
          {report.errorMessages.map((message) => (
            <p
              key={message}
              className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm break-words"
            >
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <InventoryPositionReportTable report={report} />
    </HeadquartersShell>
  );
}
