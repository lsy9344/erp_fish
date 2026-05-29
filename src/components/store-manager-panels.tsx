type StorePreparationPanelProps = {
  title: string;
  storeName: string;
  description: string;
};

export function NoActiveStoreMessage() {
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <h1 className="text-xl font-semibold tracking-normal">지점 배정 확인 필요</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        배정된 활성 지점이 없습니다. 본사에 문의해 주세요.
      </p>
    </section>
  );
}

export function StorePreparationPanel({
  title,
  storeName,
  description,
}: StorePreparationPanelProps) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <p className="text-sm text-muted-foreground">현재 지점</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal">{storeName}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          저장 기능은 후속 장부 입력 스토리에서 연결됩니다.
        </p>
      </section>
    </>
  );
}
