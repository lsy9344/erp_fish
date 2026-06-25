"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  createEcountProductFromLine,
  saveEcountProductAlias,
  saveEcountStoreAlias,
} from "~/features/ledger/ecount-supply-actions";
import { formatEcountDateNo } from "~/features/ledger/ecount-supply-mapping";
import {
  commitEcountSupplyImport,
  voidEcountSupplyImport,
} from "~/features/ledger/ecount-supply-commit";
import type { EcountImportBatchDetail } from "~/features/ledger/ecount-supply-queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type StoreOption = { id: string; name: string };
type ProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
};

type EcountSupplyDetailClientProps = {
  detail: EcountImportBatchDetail;
  storeOptions: StoreOption[];
  productOptions: ProductOption[];
};

const selectClassName =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-48 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function formatKrw(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatBusinessDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
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

export function EcountSupplyDetailClient({
  detail: initialDetail,
  storeOptions,
  productOptions,
}: EcountSupplyDetailClientProps) {
  const [detail, setDetail] = useState(initialDetail);
  const [storeSelections, setStoreSelections] = useState<
    Record<string, string>
  >({});
  const [productSelections, setProductSelections] = useState<
    Record<string, string>
  >({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  async function handleSaveStoreAlias(rawStoreName: string) {
    const storeId = storeSelections[rawStoreName] ?? "";

    if (!storeId) {
      toast.error("매핑할 지점을 선택해 주세요.");
      return;
    }

    const key = `store:${rawStoreName}`;
    setPendingKey(key);

    try {
      const result = await saveEcountStoreAlias({
        batchId: detail.id,
        rawName: rawStoreName,
        storeId,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setDetail(result.data.detail);
      toast.success("지점 매핑을 저장했습니다.");
    } catch {
      toast.error("지점 매핑 저장 중 오류가 발생했습니다.");
    } finally {
      setPendingKey(null);
    }
  }

  async function handleSaveProductAlias(
    rawProductName: string,
    productSpec: string,
  ) {
    const mapKey = `${rawProductName} ${productSpec}`;
    const productId = productSelections[mapKey] ?? "";

    if (!productId) {
      toast.error("매핑할 품목을 선택해 주세요.");
      return;
    }

    const key = `product:${mapKey}`;
    setPendingKey(key);

    try {
      const result = await saveEcountProductAlias({
        batchId: detail.id,
        rawName: rawProductName,
        rawSpec: productSpec,
        productId,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setDetail(result.data.detail);
      toast.success("품목 매핑을 저장했습니다.");
    } catch {
      toast.error("품목 매핑 저장 중 오류가 발생했습니다.");
    } finally {
      setPendingKey(null);
    }
  }

  async function handleCreateProduct(
    rawProductName: string,
    productSpec: string,
  ) {
    const mapKey = `${rawProductName} ${productSpec}`;
    const key = `create:${mapKey}`;
    setPendingKey(key);

    try {
      const result = await createEcountProductFromLine({
        batchId: detail.id,
        rawName: rawProductName,
        rawSpec: productSpec,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setDetail(result.data.detail);
      toast.success("새 품목을 만들어 매핑했습니다.");
    } catch {
      toast.error("새 품목 생성 중 오류가 발생했습니다.");
    } finally {
      setPendingKey(null);
    }
  }

  async function handleCommit() {
    setIsCommitting(true);

    try {
      const result = await commitEcountSupplyImport(detail.id);

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setDetail(result.data.detail);
      toast.success(`${result.data.committedLineCount}건을 반영했습니다.`);
    } catch {
      toast.error("반영 중 오류가 발생했습니다.");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleVoid() {
    const reason = voidReason.trim();

    if (!reason) {
      toast.error("취소 사유를 입력해 주세요.");
      return;
    }

    setIsVoiding(true);

    try {
      const result = await voidEcountSupplyImport(detail.id, reason);

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setDetail(result.data.detail);
      setVoidReason("");
      toast.success("업로드를 취소했습니다.");
    } catch {
      toast.error("취소 중 오류가 발생했습니다.");
    } finally {
      setIsVoiding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 요약 */}
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-lg font-semibold">
              {detail.fileName}
            </span>
            <Badge variant={statusBadgeVariant(detail.status)}>
              {detail.statusLabel}
            </Badge>
          </div>
          <span className="text-muted-foreground text-sm">
            영업일 {formatBusinessDate(detail.businessDate)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">총 건수</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {detail.lineCount}건
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">총 수량</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {formatQuantity(detail.totalQuantity)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">총 공급가액</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {formatKrw(detail.totalSupplyAmount)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">시트</dt>
            <dd className="text-foreground font-medium">{detail.sheetName}</dd>
          </div>
        </dl>
        {detail.errorMessage ? (
          <p className="text-destructive text-sm" role="alert">
            {detail.errorMessage}
          </p>
        ) : null}
        {detail.voidReason ? (
          <p className="text-muted-foreground text-sm">
            취소 사유: {detail.voidReason}
          </p>
        ) : null}
      </div>

      {/* 매핑 필요 */}
      {detail.unmappedStores.length > 0 ||
      detail.unmappedProducts.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-foreground text-lg font-semibold">매핑 필요</h2>

          {detail.unmappedStores.length > 0 ? (
            <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래처명(이카운트)</TableHead>
                    <TableHead className="text-right">건수</TableHead>
                    <TableHead>지점 매핑</TableHead>
                    <TableHead className="text-right">저장</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.unmappedStores.map((store) => {
                    const key = `store:${store.rawStoreName}`;

                    return (
                      <TableRow key={store.rawStoreName}>
                        <TableCell className="font-medium">
                          {store.rawStoreName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {store.lineCount}
                        </TableCell>
                        <TableCell>
                          <select
                            aria-label={`${store.rawStoreName} 지점 매핑`}
                            className={selectClassName}
                            value={storeSelections[store.rawStoreName] ?? ""}
                            onChange={(event) => {
                              const storeId = event.currentTarget.value;

                              setStoreSelections((current) => ({
                                ...current,
                                [store.rawStoreName]: storeId,
                              }));
                            }}
                          >
                            <option value="">지점 선택</option>
                            {storeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={pendingKey === key}
                            onClick={() =>
                              void handleSaveStoreAlias(store.rawStoreName)
                            }
                          >
                            저장
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {detail.unmappedProducts.length > 0 ? (
            <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>품목명(이카운트)</TableHead>
                    <TableHead>규격</TableHead>
                    <TableHead className="text-right">건수</TableHead>
                    <TableHead>앱 품목 매핑</TableHead>
                    <TableHead className="text-right">매핑 / 새 품목</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.unmappedProducts.map((product) => {
                    const mapKey = `${product.rawProductName} ${product.productSpec}`;
                    const key = `product:${mapKey}`;

                    return (
                      <TableRow key={mapKey}>
                        <TableCell className="font-medium">
                          {product.rawProductName}
                        </TableCell>
                        <TableCell>{product.productSpec || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {product.lineCount}
                        </TableCell>
                        <TableCell>
                          <select
                            aria-label={`${product.rawProductName} 품목 매핑`}
                            className={selectClassName}
                            value={productSelections[mapKey] ?? ""}
                            onChange={(event) => {
                              const productId = event.currentTarget.value;

                              setProductSelections((current) => ({
                                ...current,
                                [mapKey]: productId,
                              }));
                            }}
                          >
                            <option value="">품목 선택</option>
                            {productOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                                {option.spec ? ` · ${option.spec}` : ""}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={pendingKey === key}
                              onClick={() =>
                                void handleSaveProductAlias(
                                  product.rawProductName,
                                  product.productSpec,
                                )
                              }
                            >
                              저장
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={pendingKey === `create:${mapKey}`}
                              onClick={() =>
                                void handleCreateProduct(
                                  product.rawProductName,
                                  product.productSpec,
                                )
                              }
                            >
                              새 품목 생성
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 금액 불일치 */}
      {detail.amountMismatchLines.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-destructive text-lg font-semibold">
            금액 불일치
          </h2>
          <div className="border-destructive/40 bg-destructive/5 overflow-x-auto rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">행</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead>오류</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.amountMismatchLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="text-right tabular-nums">
                      {line.rowNumber}
                    </TableCell>
                    <TableCell>{line.productName}</TableCell>
                    <TableCell className="text-destructive">
                      {line.errorMessage ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {/* 지점별 출고/입고 내역 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">지점별 내역</h2>
        {detail.storeGroups.map((group) => (
          <div
            key={group.rawStoreName}
            className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground font-medium">
                {group.storeName ?? `${group.rawStoreName} (미매핑)`}
              </span>
              <div className="text-muted-foreground flex flex-wrap gap-4 text-sm tabular-nums">
                <span>{group.lineCount}건</span>
                <span>수량 {formatQuantity(group.totalQuantity)}</span>
                <span>공급가액 {formatKrw(group.totalSupplyAmount)}</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>일자-No.</TableHead>
                    <TableHead>품목</TableHead>
                    <TableHead>규격</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">공급가액</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{formatEcountDateNo(line.dateNo)}</TableCell>
                      <TableCell className="font-medium">
                        {line.productName}
                      </TableCell>
                      <TableCell>{line.productSpec || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(line.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKrw(line.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKrw(line.supplyAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(line.status)}>
                          {line.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
        {detail.storeGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            표시할 내역이 없습니다.
          </p>
        ) : null}
      </section>

      {/* 반영 / 취소 */}
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!detail.canCommit || isCommitting}
            onClick={() => void handleCommit()}
          >
            {isCommitting ? "반영 중..." : "본사 장부에 반영"}
          </Button>
          {!detail.canCommit && detail.status !== "COMMITTED" ? (
            <span className="text-muted-foreground text-sm">
              모든 지점/품목 매핑을 마치면 반영할 수 있습니다.
            </span>
          ) : null}
        </div>

        {detail.canVoid ? (
          <div className="border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor="ecount-void-reason">취소 사유</FieldLabel>
                <Input
                  id="ecount-void-reason"
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.currentTarget.value)}
                  placeholder="취소 사유를 입력해 주세요."
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={isVoiding}
                onClick={() => void handleVoid()}
              >
                {isVoiding ? "취소 중..." : "업로드 취소"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
