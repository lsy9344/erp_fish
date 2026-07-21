import { MetricCard } from "~/components/metric-card";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  DailyAttendanceReport as DailyAttendanceReportData,
  DailyAttendanceStatus,
} from "~/features/reports/types";

export function DailyAttendanceReport({
  attendance,
}: {
  attendance: DailyAttendanceReportData;
}) {
  const summaryItems = [
    ["이상 근태 인원", attendance.summary.exceptionWorkers],
    ["지각", attendance.summary.late],
    ["조퇴", attendance.summary.earlyLeave],
    ["특이사항", attendance.summary.special],
  ] as const;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map(([label, value]) => (
          <MetricCard
            key={label}
            label={label}
            value={value.toLocaleString("ko-KR")}
            variant={value > 0 ? "warning" : "default"}
          />
        ))}
      </div>

      {attendance.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          선택일에 지각·조퇴·특이사항이 없습니다.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[900px]" aria-label="직원 근태 상세">
              <TableHeader>
                <TableRow>
                  {[
                    "지점",
                    "직원",
                    "상태",
                    "지각 메모",
                    "조퇴 메모",
                    "특이사항",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.rows.map((row, index) => (
                  <TableRow key={`${row.storeId}-${index}`}>
                    <TableCell>{row.storeName}</TableCell>
                    <TableCell>{row.workerName}</TableCell>
                    <TableCell>
                      <StatusBadges statuses={row.statuses} />
                    </TableCell>
                    <MemoCell value={row.lateMemo} />
                    <MemoCell value={row.earlyLeaveMemo} />
                    <MemoCell value={row.specialMemo} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {attendance.rows.map((row, index) => (
              <article
                key={`${row.storeId}-${index}`}
                className="rounded-md border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.workerName}</p>
                    <p className="text-muted-foreground text-xs">
                      {row.storeName}
                    </p>
                  </div>
                  <StatusBadges statuses={row.statuses} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Memo label="지각 메모" value={row.lateMemo} />
                  <Memo label="조퇴 메모" value={row.earlyLeaveMemo} />
                  <Memo label="특이사항" value={row.specialMemo} />
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadges({ statuses }: { statuses: DailyAttendanceStatus[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((status) => (
        <Badge
          key={status}
          variant={status === "직원 미연결" ? "secondary" : "destructive"}
        >
          {status}
        </Badge>
      ))}
    </div>
  );
}

function MemoCell({ value }: { value: string | null }) {
  return (
    <TableCell className="break-words whitespace-normal">
      {value ?? "-"}
    </TableCell>
  );
}

function Memo({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value ?? "-"}</dd>
    </div>
  );
}
