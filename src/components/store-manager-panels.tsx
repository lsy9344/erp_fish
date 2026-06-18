type StorePreparationPanelProps = {
  title: string;
  storeName: string;
  description: string;
};

export function NoActiveStoreMessage() {
  return (
    <section className="bg-card text-card-foreground rounded-lg border p-5">
      <h1 className="text-xl font-semibold tracking-normal">
        지점 배정 확인 필요
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
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
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      <section className="bg-card text-card-foreground rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">현재 지점</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal">
          {storeName}
        </h2>
        <p className="text-muted-foreground mt-3 text-sm">
          저장 기능은 후속 장부 입력 스토리에서 연결됩니다.
        </p>
      </section>
    </>
  );
}
