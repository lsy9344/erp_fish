"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon } from "lucide-react";

import type { AuditHistoryTargetTypeFilter } from "~/features/audit/audit-format";
import type {
  AuditHistoryActorOption,
  AuditHistoryFilters,
  AuditHistoryItem,
  AuditHistoryTargetTypeOption,
} from "~/features/audit/audit-queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const historyPath = "/app/master-data/history";

type ChangeHistoryClientProps = {
  history: AuditHistoryItem[];
  actorOptions: AuditHistoryActorOption[];
  visibleTargetTypeOptions: AuditHistoryTargetTypeOption[];
  filters: AuditHistoryFilters;
};

function formatChangedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function normalizeTargetType(
  value: string,
  visibleTargetTypeOptions: readonly AuditHistoryTargetTypeOption[],
): AuditHistoryTargetTypeFilter {
  return visibleTargetTypeOptions.some((option) => option.value === value)
    ? (value as AuditHistoryTargetTypeFilter)
    : "all";
}

export function ChangeHistoryClient({
  history,
  actorOptions,
  visibleTargetTypeOptions,
  filters,
}: ChangeHistoryClientProps) {
  const router = useRouter();
  const [selectedHistory, setSelectedHistory] =
    useState<AuditHistoryItem | null>(null);
  const displayedActorOptions =
    filters.actorId === "all" ||
    actorOptions.some((option) => option.id === filters.actorId)
      ? actorOptions
      : [{ id: filters.actorId, label: filters.actorId }, ...actorOptions];

  function pushFilters(next: Partial<AuditHistoryFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.targetType !== "all") {
      params.set("targetType", merged.targetType);
    }

    if (merged.actorId !== "all") {
      params.set("actorId", merged.actorId);
    }

    if (merged.from) {
      params.set("from", merged.from);
    }

    if (merged.to) {
      params.set("to", merged.to);
    }

    router.push(`${historyPath}${params.size ? `?${params.toString()}` : ""}`);
  }

  function handleDateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fromValue = formData.get("from");
    const toValue = formData.get("to");

    pushFilters({
      from: typeof fromValue === "string" ? fromValue : "",
      to: typeof toValue === "string" ? toValue : "",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleDateSubmit}
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <Field>
          <FieldLabel htmlFor="audit-target-type-filter">
            대상 유형 필터
          </FieldLabel>
          <Select
            value={filters.targetType}
            onValueChange={(value) =>
              pushFilters({
                targetType: normalizeTargetType(
                  value,
                  visibleTargetTypeOptions,
                ),
              })
            }
          >
            <SelectTrigger id="audit-target-type-filter" className="w-40">
              <SelectValue placeholder="대상 유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">전체</SelectItem>
                {visibleTargetTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-actor-filter">변경자 필터</FieldLabel>
          <Select
            value={filters.actorId}
            onValueChange={(value) => pushFilters({ actorId: value || "all" })}
          >
            <SelectTrigger id="audit-actor-filter" className="w-40">
              <SelectValue placeholder="변경자" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">전체</SelectItem>
                {displayedActorOptions.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-from-filter">시작일</FieldLabel>
          <Input
            id="audit-from-filter"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-to-filter">종료일</FieldLabel>
          <Input
            id="audit-to-filter"
            name="to"
            type="date"
            defaultValue={filters.to}
          />
        </Field>
        <Button type="submit" variant="outline">
          필터 적용
        </Button>
      </form>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>변경 시각</TableHead>
              <TableHead>변경자</TableHead>
              <TableHead>대상 유형</TableHead>
              <TableHead>대상 이름</TableHead>
              <TableHead>변경 유형</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="tabular-nums">
                  {formatChangedAt(item.createdAt)}
                </TableCell>
                <TableCell>{item.actorName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.targetTypeLabel}</Badge>
                </TableCell>
                <TableCell className="font-medium">{item.targetName}</TableCell>
                <TableCell>{item.actionLabel}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedHistory(item)}
                    >
                      <EyeIcon data-icon="inline-start" />
                      상세 보기
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {history.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 변경 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(selectedHistory)}
        onOpenChange={(open) => !open && setSelectedHistory(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>변경 상세</DialogTitle>
            <DialogDescription>
              변경 전 값과 변경 후 값을 구분해서 확인합니다.
            </DialogDescription>
          </DialogHeader>
          {selectedHistory ? (
            <div className="flex flex-col gap-4">
              {selectedHistory.changeSummaryText !== "-" ? (
                <section className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">변경 요약</h3>
                    <span className="text-muted-foreground text-xs">
                      기존 값 → 변경된 값
                    </span>
                  </div>
                  <pre className="bg-muted max-h-56 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
                    {selectedHistory.changeSummaryText}
                  </pre>
                </section>
              ) : null}
              {selectedHistory.reasonText !== "-" ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">사유</h3>
                  <p className="bg-muted max-h-40 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
                    {selectedHistory.reasonText}
                  </p>
                </section>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">변경 전</h3>
                  <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
                    {selectedHistory.beforeText}
                  </pre>
                </section>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">변경 후</h3>
                  <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
                    {selectedHistory.afterText}
                  </pre>
                </section>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
