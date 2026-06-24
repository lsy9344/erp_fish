import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getHeadquartersSupplyReport,
  type EcountSupplyReportFilters,
} from "~/features/reports/ecount-supply-report-queries";
import { requireReportAccess } from "~/server/authz";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function formatKrw(value: number | null) {
  return value === null ? "—" : krwFormatter.format(value);
}

type EcountSupplyReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const ledgerStatusLabels: Record<string, string> = {
  IN_PROGRESS: "입력 중",
  IN_REVIEW: "검토 대기",
  HEADQUARTERS_CLOSED: "본사 마감",
  HOLIDAY: "휴무",
};

export default async function EcountSupplyReportPage({
  searchParams,
}: EcountSupplyReportPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;

  const rawFilters: Partial<EcountSupplyReportFilters> = {
    from: firstParam(params.from),
    to: firstParam(params.to),
    storeId: firstParam(params.storeId),
    productId: firstParam(params.productId),
    category: firstParam(params.category),
    minUnitPrice: firstParam(params.minUnitPrice),
    maxUnitPrice: firstParam(params.maxUnitPrice),
    batchId: firstParam(params.batchId),
  };

  const report = await getHeadquartersSupplyReport(rawFilters);

  const summaryItems = [
    {
      label: "입고 라인 수",
      value: report.summary.rowCount.toLocaleString("ko-KR"),
      variant: "default" as const,
    },
    {
      label: "총 수량",
      value: report.summary.totalQuantity.toLocaleString("ko-KR"),
      variant: "default" as const,
    },
    {
      label: "총 공급가액",
      value: krwFormatter.format(report.summary.totalSupplyAmount),
      variant: "default" as const,
    },
    {
      label: "판매가 계획 없음",
      value: report.summary.unmappedSalesPlanCount.toLocaleString("ko-KR"),
      variant: "muted" as const,
    },
  ];

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="본사 출고 / 지점 입고 내역"
        description="이카운트로 반영된 지점별 입고 라인입니다. 실제 품목별 판매 데이터가 없어 마진·성과 값은 추정으로만 표시합니다."
      />

      <form
        action="/app/reports/ecount-supply"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="from">
            시작일
          </label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={report.filters.from}
            className="h-9 w-36"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="to">
            종료일
          </label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={report.filters.to}
            className="h-9 w-36"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="storeId">
            지점
          </label>
          <select
            id="storeId"
            name="storeId"
            defaultValue={report.filters.storeId}
            className="border-input bg-card h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">전체 지점</option>
            {report.storeOptions.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="category">
            분류
          </label>
          <select
            id="category"
            name="category"
            defaultValue={report.filters.category}
            className="border-input bg-card h-9 min-w-28 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">전체 분류</option>
            <option value="냉동">냉동</option>
            <option value="생물">생물</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="minUnitPrice">
            단가 최소
          </label>
          <Input
            id="minUnitPrice"
            name="minUnitPrice"
            type="number"
            min={0}
            defaultValue={report.filters.minUnitPrice}
            className="h-9 w-28"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="maxUnitPrice">
            단가 최대
          </label>
          <Input
            id="maxUnitPrice"
            name="maxUnitPrice"
            type="number"
            min={0}
            defaultValue={report.filters.maxUnitPrice}
            className="h-9 w-28"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="batchId">
            업로드 파일
          </label>
          <select
            id="batchId"
            name="batchId"
            defaultValue={report.filters.batchId}
            className="border-input bg-card h-9 min-w-44 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">전체 파일</option>
            {report.batchOptions.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.fileName}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">
          조회
        </Button>
      </form>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="본사 출고/지점 입고 요약"
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

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>일자-No.</TableHead>
              <TableHead>지점</TableHead>
              <TableHead>품목</TableHead>
              <TableHead>규격</TableHead>
              <TableHead className="text-right">수량</TableHead>
              <TableHead className="text-right">단가(적용)</TableHead>
              <TableHead className="text-right">원본 단가</TableHead>
              <TableHead className="text-right">공급가액</TableHead>
              <TableHead>장부 상태</TableHead>
              <TableHead>재고/FIFO</TableHead>
              <TableHead className="text-right">판매 예정가(추정)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-muted-foreground py-6 text-center">
                  조건에 맞는 출고/입고 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.ledgerPurchaseItemId}>
                  <TableCell>{row.dateNo ?? "—"}</TableCell>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>{row.productSpec}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKrw(row.unitPrice)}
                    {row.unitPriceOverridden ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        (보정)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKrw(row.sourceUnitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKrw(row.supplyAmount)}
                  </TableCell>
                  <TableCell>
                    {ledgerStatusLabels[row.ledgerStatus] ?? row.ledgerStatus}
                  </TableCell>
                  <TableCell>{row.fifoLinked ? "연결됨" : "미연결"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.plannedUnitPrice === null
                      ? "판매가 계획 없음"
                      : `${formatKrw(row.plannedUnitPrice)} (추정)`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </HeadquartersShell>
  );
}
