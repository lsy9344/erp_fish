import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { historicalSourceLabel } from "../historical-integration";
import type {
  PeriodAnalysisMetric,
  PeriodTrendColumn,
  PeriodTrendRow,
  PeriodTrendSourceCell,
} from "../period-analysis";
import { formatPeriodMetricValue } from "./period-analysis-format";
import { PeriodTrendChart } from "./period-trend-chart";

// WO-0806 [F] 모드 C: 엑셀 `매장 별(달)`·`매장 별(년도)`·지표 피벗 시트를
// 축 토글 하나로 합친 표. 대표가 보던 형태가 차트가 아니라 표다.
function TrendSource({
  sourceCell,
}: {
  sourceCell: PeriodTrendSourceCell | undefined;
}) {
  if (!sourceCell) return null;
  const showSource =
    sourceCell.source === "historical" || sourceCell.source === "mixed";

  return (
    <>
      {showSource ? (
        <Badge variant="outline" className="mt-1">
          {historicalSourceLabel(sourceCell.source)}
        </Badge>
      ) : null}
      {sourceCell.missingMetrics.length > 0 ? (
        <span className="text-muted-foreground mt-1 block text-xs">
          누락 있음
        </span>
      ) : null}
      {sourceCell.excludedHistoricalOverlapCount > 0 ? (
        <span className="text-muted-foreground mt-1 block text-xs">
          운영 우선 {sourceCell.excludedHistoricalOverlapCount}일
        </span>
      ) : null}
    </>
  );
}

export function PeriodTrendTable({
  axis,
  columns,
  rows,
  metric,
}: {
  axis: "store" | "metric";
  columns: PeriodTrendColumn[];
  rows: PeriodTrendRow[];
  metric: PeriodAnalysisMetric;
}) {
  const headLabel = axis === "metric" ? "지표" : "지점";
  const totalLabel =
    metric.kind === "money" && axis === "store" ? "합계" : "합계/평균";

  if (columns.length === 0 || rows.length === 0) {
    return (
      <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
        표시할 기간 데이터가 없습니다. 조회 조건을 확인해 주세요.
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table style={{ minWidth: `${220 + columns.length * 120}px` }}>
          <TableHeader>
            <TableRow>
              {/* 가로 스크롤에서 첫 열은 고정한다. */}
              <TableHead className="bg-card sticky left-0 z-10 w-[160px]">
                {headLabel}
              </TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className="text-right">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold">
                {totalLabel}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.key}
                data-testid={`hq-report-trend-row-${row.key}`}
              >
                <TableCell className="bg-card sticky left-0 z-10 font-medium">
                  {row.label}
                </TableCell>
                {row.cells.map((cell, index) => (
                  <TableCell
                    key={columns[index]?.key ?? index}
                    className="text-right tabular-nums"
                  >
                    <span className="block">
                      {formatPeriodMetricValue(row.kind, cell)}
                    </span>
                    <TrendSource sourceCell={row.sourceCells[index]} />
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPeriodMetricValue(row.kind, row.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {axis === "store" ? (
        <PeriodTrendChart columns={columns} rows={rows} metric={metric} />
      ) : null}
    </div>
  );
}
