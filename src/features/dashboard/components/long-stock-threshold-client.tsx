"use client";

import { useState, type FormEvent } from "react";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import type { FieldErrors } from "~/lib/action-result";
import { upsertLongStockThresholdSetting } from "../long-stock-threshold-actions";
import type { LongStockThresholdsScreenData } from "../long-stock-threshold-queries";

type LongStockThresholdClientProps = {
  data: LongStockThresholdsScreenData;
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function LongStockThresholdClient({
  data,
}: LongStockThresholdClientProps) {
  const [settings, setSettings] = useState(data.settings);
  const [category, setCategory] = useState("");
  const [thresholdDays, setThresholdDays] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});

    try {
      const result = await upsertLongStockThresholdSetting({
        category,
        thresholdDays,
        isActive: true,
        reason,
      });

      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        toast.error(result.error.message);
        return;
      }

      const saved = result.data;
      setSettings((current) => {
        const others = current.filter((s) => s.category !== saved.category);
        return [...others, saved].sort((a, b) =>
          a.category.localeCompare(b.category, "ko-KR"),
        );
      });
      setCategory("");
      setThresholdDays("");
      setReason("");
      toast.success("장기재고 기준일을 저장했습니다.");
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function editSetting(targetCategory: string, days: number) {
    setCategory(targetCategory);
    setThresholdDays(String(days));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>품목군별 기준일</CardTitle>
          <CardDescription>
            품목군이 며칠 이상 남으면 장기재고로 볼지 설정합니다. 기준이 없는
            품목군은 &quot;기준 확인 필요&quot;로 두고 장기재고 알림에서
            제외합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(fieldErrors.category)}>
                <FieldLabel htmlFor="long-stock-category">품목군</FieldLabel>
                <Input
                  id="long-stock-category"
                  value={category}
                  onChange={(event) => setCategory(event.currentTarget.value)}
                  placeholder="예: 냉동, 생물"
                  className="min-h-11"
                />
                {fieldErrors.category ? (
                  <FieldError>{fieldErrors.category[0]}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={Boolean(fieldErrors.thresholdDays)}>
                <FieldLabel htmlFor="long-stock-days">
                  기준일 (일 이상)
                </FieldLabel>
                <Input
                  id="long-stock-days"
                  inputMode="numeric"
                  value={thresholdDays}
                  onChange={(event) =>
                    setThresholdDays(event.currentTarget.value)
                  }
                  placeholder="예: 30"
                  className="min-h-11 tabular-nums"
                />
                {fieldErrors.thresholdDays ? (
                  <FieldError>{fieldErrors.thresholdDays[0]}</FieldError>
                ) : null}
              </Field>
            </div>
            <Field data-invalid={Boolean(fieldErrors.reason)}>
              <FieldLabel htmlFor="long-stock-reason">변경 사유</FieldLabel>
              <Input
                id="long-stock-reason"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="변경 사유를 입력해 주세요."
                className="min-h-11"
              />
              {fieldErrors.reason ? (
                <FieldError>{fieldErrors.reason[0]}</FieldError>
              ) : null}
            </Field>
            <div>
              <Button type="submit" disabled={isSaving} className="min-h-11">
                <SaveIcon data-icon="inline-start" />
                {isSaving ? "저장 중..." : "기준일 저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>품목군</TableHead>
              <TableHead className="text-right">기준일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>변경자</TableHead>
              <TableHead>변경 시각</TableHead>
              <TableHead className="text-right">수정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map((setting) => (
              <TableRow key={setting.id}>
                <TableCell className="font-medium">
                  {setting.category}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {setting.thresholdDays}일
                </TableCell>
                <TableCell>{setting.statusLabel}</TableCell>
                <TableCell>{setting.updatedByName}</TableCell>
                <TableCell className="tabular-nums">
                  {formatUpdatedAt(setting.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      editSetting(setting.category, setting.thresholdDays)
                    }
                  >
                    불러오기
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {settings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  등록된 기준일이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {data.unconfiguredCategories.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기준 확인 필요 품목군</CardTitle>
            <CardDescription>
              품목 마스터에는 있으나 기준일이 없는 품목군입니다. 기준을 정하기
              전에는 장기재고 알림 대상에서 제외됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.unconfiguredCategories.map((unconfigured) => (
                <button
                  key={unconfigured}
                  type="button"
                  onClick={() => setCategory(unconfigured)}
                  className="bg-muted hover:bg-muted/70 rounded-md px-2 py-1 text-sm"
                >
                  {unconfigured}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
