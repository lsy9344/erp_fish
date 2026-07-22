import { Badge } from "~/components/ui/badge";
import { MetricCard } from "~/components/metric-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  HeadquartersLaborLedgerStatus,
  HeadquartersLaborReport,
} from "../headquarters-labor-types";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const statusPresentation: Record<
  HeadquartersLaborLedgerStatus,
  { label: string; variant: "secondary" | "outline" | "default" }
> = {
  IN_PROGRESS: { label: "작성 중", variant: "secondary" },
  IN_REVIEW: { label: "검토 중", variant: "outline" },
  HEADQUARTERS_CLOSED: { label: "본사 마감", variant: "default" },
};

function StatusBadge({ status }: { status: HeadquartersLaborLedgerStatus }) {
  const presentation = statusPresentation[status];

  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

function formatMemo(value: string | null) {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed === "" ? "-" : trimmed;
}

export function HeadquartersLaborReportView({
  report,
}: {
  report: HeadquartersLaborReport;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="인건비 요약">
        <MetricCard
          label="조회기간 인건비 합계"
          value={krwFormatter.format(report.totalLaborAmount)}
        />
        <MetricCard
          label="조회 지점 수"
          value={`${report.storeCount.toLocaleString("ko-KR")}개`}
        />
        <MetricCard
          label="근무 기록 수"
          value={`${report.laborRecordCount.toLocaleString("ko-KR")}건`}
        />
      </section>

      <section className="grid gap-3" aria-labelledby="labor-store-summary">
        <h2 id="labor-store-summary" className="text-lg font-semibold">
          지점 요약
        </h2>
        <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>지점</TableHead>
                <TableHead className="text-right">근무일 수</TableHead>
                <TableHead className="text-right">근무인원 합계</TableHead>
                <TableHead className="text-right">인건비 합계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.storeSummaries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground h-20 text-center"
                  >
                    조회 대상 지점이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                report.storeSummaries.map((summary) => (
                  <TableRow key={summary.storeId}>
                    <TableCell className="font-medium">
                      {summary.storeName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.workdayCount.toLocaleString("ko-KR")}일
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.workerCount.toLocaleString("ko-KR")}명
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {krwFormatter.format(summary.laborAmount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {report.details.length === 0 ? (
        <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
          선택한 조건에 근무자별 상세 기록이 없습니다.
        </section>
      ) : (
        <section className="grid gap-3" aria-labelledby="labor-detail">
          <h2 id="labor-detail" className="text-lg font-semibold">
            근무자별 상세
          </h2>
          <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>영업일</TableHead>
                  <TableHead>지점</TableHead>
                  <TableHead>장부 상태</TableHead>
                  <TableHead>근무자명</TableHead>
                  <TableHead className="text-right">인건비</TableHead>
                  <TableHead>지각</TableHead>
                  <TableHead>조퇴</TableHead>
                  <TableHead>특이사항</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.details.map((detail) => (
                  <TableRow key={detail.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {detail.businessDate}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {detail.storeName}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={detail.status} />
                    </TableCell>
                    <TableCell>{detail.workerName}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {krwFormatter.format(detail.amount)}
                    </TableCell>
                    <TableCell>{formatMemo(detail.lateMemo)}</TableCell>
                    <TableCell>{formatMemo(detail.earlyLeaveMemo)}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      {formatMemo(detail.specialMemo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
