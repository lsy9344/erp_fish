import { type SalesPlanLossContextItem } from "~/features/sales-plan/types";

type SalesPlanLossContextProps = {
  items: SalesPlanLossContextItem[];
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

// 손실 입력 화면에서 개점 전 판매가 계획을 손실액 산정 기준으로 보여준다.
// 실제 판매/회수액을 입력하면 저장 시 계획 판매가와의 차액이 손실액이 된다.
export function SalesPlanLossContext({ items }: SalesPlanLossContextProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="bg-card text-card-foreground rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">개점 전 판매가 계획 (참고)</p>
        <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs font-medium">
          추정
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        손실액 산정 기준입니다. 실제 판매/회수액을 입력하면 계획 판매가와의 차액을 손실액으로 저장합니다.
      </p>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div
            key={item.productId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <span>{item.productName}</span>
            <span className="tabular-nums">
              계획 판매가 {formatKrw(item.plannedUnitPrice)}
              <span className="text-muted-foreground"> · 추정</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
