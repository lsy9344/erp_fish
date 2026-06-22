"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { formatKrw } from "~/lib/format";
import {
  commitEcountLedgerPurchases,
  previewEcountLedgerPurchases,
  type EcountPurchasePreviewResult,
} from "~/features/ledger/ecount-purchase-actions";

type EcountPurchaseUploadClientProps = {
  ledgerId: string;
  storeName: string;
  closingDate: string;
  onCommitted?: () => void;
};

export function EcountPurchaseUploadClient({
  ledgerId,
  storeName,
  closingDate,
  onCommitted,
}: EcountPurchaseUploadClientProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<EcountPurchasePreviewResult | null>(
    null,
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsPreviewing(true);
    setPreview(null);

    const formData = new FormData();

    formData.append("file", file);

    const result = await previewEcountLedgerPurchases(ledgerId, formData);

    setIsPreviewing(false);

    if (!result.ok) {
      const messages = Object.values(result.error.fieldErrors ?? {}).flat();

      toast.error(
        messages.length > 0
          ? messages[0]
          : result.error.message ?? "파일 오류가 발생했습니다.",
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setPreview(result.data);
  }

  async function handleCommit() {
    if (!preview) {
      return;
    }

    setIsCommitting(true);

    const result = await commitEcountLedgerPurchases(
      ledgerId,
      preview.importSessionId,
    );

    setIsCommitting(false);

    if (!result.ok) {
      toast.error(result.error.message ?? "저장에 실패했습니다.");
      return;
    }

    toast.success(
      `이카운트 매입 ${result.data.savedCount}건을 가져왔습니다.`,
    );
    setPreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    onCommitted?.();
  }

  function handleReset() {
    setPreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {storeName} · {closingDate}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
          disabled={isPreviewing || isCommitting}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPreviewing || isCommitting}
          onClick={() => fileInputRef.current?.click()}
        >
          {isPreviewing ? "파일 읽는 중…" : "이카운트 엑셀 선택"}
        </Button>
      </div>

      {preview && (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              미리보기 — {preview.sheetName} · {preview.matchedRowCount}건
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isCommitting}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCommit}
                disabled={isCommitting}
              >
                {isCommitting ? "저장 중…" : "장부에 반영"}
              </Button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-1 pr-3 font-normal">품목</th>
                <th className="pb-1 pr-3 font-normal text-right">수량</th>
                <th className="pb-1 font-normal text-right">단가</th>
              </tr>
            </thead>
            <tbody>
              {preview.purchases.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-1 pr-3">
                    {row.productName}
                    {row.productSpec !== "규격 없음" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        [{row.productSpec}]
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right">{row.quantity}개</td>
                  <td className="py-1 text-right">
                    {formatKrw(Number(row.unitPrice))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
