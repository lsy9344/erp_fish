"use client";

import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Field, FieldLabel } from "~/components/ui/field";
import { getEmployeeMonthlyPayrollAction } from "~/features/labor/employees-actions";
import type { EmployeeMonthlyPayroll } from "~/features/labor/employees-queries";

type EmployeePayrollRollupClientProps = {
  initialMonth: string;
  initialData: EmployeeMonthlyPayroll;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function EmployeePayrollRollupClient({
  initialMonth,
  initialData,
}: EmployeePayrollRollupClientProps) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EmployeeMonthlyPayroll>(initialData);
  const [isPending, startTransition] = useTransition();

  const { rows, unlinked } = data;

  function handleLoad() {
    startTransition(async () => {
      const next = await getEmployeeMonthlyPayrollAction(month);
      setData(next);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-medium">직원별 월간 급여 롤업</h3>
        <Field className="w-40">
          <FieldLabel htmlFor="payroll-month">조회 월</FieldLabel>
          <Input
            id="payroll-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            disabled={isPending}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          onClick={handleLoad}
          disabled={isPending}
        >
          {isPending ? "조회 중…" : "조회"}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        직원이 연결된 급여 행만 직원별로 합산합니다. 자유 입력(직원 미연결)
        급여는 아래 “미연결” 합계로 별도 표시되며, 직원 마스터와 연결하면 직원별
        분석에 반영됩니다.
      </p>

      {unlinked.rowCount > 0 ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          role="status"
        >
          <p className="font-medium">
            직원 미연결(자유 입력) 급여 {unlinked.rowCount}건 ·{" "}
            {formatKrw(unlinked.payrollTotal)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            월말 급여 계산에서 누락되지 않도록 합계를 함께 표시합니다. 직원별
            분석에 포함하려면 해당 급여 행을 직원 마스터와 연결해 주세요.
          </p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          해당 월에 직원과 연결된 급여 기록이 없습니다.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="pr-3 pb-2 font-normal">직원</th>
              <th className="pr-3 pb-2 font-normal">근무 매장 수</th>
              <th className="pr-3 pb-2 font-normal">근무 일수</th>
              <th className="pr-3 pb-2 font-normal">급여 합계</th>
              <th className="pb-2 font-normal">특이사항 메모</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-b last:border-0">
                <td className="py-2 pr-3">{row.employeeName}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {row.workedStoreCount}곳
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {row.workedDayCount}일
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {formatKrw(row.payrollTotal)}
                </td>
                <td className="py-2 tabular-nums">{row.memoCount}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
