import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("과거 기간의 직원 일급을 이미 금액이 있는 근무기록에도 적용한다", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@example.com" },
  });
  const employee = await prisma.employee.create({
    data: {
      name: `과거일급-${crypto.randomUUID().slice(0, 8)}`,
      hireDate: new Date("2026-07-01T00:00:00.000Z"),
      dailyWage: 120_000,
    },
  });
  const store = await prisma.store.create({
    data: { name: `과거일급지점-${employee.id}`, updatedById: actor.id },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: new Date("2026-07-03T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
      createdById: actor.id,
      updatedById: actor.id,
      ledgerLaborItems: {
        create: {
          employeeId: employee.id,
          workerName: employee.name,
          amount: 120_000,
          createdById: actor.id,
          updatedById: actor.id,
        },
      },
    },
    include: { ledgerLaborItems: true },
  });
  const otherEmployee = await prisma.employee.create({
    data: {
      name: employee.name,
      hireDate: employee.hireDate,
      dailyWage: 80_000,
    },
  });
  await prisma.ledgerLaborItem.createMany({
    data: [
      { employeeId: otherEmployee.id, amount: 80_000 },
      { employeeId: null, amount: 70_000 },
      { employeeId: employee.id, amount: 120_000 },
    ].map((item) => ({
      ...item,
      dailyLedgerId: ledger.id,
      workerName: employee.name,
      createdById: actor.id,
      updatedById: actor.id,
    })),
  });
  const otherLedgers = [];
  for (const [date, status] of [
    ["2026-07-01", "IN_REVIEW"],
    ["2026-07-02", "IN_REVIEW"],
    ["2026-07-04", "IN_PROGRESS"],
  ] as const) {
    otherLedgers.push(
      await prisma.dailyLedger.create({
        data: {
          storeId: store.id,
          closingDate: new Date(`${date}T00:00:00.000Z`),
          status,
          createdById: actor.id,
          updatedById: actor.id,
          ledgerLaborItems: {
            create: {
              employeeId: employee.id,
              workerName: employee.name,
              amount: 120_000,
              createdById: actor.id,
              updatedById: actor.id,
            },
          },
        },
      }),
    );
  }
  const ledgerIds = [ledger.id, ...otherLedgers.map(({ id }) => id)];

  try {
    await page.goto("/login");
    await page.getByLabel(/이메일|로그인 식별자/).fill("owner@example.com");
    await page.getByLabel("비밀번호").fill("correct-password");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/app\//);
    await page.goto("/app/labor/employees");
    await page.getByLabel("직원 검색").fill(employee.name);
    await page
      .getByRole("row", { name: new RegExp(employee.name) })
      .filter({ hasText: "120,000" })
      .getByRole("button", { name: "수정", exact: true })
      .click();
    await page.getByLabel("하루 인건비", { exact: true }).fill("150000");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("직원 정보를 수정했습니다.")).toBeVisible();
    // 기본 일급만 저장하면 기존 금액은 유지한다.
    expect(
      await prisma.ledgerLaborItem.findUniqueOrThrow({
        where: { id: ledger.ledgerLaborItems[0]!.id },
      }),
    ).toMatchObject({ amount: 120_000 });

    await page
      .getByRole("row", { name: new RegExp(employee.name) })
      .filter({ hasText: "150,000" })
      .getByRole("button", { name: "수정", exact: true })
      .click();
    await page.getByLabel("일급 적용 범위").click();
    await page.getByRole("option", { name: "과거 기간에도 적용" }).click();
    await page.getByLabel("과거 적용 시작일").fill("2026-07-02");
    await page.getByLabel("과거 적용 종료일").fill("2026-07-03");
    await page
      .getByLabel("과거 일급 변경 사유")
      .fill("7월 일급 입력 오류 정정");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      page.getByText(/선택한 과거 기간의 근무기록 3건을 변경했습니다/),
    ).toBeVisible();

    expect(
      await prisma.ledgerLaborItem.findUniqueOrThrow({
        where: { id: ledger.ledgerLaborItems[0]!.id },
      }),
    ).toMatchObject({ amount: 150_000 });
    const records = await prisma.dailyLedger.findMany({
      where: { id: { in: ledgerIds } },
      orderBy: { closingDate: "asc" },
      include: { ledgerLaborItems: { where: { employeeId: employee.id } } },
    });
    expect(
      records.map((item) => item.ledgerLaborItems.map(({ amount }) => amount)),
    ).toEqual([[120_000], [150_000], [150_000, 150_000], [120_000]]);
    expect(records.map(({ version }) => version)).toEqual([
      otherLedgers[0]!.version,
      otherLedgers[1]!.version + 1,
      ledger.version + 1,
      otherLedgers[2]!.version,
    ]);
    expect(
      (
        await prisma.ledgerLaborItem.findMany({
          where: {
            dailyLedgerId: ledger.id,
            OR: [{ employeeId: otherEmployee.id }, { employeeId: null }],
          },
          orderBy: { amount: "asc" },
        })
      ).map(({ amount }) => amount),
    ).toEqual([70_000, 80_000]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: ledger.id, action: "ledger.employee_wage.updated" },
    });
    expect(audit.after).toMatchObject({
      closedEdit: true,
      ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    });
    expect(audit.reason).toBe("7월 일급 입력 오류 정정");
    await page.goto(
      `/app/reports/labor?from=2026-07-02&to=2026-07-03&storeId=${store.id}`,
    );
    // 변경한 3건 450,000원 + 다른 직원 80,000원 + 미연결 70,000원.
    await expect(
      page.getByText("₩600,000", { exact: true }).first(),
    ).toBeVisible();

    for (const [action, message] of [
      [
        "LEDGER_CLOSED_EDIT",
        "선택한 기간에 마감된 장부가 있습니다. 마감 장부 수정 권한이 필요합니다.",
      ],
      ["LEDGER_EDIT", "과거 일급 변경에는 장부 수정 권한이 필요합니다."],
    ] as const) {
      const permission = await prisma.permissionProfileAction.findFirstOrThrow({
        where: { profile: { code: "OWNER" }, action },
        select: { profileId: true, action: true },
      });
      await prisma.permissionProfileAction.delete({
        where: { profileId_action: permission },
      });
      try {
        await page.goto("/app/labor/employees");
        await page.getByLabel("직원 검색").fill(employee.name);
        await page
          .getByRole("row", { name: new RegExp(employee.name) })
          .filter({ hasText: "150,000" })
          .getByRole("button", { name: "수정", exact: true })
          .click();
        await page.getByLabel("하루 인건비", { exact: true }).fill("180000");
        await page.getByLabel("일급 적용 범위").click();
        await page.getByRole("option", { name: "과거 기간에도 적용" }).click();
        await page.getByLabel("과거 적용 시작일").fill("2026-07-02");
        await page.getByLabel("과거 적용 종료일").fill("2026-07-03");
        await page
          .getByLabel("과거 일급 변경 사유")
          .fill("일급 정정 권한 검증");
        await page.getByRole("button", { name: "저장", exact: true }).click();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        expect(
          await prisma.employee.findUniqueOrThrow({
            where: { id: employee.id },
          }),
        ).toMatchObject({ dailyWage: 150_000 });
        expect(
          await prisma.ledgerLaborItem.count({
            where: { dailyLedgerId: { in: ledgerIds }, amount: 180_000 },
          }),
        ).toBe(0);
        expect(
          await prisma.auditLog.count({
            where: {
              targetId: { in: ledgerIds },
              action: "ledger.employee_wage.updated",
            },
          }),
        ).toBe(2);
      } finally {
        await prisma.permissionProfileAction.create({ data: permission });
      }
    }
  } finally {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: [employee.id, ...ledgerIds] } },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({ where: { id: { in: ledgerIds } } });
    await prisma.employee.delete({ where: { id: employee.id } });
    await prisma.employee.delete({ where: { id: otherEmployee.id } });
    await prisma.store.delete({ where: { id: store.id } });
  }
});
