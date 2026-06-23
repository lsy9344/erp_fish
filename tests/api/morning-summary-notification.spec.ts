import { expect } from "@playwright/test";
import { test } from "@seontechnologies/playwright-utils/api-request/fixtures";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const TEMPLATE_KEY = "morning-summary-v1";
const CRON_SECRET = "test-internal-cron-secret";
const RECIPIENT_IDS = ["U-test-exec-1", "U-test-exec-2"];
const REPORT_DATE = "2026-06-20";

const ENDPOINT = "/api/internal/notifications/morning-summary";

type MorningSummaryResponse = {
  reportDate: string;
  sentCount: number;
  failedCount: number;
  results: Array<{ recipientId: string; status: string; error?: string }>;
};

type UnauthorizedResponse = { error: string };

test.beforeEach(async () => {
  await prisma.notificationDeliveryLog.deleteMany({
    where: { templateKey: TEMPLATE_KEY, recipientId: { in: RECIPIENT_IDS } },
  });
});

test.afterAll(async () => {
  await prisma.notificationDeliveryLog.deleteMany({
    where: { templateKey: TEMPLATE_KEY, recipientId: { in: RECIPIENT_IDS } },
  });
  await prisma.$disconnect();
});

test("[P0] 인증 헤더 없이 호출하면 401을 반환한다", async ({ request }) => {
  const response = await request.post(ENDPOINT, {
    data: { reportDate: REPORT_DATE },
  });

  expect(response.status()).toBe(401);
  const body = (await response.json()) as UnauthorizedResponse;
  expect(body).toMatchObject({ error: "Unauthorized" });
});

test("[P0] 잘못된 Authorization으로 호출하면 401을 반환한다", async ({
  request,
}) => {
  const response = await request.post(ENDPOINT, {
    headers: { Authorization: "Bearer wrong-secret" },
    data: { reportDate: REPORT_DATE },
  });

  expect(response.status()).toBe(401);
});

test("[P0] 올바른 시크릿으로 호출하면 모든 수신자에게 전송하고 전송 로그를 남긴다", async ({
  request,
}) => {
  const response = await request.post(ENDPOINT, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { reportDate: REPORT_DATE },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as MorningSummaryResponse;

  expect(body.reportDate).toBe(REPORT_DATE);
  expect(body.sentCount).toBe(RECIPIENT_IDS.length);
  expect(body.failedCount).toBe(0);
  expect(Array.isArray(body.results)).toBe(true);
  expect(body.results.map((r) => r.recipientId).sort()).toEqual(
    [...RECIPIENT_IDS].sort(),
  );

  // 수신자별 전송 로그가 NotificationDeliveryLog에 기록된다.
  await expect
    .poll(async () =>
      prisma.notificationDeliveryLog.count({
        where: {
          templateKey: TEMPLATE_KEY,
          recipientId: { in: RECIPIENT_IDS },
          status: "sent",
        },
      }),
    )
    .toBe(RECIPIENT_IDS.length);

  const logs = await prisma.notificationDeliveryLog.findMany({
    where: { templateKey: TEMPLATE_KEY, recipientId: { in: RECIPIENT_IDS } },
  });

  for (const log of logs) {
    expect(log.provider).toBe("line");
    expect(log.status).toBe("sent");
    expect(log.error).toBeNull();
  }
});
