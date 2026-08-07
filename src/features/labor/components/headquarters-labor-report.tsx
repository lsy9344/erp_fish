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

// WO-25(2026-07-25) #8: 직원이 미등록이거나 상세를 입력하지 않은 경우 "-"로 표시한다.
function formatOptionalKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
}

function formatOptionalText(value: string | null) {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed === "" ? "-" : trimmed;
}

// WO-0806 #2-1: 대표 엑셀 `평균 근무인원`과 같은 지표라 소수 표기를 따른다.
const headcountFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDailyAverageWorkers(workerCount: number, workdayCount: number) {
  return workdayCount > 0
    ? `${headcountFormatter.format(workerCount / workdayCount)}명`
    : "-";
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
                <TableHead className="text-right">근무인원 일평균</TableHead>
                <TableHead className="text-right">인건비 합계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.storeSummaries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
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
                    <TableCell className="text-right tabular-nums">
                      {formatDailyAverageWorkers(
                        summary.workerCount,
                        summary.workdayCount,
                      )}
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

      {/* WO-0806 #2: 월급 지급 실무용 근무자 단위 집계. 일별 상세보다 먼저 둔다. */}
      {report.workerSettlements.length > 0 ? (
        <section
          className="grid gap-3"
          aria-labelledby="labor-worker-settlement"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="labor-worker-settlement" className="text-lg font-semibold">
              근무자별 월 정산
            </h2>
            {report.isSingleMonth ? null : (
              <Badge variant="secondary">기간 합계 기준</Badge>
            )}
          </div>
          <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead>근무자</TableHead>
                  <TableHead>근무 지점</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead className="text-right">근무일수</TableHead>
                  <TableHead className="text-right">인건비 합계</TableHead>
                  <TableHead className="text-right">희망 4대보험</TableHead>
                  <TableHead
                    className="text-right"
                    title="인건비 합계 − 희망 4대보험"
                  >
                    희망 현금
                    <span className="text-muted-foreground block text-xs font-normal">
                      인건비 합계 − 희망 4대보험
                    </span>
                  </TableHead>
                  <TableHead>계좌번호</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.workerSettlements.map((settlement) => (
                  <TableRow key={settlement.key}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {settlement.workerName}
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal">
                      {settlement.storeNames.join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      {formatOptionalText(settlement.position)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {settlement.workdayCount.toLocaleString("ko-KR")}일
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {krwFormatter.format(settlement.laborAmount)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatOptionalKrw(settlement.desiredInsuranceAmount)}
                    </TableCell>
                    <TableCell className="bg-primary/5 text-right whitespace-nowrap tabular-nums">
                      {settlement.desiredCashAmount === null ? (
                        <span className="text-muted-foreground">
                          {settlement.cashUnavailableReason ?? "계산 불가"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={
                              settlement.desiredCashAmount < 0
                                ? "font-semibold text-red-600 dark:text-red-400"
                                : "font-semibold"
                            }
                          >
                            {krwFormatter.format(settlement.desiredCashAmount)}
                          </span>
                          <Badge variant="outline">자동</Badge>
                          {settlement.desiredCashAmount < 0 ? (
                            <Badge variant="destructive">음수</Badge>
                          ) : null}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatOptionalText(settlement.bankAccount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {report.details.length === 0 ? (
        <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
          선택한 조건에 근무자별 상세 기록이 없습니다.
        </section>
      ) : (
        <section className="grid gap-3" aria-labelledby="labor-detail">
          <h2 id="labor-detail" className="text-lg font-semibold">
            일별 상세
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
