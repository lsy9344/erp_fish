"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { createCorrectionRecord } from "~/features/corrections/actions";
import type {
  CorrectionRecordListItem,
  CorrectionTargetOption,
} from "~/features/corrections/types";
import type { FieldErrors } from "~/lib/action-result";

type CorrectionPanelProps = {
  ledgerId: string;
  targetOptions: CorrectionTargetOption[];
  records: CorrectionRecordListItem[];
  createAction: typeof createCorrectionRecord;
};

function formatCorrectionValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const record = value as { value?: unknown; label?: unknown };
  const label = typeof record.label === "string" ? record.label : "";
  const displayValue =
    typeof record.value === "number" || typeof record.value === "string"
      ? String(record.value)
      : "-";

  return label ? `${label}: ${displayValue}` : displayValue;
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function CorrectionPanel({
  ledgerId,
  targetOptions,
  records,
  createAction,
}: CorrectionPanelProps) {
  const router = useRouter();
  const correctedValueInputRef = useRef<HTMLInputElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const [selectedTargetIndex, setSelectedTargetIndex] = useState("0");
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const selectedTarget = targetOptions[Number(selectedTargetIndex)] ?? null;

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors["correctedValue.value"]?.length) {
        correctedValueInputRef.current?.focus();
        return;
      }

      if (errors.reason?.length) {
        reasonInputRef.current?.focus();
      }
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!selectedTarget) {
      setFormError("정정 대상을 확인해 주세요.");
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);
    setResultMessage(null);

    try {
      const result = await createAction({
        ledgerId,
        targetType: selectedTarget.targetType,
        targetId: selectedTarget.targetId,
        fieldKey: selectedTarget.fieldKey,
        correctedValue: {
          kind: selectedTarget.originalValue.kind,
          value: correctedValue,
        },
        reason,
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        return;
      }

      setCorrectedValue("");
      setReason("");
      setResultMessage("정정 기록이 저장됐습니다.");
      router.refresh();
    } catch {
      setFormError("정정 기록 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const correctedValueError = fieldErrors["correctedValue.value"]?.[0];
  const reasonError = fieldErrors.reason?.[0];

  return (
    <section
      className="rounded-lg border p-4"
      aria-labelledby="correction-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="correction-title" className="text-lg font-semibold">
          정정 기록
        </h2>
        <p className="text-muted-foreground text-sm">
          원본 장부 값은 보존하고 정정 이력만 추가합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="correction-target">정정 대상</FieldLabel>
          <select
            id="correction-target"
            value={selectedTargetIndex}
            onChange={(event) =>
              setSelectedTargetIndex(event.currentTarget.value)
            }
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            {targetOptions.map((option, index) => (
              <option
                key={`${option.targetType}-${option.targetId}-${option.fieldKey}`}
                value={String(index)}
              >
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field data-invalid={Boolean(correctedValueError)}>
          <FieldLabel htmlFor="correction-value">정정값</FieldLabel>
          <Input
            ref={correctedValueInputRef}
            id="correction-value"
            value={correctedValue}
            onChange={(event) => setCorrectedValue(event.currentTarget.value)}
            inputMode={
              selectedTarget?.originalValue.kind === "text" ? "text" : "numeric"
            }
            aria-invalid={Boolean(correctedValueError)}
            aria-describedby={
              correctedValueError ? "correction-value-error" : undefined
            }
          />
          {correctedValueError ? (
            <FieldError id="correction-value-error">
              {correctedValueError}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(reasonError)} className="md:col-span-2">
          <FieldLabel htmlFor="correction-reason">정정 사유</FieldLabel>
          <Input
            ref={reasonInputRef}
            id="correction-reason"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            aria-invalid={Boolean(reasonError)}
            aria-describedby={
              reasonError ? "correction-reason-error" : undefined
            }
          />
          {reasonError ? (
            <FieldError id="correction-reason-error">{reasonError}</FieldError>
          ) : null}
        </Field>
        <div className="md:col-span-4">
          <Button type="submit" disabled={isSaving || !selectedTarget}>
            {isSaving ? "저장 중..." : "정정 기록 저장"}
          </Button>
        </div>
      </form>

      {formError ? (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {formError}
        </p>
      ) : null}
      {resultMessage ? (
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          {resultMessage}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>대상</TableHead>
              <TableHead>원본값</TableHead>
              <TableHead>이전 반영값</TableHead>
              <TableHead>정정값</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>작성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.targetLabel}</TableCell>
                <TableCell>
                  {formatCorrectionValue(record.originalValue)}
                </TableCell>
                <TableCell>
                  {formatCorrectionValue(record.previousAppliedValue)}
                </TableCell>
                <TableCell>
                  {formatCorrectionValue(record.correctedValue)}
                </TableCell>
                <TableCell>{record.reason}</TableCell>
                <TableCell>
                  {formatCreatedAt(record.createdAt)} ·{" "}
                  {record.createdBy.name ?? record.createdBy.email ?? "본사"}
                </TableCell>
              </TableRow>
            ))}
            {records.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-6 text-center"
                >
                  정정 기록이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
