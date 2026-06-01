import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { CorrectionRecordListItem } from "~/features/corrections/types";

type CorrectionReadonlySummaryProps = {
  records: CorrectionRecordListItem[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export function CorrectionReadonlySummary({
  records,
}: CorrectionReadonlySummaryProps) {
  if (records.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border p-4"
      aria-labelledby="readonly-corrections-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="readonly-corrections-title" className="text-lg font-semibold">
          본사 정정 이력
        </h2>
        <p className="text-muted-foreground text-sm">
          원본 값은 수정할 수 없으며, 최신 정정 반영값과 이력을 읽기 전용으로 확인합니다.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>대상</TableHead>
              <TableHead>원본값</TableHead>
              <TableHead>이전 반영값</TableHead>
              <TableHead>정정 반영값</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>작성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.targetLabel}</TableCell>
                <TableCell>{formatCorrectionValue(record.originalValue)}</TableCell>
                <TableCell>
                  {formatCorrectionValue(record.previousAppliedValue)}
                </TableCell>
                <TableCell>{formatCorrectionValue(record.correctedValue)}</TableCell>
                <TableCell>{record.reason}</TableCell>
                <TableCell>
                  {dateTimeFormatter.format(new Date(record.createdAt))} ·{" "}
                  {record.createdBy.name ?? record.createdBy.email ?? "본사"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function formatCorrectionValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const correctionValue = value as { kind?: unknown; value?: unknown };

  if (typeof correctionValue.value === "number") {
    return correctionValue.kind === "money"
      ? new Intl.NumberFormat("ko-KR", {
          style: "currency",
          currency: "KRW",
          maximumFractionDigits: 0,
        }).format(correctionValue.value)
      : String(correctionValue.value);
  }

  return typeof correctionValue.value === "string"
    ? correctionValue.value
    : "-";
}
