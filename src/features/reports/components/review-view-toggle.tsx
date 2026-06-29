"use client";

import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";

type ReviewViewToggleProps = {
  chart: ReactNode;
  table: ReactNode;
};

// WO-16(2026-06-28): 차트만 쉽게 보는 화면과 근거 확인용 표를 전환한다.
// 같은 data source를 쓰고 보기 방식만 바꾼다.
export function ReviewViewToggle({ chart, table }: ReviewViewToggleProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" role="group" aria-label="보기 방식 전환">
        <Button
          type="button"
          size="sm"
          variant={view === "chart" ? "default" : "outline"}
          aria-pressed={view === "chart"}
          onClick={() => setView("chart")}
        >
          차트 보기
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "table" ? "default" : "outline"}
          aria-pressed={view === "table"}
          onClick={() => setView("table")}
        >
          표 보기
        </Button>
      </div>
      <div>{view === "chart" ? chart : table}</div>
    </div>
  );
}
