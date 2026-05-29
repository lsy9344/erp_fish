import Link from "next/link";

import { Button } from "~/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-card p-5 text-card-foreground">
        <h1 className="text-xl font-semibold tracking-normal">접근 권한이 없습니다.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          접근 가능한 업무 화면으로 돌아가 주세요.
        </p>
        <Button asChild className="mt-5 min-h-11">
          <Link href="/app">업무 화면으로 돌아가기</Link>
        </Button>
      </section>
    </main>
  );
}
