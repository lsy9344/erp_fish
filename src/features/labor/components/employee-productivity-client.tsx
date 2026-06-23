"use client";

import { useState, useTransition } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Field, FieldLabel } from "~/components/ui/field";
import { getEmployeeProductivityAnalysisAction } from "~/features/labor/employees-actions";
import type { EmployeeProductivityAnalysis } from "~/features/labor/employees-queries";

type EmployeeProductivityClientProps = {
  initialMonth: string;
  initialData: EmployeeProductivityAnalysis;
};

function formatKrw(value: number | null) {
  if (value === null) {
    return "계산 불가";
  }

  return `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatMargin(value: number | null, reason: string | null) {
  if (value === null) {
    return reason ? `계산 불가 (${reason})` : "계산 불가";
  }

  return percentFormatter.format(value);
}

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석.
// 직원별 근무일 평균 매출/마진, 근무 인원 수별 평균 매출/마진, 직원 미연결 급여 행 수를 보여준다.
export function EmployeeProductivityClient({
  initialMonth,
  initialData,
}: EmployeeProductivityClientProps) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EmployeeProductivityAnalysis>(initialData);
  const [isPending, startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      const next = await getEmployeeProductivityAnalysisAction(month);
      setData(next);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-medium">월간 생산성 / 인력 배치 분석</h3>
        <Field className="w-40">
          <FieldLabel htmlFor="productivity-month">조회 월</FieldLabel>
          <Input
            id="productivity-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            disabled={isPending}
          />
        </Field>
        <Button type="button" size="sm" onClick={handleLoad} disabled={isPending}>
          {isPending ? "조회 중…" : "조회"}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        매출/마진은 본사 리포트와 같은 기준(매출원가·정정 반영)으로 계산합니다. 마진율을
        계산할 수 없는 경우 &ldquo;계산 불가&rdquo;와 사유를 함께 표시합니다.
      </p>

      {data.unlinkedPayrollRowCount > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          ⚠ 직원이 연결되지 않은 자유 입력 급여 행이 {data.unlinkedPayrollRowCount}
          건 있습니다. 이 급여는 직원별 분석에 포함되지 않으니 직원 마스터와 연결해
          주세요.
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-xs font-medium">
          직원별 근무일 평균
        </h4>
        {data.employees.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            해당 월에 직원과 연결된 근무 기록이 없습니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-3 pb-2 font-normal">직원</th>
                <th className="pr-3 pb-2 font-normal">근무 일수</th>
                <th className="pr-3 pb-2 font-normal">근무일 평균 매출</th>
                <th className="pb-2 font-normal">근무일 평균 마진율</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((row) => (
                <tr key={row.employeeId} className="border-b last:border-0">
                  <td className="py-2 pr-3">{row.employeeName}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.workedDayCount}일
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatKrw(row.avgSalesPerWorkday)}
                  </td>
                  <td className="py-2 tabular-nums">
                    {formatMargin(row.avgMarginRate, row.marginUnavailableReason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-xs font-medium">
          근무 인원 수별 평균
        </h4>
        {data.byHeadcount.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            해당 월에 근무 인원이 입력된 장부가 없습니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-3 pb-2 font-normal">근무 인원</th>
                <th className="pr-3 pb-2 font-normal">장부 수</th>
                <th className="pr-3 pb-2 font-normal">평균 매출</th>
                <th className="pb-2 font-normal">평균 마진율</th>
              </tr>
            </thead>
            <tbody>
              {data.byHeadcount.map((row) => (
                <tr key={row.workerCount} className="border-b last:border-0">
                  <td className="py-2 pr-3 tabular-nums">{row.workerCount}명</td>
                  <td className="py-2 pr-3 tabular-nums">{row.ledgerCount}건</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatKrw(row.avgSales)}
                  </td>
                  <td className="py-2 tabular-nums">
                    {formatMargin(row.avgMarginRate, row.marginUnavailableReason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
