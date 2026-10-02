"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  type PreviousStockLedgerStatus,
  type PreviousStockViewItem,
} from "~/features/inventory/previous-stock-view";
import { formatQuantity } from "~/lib/format";
import { cn } from "~/lib/utils";

const categories = ["전체", "냉동", "생물"] as const;

function normalizeCategory(value: string): (typeof categories)[number] {
  if (value === "전체") return "전체";
  return value === "생물" ? "생물" : "냉동";
}

function formatLedgerStatus(status: PreviousStockLedgerStatus | null) {
  switch (status) {
    case "HEADQUARTERS_CLOSED":
      return "본사 마감";
    case "IN_REVIEW":
      return "검토 대기";
    case "IN_PROGRESS":
      return "저장 중";
    case "HOLIDAY":
      return "휴무";
    default:
      return "-";
  }
}

type PreviousStockButtonProps = {
  items: PreviousStockViewItem[];
  sticky?: boolean;
};

export function PreviousStockButton({
  items,
  sticky = false,
}: PreviousStockButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number]>("전체");
  const visibleItems =
    category === "전체"
      ? items
      : items.filter((item) => item.productCategory === category);

  return (
    <>
      <div
        className={cn(
          "bg-background flex justify-end",
          sticky && "sticky top-[65px] z-20 py-2",
        )}
      >
        <Button
          type="button"
          className="min-h-11 font-semibold"
          onClick={() => setOpen(true)}
        >
          전날 재고 보기
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>전날 재고 보기</DialogTitle>
            <DialogDescription>
              전날 재고 수량·판매량·마지막 입고일입니다. 금액·단가는 표시하지
              않으며, 전날 장부는 여기서 수정할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            type="single"
            value={category}
            onValueChange={(value) => {
              if (value) {
                setCategory(normalizeCategory(value));
              }
            }}
            aria-label="전날 재고 분류"
          >
            {categories.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {visibleItems.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              전날 재고 항목이 없습니다.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>품목</TableHead>
                    <TableHead>규격</TableHead>
                    <TableHead className="text-right">전날 재고</TableHead>
                    <TableHead className="text-right">
                      전날 기준 판매량
                    </TableHead>
                    <TableHead>마지막 입고일</TableHead>
                    <TableHead>전일 장부</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell>{item.productSpec || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(item.previousQuantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.sourceSalesQuantity === null ? (
                          <span title="전일 장부의 시작·매입·마감 수량 근거가 없어 계산할 수 없습니다.">
                            계산 불가
                          </span>
                        ) : (
                          formatQuantity(item.sourceSalesQuantity)
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {item.sourceLastArrivalDate ? (
                          item.sourceLastArrivalDate.slice(0, 10)
                        ) : (
                          <span title="남아 있는 FIFO 입고 근거가 없습니다.">
                            계산 불가
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {formatLedgerStatus(item.sourceLedgerStatus)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
