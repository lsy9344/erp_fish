"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { previewEcountSupplyUpload } from "~/features/ledger/ecount-supply-actions";
import type { EcountImportBatchListItem } from "~/features/ledger/ecount-supply-queries";
import type { FieldErrors } from "~/lib/action-result";
import { Badge } from "~/components/ui/badge";
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

type EcountSupplyUploadClientProps = {
  batches: EcountImportBatchListItem[];
};

function formatKrw(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "COMMITTED":
      return "secondary" as const;
    case "READY":
      return "default" as const;
    case "FAILED":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export function EcountSupplyUploadClient({
  batches,
}: EcountSupplyUploadClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await previewEcountSupplyUpload(formData);

      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (result.data.duplicate) {
        toast.info("이미 업로드된 파일입니다. 기존 업로드로 이동합니다.");
      }

      router.push(`/app/ecount-imports/${result.data.batchId}`);
    } catch {
      setFormError("엑셀 파일을 업로드하는 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  }

  const fileError = fieldErrors.file?.[0];

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="bg-card flex flex-col gap-4 rounded-lg border p-4 shadow-sm sm:flex-row sm:items-end"
        noValidate
      >
        <Field data-invalid={Boolean(fileError)} className="flex-1">
          <FieldLabel htmlFor="ecount-upload-file">
            이카운트 엑셀 파일
          </FieldLabel>
          <Input
            ref={fileInputRef}
            id="ecount-upload-file"
            name="file"
            type="file"
            accept=".xlsx"
            aria-invalid={Boolean(fileError)}
            aria-describedby={
              fileError ? "ecount-upload-file-error" : undefined
            }
          />
          {fileError ? (
            <FieldError id="ecount-upload-file-error">{fileError}</FieldError>
          ) : null}
        </Field>
        <Button type="submit" disabled={isUploading}>
          <UploadIcon data-icon="inline-start" />
          {isUploading ? "업로드 중..." : "업로드"}
        </Button>
      </form>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-foreground text-lg font-semibold">최근 업로드</h2>
        <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>파일명</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">건수</TableHead>
                <TableHead className="text-right">총 공급가액</TableHead>
                <TableHead>업로드자</TableHead>
                <TableHead>업로드일시</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/app/ecount-imports/${batch.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {batch.fileName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(batch.status)}>
                      {batch.statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {batch.lineCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKrw(batch.totalSupplyAmount)}
                  </TableCell>
                  <TableCell>{batch.uploadedByName ?? "-"}</TableCell>
                  <TableCell>{formatDateTime(batch.createdAt)}</TableCell>
                </TableRow>
              ))}
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-8 text-center"
                  >
                    업로드한 이카운트 파일이 없습니다.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
