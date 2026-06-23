"use client";

import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import type {
  InventoryPositionFifoLotRow,
  InventoryPositionRow,
} from "../inventory-position-types";

type InventoryPositionHistoryDialogProps = {
  row: InventoryPositionRow;
  dateInput: string;
  metricLabel: "전일재고" | "재고 금액";
  value: string;
  align?: "left" | "right";
};

type RangeMode = "recent-month" | "all";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("ko-KR");

const sourceTypeLabels: Record<
  InventoryPositionFifoLotRow["sourceType"],
  string
> = {
  OPENING: "기초 재고",
  PREVIOUS_CARRYOVER: "전일 이월",
  PURCHASE: "매입",
  LEGACY_OPENING: "기존 재고",
};

export function InventoryPositionHistoryDialog({
  row,
  dateInput,
  metricLabel,
  value,
  align = "right",
}: InventoryPositionHistoryDialogProps) {
  const [rangeMode, setRangeMode] = useState<RangeMode>("recent-month");
  const filteredLots = useMemo(
    () => filterLots(row.fifoLots, dateInput, rangeMode),
    [dateInput, rangeMode, row.fifoLots],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className={cn(
            "h-auto min-h-0 p-0 text-sm font-medium whitespace-normal tabular-nums",
            align === "right" ? "justify-end text-right" : "justify-start",
          )}
          aria-label={`${row.storeName} ${row.productName} ${metricLabel} FIFO 매입 이력 보기`}
        >
          {value}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>FIFO 매입 이력</DialogTitle>
          <DialogDescription>
            {row.storeName} · {row.productName} · {metricLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">기간</span>
          <Button
            type="button"
            size="sm"
            variant={rangeMode === "recent-month" ? "secondary" : "outline"}
            onClick={() => setRangeMode("recent-month")}
          >
            최근 1개월
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rangeMode === "all" ? "secondary" : "outline"}
            onClick={() => setRangeMode("all")}
          >
            전체
          </Button>
        </div>

        {filteredLots.length === 0 ? (
          <p className="bg-muted/40 text-muted-foreground rounded-md border p-4 text-sm">
            선택한 기간의 FIFO 잔여 이력이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">출처</th>
                  <th className="px-3 py-2 text-left font-medium">
                    입고 영업일
                  </th>
                  <th className="px-3 py-2 text-right font-medium">단가</th>
                  <th className="px-3 py-2 text-right font-medium">원수량</th>
                  <th className="px-3 py-2 text-right font-medium">소진</th>
                  <th className="px-3 py-2 text-right font-medium">잔량</th>
                  <th className="px-3 py-2 text-right font-medium">잔액</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const sourceBusinessDate = formatDate(
                    lot.sourceBusinessDate ?? lot.purchaseDate,
                  );

                  return (
                    <tr
                      key={`${lot.sortOrder}-${lot.sourceType}-${sourceBusinessDate}`}
                      className="border-t"
                    >
                      <td className="px-3 py-2">
                        {sourceTypeLabels[lot.sourceType]}
                      </td>
                      <td className="px-3 py-2">{sourceBusinessDate}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatKrw(lot.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatQuantity(lot.originalQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatQuantity(lot.consumedQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatQuantity(lot.remainingQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatKrw(lot.remainingAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function filterLots(
  lots: InventoryPositionFifoLotRow[],
  dateInput: string,
  rangeMode: RangeMode,
) {
  if (rangeMode === "all") {
    return lots;
  }

  const cutoffDateInput = subtractOneMonth(dateInput);

  return lots.filter((lot) => {
    const lotDateInput = toDateInput(
      lot.sourceBusinessDate ?? lot.purchaseDate,
    );

    return (
      lotDateInput !== null &&
      cutoffDateInput !== null &&
      lotDateInput >= cutoffDateInput &&
      lotDateInput <= dateInput
    );
  });
}

function subtractOneMonth(dateInput: string) {
  const date = new Date(`${dateInput}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCMonth(date.getUTCMonth() - 1);

  return date.toISOString().slice(0, 10);
}

function toDateInput(value: string | null) {
  return value?.slice(0, 10) ?? null;
}

function formatDate(value: string | null) {
  return toDateInput(value) ?? "날짜 없음";
}

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

function formatKrw(value: number) {
  return krwFormatter.format(value);
}
