import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { requireHeadquartersUser } from "~/server/authz";

const overviewItems = [
  {
    title: "오늘 장부",
    description: "지점 입력 현황을 준비 중입니다.",
  },
  {
    title: "리포트",
    description: "아침 회의 리포트 진입점입니다.",
  },
  {
    title: "기준정보",
    description: "품목과 지점 기준을 관리할 공간입니다.",
    href: "/app/master-data/stores",
    actionLabel: "지점 관리",
  },
  {
    title: "사용자/권한",
    description: "본사와 지점장 계정 접근 범위를 관리합니다.",
    href: "/app/master-data/users",
    actionLabel: "사용자/권한 관리",
  },
];

export default async function DashboardPage() {
  const user = await requireHeadquartersUser();

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <PageHeader
        title="본사 홈"
        description="ERP Fish 본사 업무를 시작하는 기본 화면입니다."
      />
      <section
        className="grid gap-4 md:grid-cols-3"
        aria-label="본사 업무 요약"
      >
        {overviewItems.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {item.href ? (
                <Button asChild variant="outline">
                  <Link href={item.href}>{item.actionLabel}</Link>
                </Button>
              ) : (
                <p className="text-muted-foreground text-sm">
                  후속 스토리에서 상세 기능이 연결됩니다.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </HeadquartersShell>
  );
}
