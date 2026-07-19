import type { LedgerReviewMetric } from "~/server/calculations/ledger";
import type { DailySalesAnalysis as DailySalesAnalysisData } from "~/features/reports/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function DailySalesAnalysis({ data }: { data: DailySalesAnalysisData }) {
  if (
    data.salesChanges.length === 0 &&
    data.inventoryRatios.length === 0 &&
    data.positions.length === 0
  ) {
    return (
      <p className="text-muted-foreground text-sm">
        표시할 매출 분석 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <AnalysisTable title="전일 대비 매출액 증감률">
        <TableHeader>
          <TableRow>
            <TableHead>지점</TableHead>
            <TableHead>선택일 매출</TableHead>
            <TableHead>전일 매출</TableHead>
            <TableHead>증감액</TableHead>
            <TableHead>증감률</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.salesChanges.map((row) => (
            <TableRow key={row.storeId}>
              <TableCell>{row.storeName}</TableCell>
              <TableCell>{formatMoney(row.currentSales)}</TableCell>
              <TableCell>{formatMoney(row.previousSales)}</TableCell>
              <TableCell>{formatMoney(row.difference)}</TableCell>
              <TableCell>{formatChange(row.rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </AnalysisTable>

      <AnalysisTable title="재고비율">
        <TableHeader>
          <TableRow>
            <TableHead>지점</TableHead>
            <TableHead>재고금액</TableHead>
            <TableHead>매출액</TableHead>
            <TableHead>재고비율</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.inventoryRatios.map((row) => (
            <TableRow key={row.storeId}>
              <TableCell>{row.storeName}</TableCell>
              <TableCell>{formatMoney(row.inventoryAmount)}</TableCell>
              <TableCell>{formatMoney(row.salesAmount)}</TableCell>
              <TableCell>{formatPercent(row.ratio)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </AnalysisTable>

      <AnalysisTable title="매장 매출 포지션">
        <TableHeader>
          <TableRow>
            <TableHead>순위</TableHead>
            <TableHead>지점</TableHead>
            <TableHead>매출액</TableHead>
            <TableHead>전체 비중</TableHead>
            <TableHead>전체 평균 대비</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.positions.map((row) => (
            <TableRow key={row.storeId}>
              <TableCell>{row.rank.toLocaleString("ko-KR")}</TableCell>
              <TableCell>{row.storeName}</TableCell>
              <TableCell>{formatMoney(row.salesAmount)}</TableCell>
              <TableCell>
                <span className="tabular-nums">{formatPercent(row.share)}</span>
                {row.share.value !== null ? (
                  <span
                    className="bg-muted mt-1 block h-1.5 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, row.share.value * 100))}%`,
                      }}
                    />
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{formatChange(row.averageComparison)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </AnalysisTable>

      {data.excludedPositions.length > 0 ? (
        <div className="rounded-md border border-dashed p-3">
          <h4 className="text-sm font-medium">제외 지점</h4>
          <ul className="text-muted-foreground mt-2 grid gap-1 text-sm">
            {data.excludedPositions.map((row) => (
              <li key={row.storeId}>
                {row.storeName}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AnalysisTable({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-md border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2 min-w-0">
        <Table className="min-w-[620px]" aria-label={title}>
          {children}
        </Table>
      </div>
    </section>
  );
}

function formatMoney(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : currencyFormatter.format(metric.value);
}

function formatPercent(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : percentFormatter.format(metric.value);
}

function formatChange(metric: LedgerReviewMetric) {
  if (metric.value === null) return formatUnavailable(metric);
  const direction =
    metric.value > 0 ? "증가" : metric.value < 0 ? "감소" : "변동 없음";
  return `${percentFormatter.format(metric.value)} ${direction}`;
}

function formatUnavailable(metric: LedgerReviewMetric) {
  return `계산 불가${metric.reason ? ` (${metric.reason})` : ""}`;
}
