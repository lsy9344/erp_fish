import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { HeadquartersExpenseClient } from "~/features/headquarters-expenses/components/headquarters-expense-client";
import { getHeadquartersExpensesForHeadquarters } from "~/features/headquarters-expenses/queries";
import { requireSettingsAccess } from "~/server/authz";

type HeadquartersExpensesPageProps = {
  searchParams: Promise<{
    month?: string | string[];
  }>;
};

export default async function HeadquartersExpensesPage({
  searchParams,
}: HeadquartersExpensesPageProps) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const view = await getHeadquartersExpensesForHeadquarters({ month });

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="본사 지출"
          description="지점 일일 장부와 분리된 본사 전용 지출을 등록하고 월별 현황을 확인합니다."
        />
        <form
          action="/app/headquarters-expenses"
          className="flex flex-wrap items-end gap-2"
        >
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="month">
              조회 월
            </label>
            <Input
              id="month"
              name="month"
              type="month"
              defaultValue={view.monthInput}
              className="h-9 w-36"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            조회
          </Button>
        </form>
      </div>

      <HeadquartersExpenseClient view={view} />
    </HeadquartersShell>
  );
}
