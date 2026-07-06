import type { ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import type {
  InventoryPositionReportData,
  InventoryPositionRow,
  InventoryPositionStatusLabel,
} from "../inventory-position-types";
import { InventoryPositionHistoryDialog } from "./inventory-position-history-dialog";

type InventoryPositionReportTableProps = {
  report: InventoryPositionReportData;
};

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const statusBadgeVariant: Record<
  InventoryPositionStatusLabel,
  "outline" | "secondary" | "destructive"
> = {
  입력됨: "secondary",
  미입력: "outline",
  "계산 불가": "destructive",
};

export function InventoryPositionReportTable({
  report,
}: InventoryPositionReportTableProps) {
  if (report.rows.length === 0) {
    return (
      <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
        {report.stores.length === 0
          ? "표시할 지점 데이터가 없습니다. 기준정보에서 활성 지점을 먼저 확인해 주세요."
          : "선택한 조건에 표시할 재고 데이터가 없습니다. 날짜·지점·분류·품목 필터를 확인해 주세요."}
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="전 지점 재고 현황 목록"
    >
      <p className="text-muted-foreground text-xs break-words">
        남은 재고는 장부에 입력된 당일 재고 수량 기준 실측값입니다. 장부가 없는
        지점은 0이 아닌 <strong>미입력</strong>으로, 단가·수량이 없어 금액을
        구할 수 없으면 <strong>계산 불가</strong>로 표기합니다.
      </p>

      <div className="bg-card hidden overflow-x-auto rounded-lg border shadow-sm md:block">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">지점</TableHead>
              <TableHead className="w-[180px]">품목</TableHead>
              <TableHead>분류</TableHead>
              <TableHead>규격</TableHead>
              <TableHead className="text-right">전일재고</TableHead>
              <TableHead className="text-right">매입</TableHead>
              <TableHead className="text-right">손실</TableHead>
              <TableHead className="text-right">남은 재고</TableHead>
              <TableHead className="text-right">전산 재고</TableHead>
              <TableHead className="text-right">당일 판매량</TableHead>
              <TableHead className="text-right">재고 금액</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row, index) => (
              <TableRow
                key={`${row.storeId}-${row.productId || "missing"}-${index}`}
                data-testid={`hq-report-inventory-row-${row.storeId}-${
                  row.productId || "missing"
                }`}
              >
                <TableCell className="font-medium">{row.storeName}</TableCell>
                <TableCell className="font-medium break-words">
                  {row.productName}
                </TableCell>
                <TableCell>{row.productCategory || "—"}</TableCell>
                <TableCell>{row.productSpec || "—"}</TableCell>
                <HistoryQuantityCell
                  row={row}
                  dateInput={report.filters.dateInput}
                  value={
                    row.statusLabel === "미입력" ? null : row.previousQuantity
                  }
                />
                <QuantityCell
                  value={
                    row.statusLabel === "미입력" ? null : row.purchasedQuantity
                  }
                />
                <QuantityCell
                  value={row.statusLabel === "미입력" ? null : row.lossQuantity}
                />
                <QuantityCell value={row.currentQuantity} highlight />
                <QuantityCell value={row.systemQuantity} />
                <QuantityCell value={row.differenceQuantity} signed />
                <TableCell className="text-right tabular-nums">
                  <InventoryPositionHistoryDialog
                    row={row}
                    dateInput={report.filters.dateInput}
                    metricLabel="재고 금액"
                    value={formatAmount(row.inventoryAmount)}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.statusLabel} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {report.rows.map((row, index) => (
          <article
            key={`${row.storeId}-${row.productId || "missing"}-${index}`}
            data-testid={`hq-report-inventory-mobile-row-${row.storeId}-${
              row.productId || "missing"
            }`}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-normal">
                  {row.storeName}
                </h2>
                <p className="text-muted-foreground text-sm break-words">
                  {row.productName}
                  {row.productSpec ? ` · ${row.productSpec}` : ""}
                </p>
              </div>
              <StatusBadge status={row.statusLabel} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <MobileMetric
                label="남은 재고"
                value={formatQuantity(row.currentQuantity)}
              />
              <MobileMetric
                label="재고 금액"
                value={
                  <InventoryPositionHistoryDialog
                    row={row}
                    dateInput={report.filters.dateInput}
                    metricLabel="재고 금액"
                    value={formatAmount(row.inventoryAmount)}
                    align="left"
                  />
                }
              />
              <MobileMetric
                label="전일재고"
                value={
                  <InventoryPositionHistoryDialog
                    row={row}
                    dateInput={report.filters.dateInput}
                    metricLabel="전일재고"
                    value={
                      row.statusLabel === "미입력"
                        ? "미입력"
                        : formatQuantity(row.previousQuantity)
                    }
                    align="left"
                  />
                }
              />
              <MobileMetric
                label="매입"
                value={
                  row.statusLabel === "미입력"
                    ? "미입력"
                    : formatQuantity(row.purchasedQuantity)
                }
              />
            </dl>

            <details className="mt-4 text-sm">
              <summary className="text-primary inline-flex cursor-pointer list-none underline-offset-2 hover:underline">
                나머지 지표
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <MobileMetric label="분류" value={row.productCategory || "—"} />
                <MobileMetric
                  label="손실"
                  value={
                    row.statusLabel === "미입력"
                      ? "미입력"
                      : formatQuantity(row.lossQuantity)
                  }
                />
                <MobileMetric
                  label="전산 재고"
                  value={formatQuantity(row.systemQuantity)}
                />
                <MobileMetric
                  label="당일 판매량"
                  value={formatSignedQuantity(row.differenceQuantity)}
                />
              </dl>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuantityCell({
  value,
  highlight = false,
  signed = false,
}: {
  value: number | null;
  highlight?: boolean;
  signed?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
        highlight ? "font-semibold" : undefined,
      )}
    >
      {signed ? formatSignedQuantity(value) : formatQuantity(value)}
    </TableCell>
  );
}

function HistoryQuantityCell({
  row,
  dateInput,
  value,
}: {
  row: InventoryPositionRow;
  dateInput: string;
  value: number | null;
}) {
  return (
    <TableCell className="text-right tabular-nums">
      <InventoryPositionHistoryDialog
        row={row}
        dateInput={dateInput}
        metricLabel="전일재고"
        value={formatQuantity(value)}
      />
    </TableCell>
  );
}

function MobileMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words tabular-nums">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: InventoryPositionStatusLabel }) {
  return <Badge variant={statusBadgeVariant[status]}>{status}</Badge>;
}

function formatQuantity(value: number | null) {
  return value === null ? "계산 불가" : quantityFormatter.format(value);
}

function formatSignedQuantity(value: number | null) {
  if (value === null) {
    return "계산 불가";
  }

  const formatted = quantityFormatter.format(Math.abs(value));

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function formatAmount(value: number | null) {
  return value === null ? "계산 불가" : krwFormatter.format(value);
}
