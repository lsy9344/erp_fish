"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";

import {
  uploadInventoryOpeningSnapshots,
  type InventoryOpeningUploadResult,
} from "~/features/inventory/opening-import-actions";
import { previewEcountSupplyUpload } from "~/features/ledger/ecount-supply-actions";
import type { EcountImportBatchListItem } from "~/features/ledger/ecount-supply-queries";
import type { FieldErrors } from "~/lib/action-result";
import { formatQuantityValue } from "~/lib/format";
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
  const inventoryFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isInventoryUploading, setIsInventoryUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [inventoryFieldErrors, setInventoryFieldErrors] = useState<FieldErrors>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [inventoryFormError, setInventoryFormError] = useState<string | null>(
    null,
  );
  const [inventoryResult, setInventoryResult] =
    useState<InventoryOpeningUploadResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const selectedFileName = fileInputRef.current?.files?.[0]?.name;

      if (selectedFileName) {
        formData.set("fileName", selectedFileName);
      }

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

  async function handleInventorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInventoryUploading(true);
    setInventoryFieldErrors({});
    setInventoryFormError(null);
    setInventoryResult(null);

    try {
      const formData = new FormData(event.currentTarget);
      const selectedFileName = inventoryFileInputRef.current?.files?.[0]?.name;

      if (selectedFileName) {
        formData.set("inventoryFileName", selectedFileName);
      }

      const result = await uploadInventoryOpeningSnapshots(formData);

      if (!result.ok) {
        setInventoryFormError(result.error.message);
        setInventoryFieldErrors(result.error.fieldErrors ?? {});
        return;
      }

      if (inventoryFileInputRef.current) {
        inventoryFileInputRef.current.value = "";
      }

      setInventoryResult(result.data);
      toast.success(`재고 스냅샷 ${result.data.importedCount}건을 반영했습니다.`);
      router.refresh();
    } catch {
      setInventoryFormError("재고 엑셀 파일을 업로드하는 중 오류가 발생했습니다.");
    } finally {
      setIsInventoryUploading(false);
    }
  }

  const fileError = fieldErrors.file?.[0];
  const inventoryFileError = inventoryFieldErrors.file?.[0];

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

      <section className="flex flex-col gap-3" aria-label="재고 파일 업로드">
        <h2 className="text-foreground text-lg font-semibold">
          재고 파일 업로드
        </h2>
        <form
          onSubmit={handleInventorySubmit}
          className="bg-card flex flex-col gap-4 rounded-lg border p-4 shadow-sm sm:flex-row sm:items-end"
          noValidate
        >
          <Field data-invalid={Boolean(inventoryFileError)} className="flex-1">
            <FieldLabel htmlFor="inventory-opening-upload-file">
              재고 엑셀 파일
            </FieldLabel>
            <Input
              ref={inventoryFileInputRef}
              id="inventory-opening-upload-file"
              name="inventoryFile"
              type="file"
              accept=".xlsx"
              aria-invalid={Boolean(inventoryFileError)}
              aria-describedby={
                inventoryFileError
                  ? "inventory-opening-upload-file-error"
                  : undefined
              }
            />
            {inventoryFileError ? (
              <FieldError id="inventory-opening-upload-file-error">
                {inventoryFileError}
              </FieldError>
            ) : null}
          </Field>
          <Button type="submit" disabled={isInventoryUploading}>
            <UploadIcon data-icon="inline-start" />
            {isInventoryUploading ? "업로드 중..." : "재고 업로드"}
          </Button>
        </form>

        {inventoryFormError ? (
          <p className="text-destructive text-sm" role="alert">
            {inventoryFormError}
          </p>
        ) : null}

        {inventoryResult ? (
          <dl className="bg-muted/40 grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">처리 행</dt>
              <dd className="font-medium tabular-nums">
                {inventoryResult.importedCount}건
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">생성 / 갱신 / 동일</dt>
              <dd className="font-medium tabular-nums">
                {inventoryResult.createdCount} / {inventoryResult.updatedCount} /{" "}
                {inventoryResult.unchangedCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">기준월</dt>
              <dd className="font-medium break-words tabular-nums">
                {inventoryResult.yearMonths.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">지점</dt>
              <dd className="font-medium tabular-nums">
                {inventoryResult.storeCount}곳
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">총 수량</dt>
              <dd className="font-medium tabular-nums">
                {formatQuantityValue(inventoryResult.totalQuantity)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">재고 금액</dt>
              <dd className="font-medium tabular-nums">
                {formatKrw(inventoryResult.totalInventoryAmount)}
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

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
