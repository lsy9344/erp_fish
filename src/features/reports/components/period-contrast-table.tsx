import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import {
  PERIOD_ANALYSIS_METRICS,
  type PeriodContrastRow,
} from "../period-analysis";
import type { StoreComparisonReportData } from "../types";
import {
  formatPeriodDelta,
  formatPeriodMetricValue,
  getPeriodDeltaToneClass,
} from "./period-analysis-format";

// WO-0806 [F] 모드 B: 대표 엑셀 `분석` 시트와 같은 3블록 세로 배치.
// [대조 기간] / [현재] / [과거 대비 현재 증감]
export function PeriodContrastTable({
  base,
  current,
  contrastRows,
}: {
  base: StoreComparisonReportData;
  current: StoreComparisonReportData;
  contrastRows: PeriodContrastRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <MetricBlock
        title="대조 기간"
        rangeLabel={`${base.range.startDateInput} ~ ${base.range.endDateInput}`}
        report={base}
      />
      <MetricBlock
        title="현재"
        rangeLabel={`${current.range.startDateInput} ~ ${current.range.endDateInput}`}
        report={current}
      />

      <section className="grid gap-2" aria-label="과거 대비 현재 증감">
        <h3 className="text-base font-semibold">과거 대비 현재 증감</h3>
        <p className="text-muted-foreground text-xs">
          이익률과 매출대비 재고비율은 퍼센트포인트(%p) 차이, 나머지는 증감률(%)
          입니다.
        </p>
        <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">지점</TableHead>
                {PERIOD_ANALYSIS_METRICS.map((metric) => (
                  <TableHead key={metric.key} className="text-right">
                    {metric.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrastRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={PERIOD_ANALYSIS_METRICS.length + 1}
                    className="text-muted-foreground h-20 text-center"
                  >
                    비교할 지점 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                contrastRows.map((row) => (
                  <TableRow
                    key={row.storeId}
                    data-testid={`hq-report-contrast-row-${row.storeId}`}
                  >
                    <TableCell className="font-medium">
                      {row.storeName}
                    </TableCell>
                    {PERIOD_ANALYSIS_METRICS.map((metric) => {
                      const delta = row.deltas[metric.key];

                      return (
                        <TableCell
                          key={metric.key}
                          className={cn(
                            "text-right tabular-nums",
                            getPeriodDeltaToneClass(metric.key, delta),
                          )}
                        >
                          {formatPeriodDelta(delta)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function MetricBlock({
  title,
  rangeLabel,
  report,
}: {
  title: string;
  rangeLabel: string;
  report: StoreComparisonReportData;
}) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-muted-foreground text-sm tabular-nums">
          {rangeLabel}
        </span>
      </div>
      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">지점</TableHead>
              {PERIOD_ANALYSIS_METRICS.map((metric) => (
                <TableHead key={metric.key} className="text-right">
                  {metric.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={PERIOD_ANALYSIS_METRICS.length + 1}
                  className="text-muted-foreground h-20 text-center"
                >
                  표시할 지점 데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.storeId}>
                  <TableCell className="font-medium">{row.storeName}</TableCell>
                  {PERIOD_ANALYSIS_METRICS.map((metric) => (
                    <TableCell
                      key={metric.key}
                      className="text-right tabular-nums"
                    >
                      {formatPeriodMetricValue(metric.kind, row[metric.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
