import "./_loadenv.mjs";

import { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { lockEmployeeNamesInTx } from "../src/features/labor/employee-labor-linking.ts";
import { writeAuditLog } from "../src/server/audit.ts";

const db = new PrismaClient();
const applyConfirmation = "LINK_EMPLOYEE_LABOR";
const valueOptions = new Set([
  "--labor-id",
  "--employee-id",
  "--store-name",
  "--actor-email",
  "--reason",
  "--confirm",
]);

function argumentValue(name) {
  const prefix = `${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseOptions() {
  for (const argument of process.argv.slice(2)) {
    if (argument === "--apply") continue;
    const [name] = argument.split("=", 1);
    if (!valueOptions.has(name)) {
      throw new Error(`알 수 없는 옵션입니다: ${argument}`);
    }
  }

  const options = {
    apply: process.argv.includes("--apply"),
    laborId: argumentValue("--labor-id")?.trim() || null,
    employeeId: argumentValue("--employee-id")?.trim() || null,
    storeName: argumentValue("--store-name")?.trim() || null,
    actorEmail: argumentValue("--actor-email")?.trim() || null,
    reason: argumentValue("--reason")?.trim() || null,
    confirmation: argumentValue("--confirm")?.trim() || null,
  };

  if (!options.laborId || !options.employeeId || !options.storeName) {
    throw new Error(
      "--labor-id, --employee-id, --store-name을 모두 입력해야 합니다.",
    );
  }
  if (options.apply && !options.actorEmail) {
    throw new Error("--apply에는 --actor-email=<본사 계정>이 필요합니다.");
  }
  if (options.apply && !options.reason) {
    throw new Error("--apply에는 --reason=<복구 사유>가 필요합니다.");
  }
  if (options.reason && options.reason.length > 500) {
    throw new Error("--reason은 500자 이하여야 합니다.");
  }
  if (options.apply && options.confirmation !== applyConfirmation) {
    throw new Error(`--apply에는 --confirm=${applyConfirmation}이 필요합니다.`);
  }

  return options;
}

function databaseIdentity() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { host: "missing", database: "missing" };

  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ""),
  };
}

const laborSelect = {
  id: true,
  employeeId: true,
  workerName: true,
  amount: true,
  dailyLedger: {
    select: {
      id: true,
      status: true,
      closingDate: true,
      storeId: true,
      store: { select: { name: true } },
    },
  },
};

async function loadTarget(options, client = db) {
  const [labor, employee] = await Promise.all([
    client.ledgerLaborItem.findUnique({
      where: { id: options.laborId },
      select: laborSelect,
    }),
    client.employee.findUnique({
      where: { id: options.employeeId },
      select: {
        id: true,
        name: true,
        isActive: true,
        dailyWage: true,
      },
    }),
  ]);

  if (!labor)
    throw new Error(`근무 기록을 찾을 수 없습니다: ${options.laborId}`);
  if (!employee)
    throw new Error(`직원을 찾을 수 없습니다: ${options.employeeId}`);
  if (labor.dailyLedger.store.name !== options.storeName) {
    throw new Error(
      `지점이 다릅니다: 실제=${labor.dailyLedger.store.name}, 요청=${options.storeName}`,
    );
  }
  if (labor.employeeId !== null && labor.employeeId !== employee.id) {
    throw new Error("대상 근무 기록이 이미 다른 직원과 연결되어 있습니다.");
  }
  if (employee.name !== labor.workerName) {
    throw new Error(
      `직원명이 다릅니다: 근무 기록=${labor.workerName}, 직원=${employee.name}`,
    );
  }
  if (!employee.isActive) throw new Error("대상 직원이 비활성 상태입니다.");

  return { labor, employee };
}

async function requireRepairActor(actorEmail, storeId, status) {
  const actor = await db.user.findUnique({
    where: { email: actorEmail },
    select: {
      id: true,
      role: true,
      isActive: true,
      storeAssignments: { select: { storeId: true } },
      permissionProfiles: {
        where: { profile: { isActive: true } },
        select: {
          profile: {
            select: {
              storeAccessMode: true,
              actions: { select: { action: true } },
            },
          },
        },
      },
    },
  });
  if (!actor || !actor.isActive || actor.role !== "HEADQUARTERS") {
    throw new Error("활성 본사 계정을 찾을 수 없습니다.");
  }

  const actions = new Set(
    actor.permissionProfiles.flatMap(({ profile }) =>
      profile.actions.map(({ action }) => action),
    ),
  );
  const requiredActions = ["LABOR_VIEW", "LEDGER_EDIT"];
  if (status === "HEADQUARTERS_CLOSED") {
    requiredActions.push("LEDGER_CLOSED_EDIT");
  }
  const missingActions = requiredActions.filter(
    (action) => !actions.has(action),
  );
  if (missingActions.length > 0) {
    throw new Error(`복구 권한이 부족합니다: ${missingActions.join(", ")}`);
  }

  const hasAllStoreAccess = actor.permissionProfiles.some(
    ({ profile }) => profile.storeAccessMode === "ALL_STORES",
  );
  const assignedStoreIds = new Set(
    actor.storeAssignments.map((assignment) => assignment.storeId),
  );
  if (!hasAllStoreAccess && !assignedStoreIds.has(storeId)) {
    throw new Error("선택한 지점에 대한 접근 권한이 없습니다.");
  }

  return actor;
}

function serializeTarget({ labor, employee }) {
  return {
    laborId: labor.id,
    ledgerId: labor.dailyLedger.id,
    businessDate: labor.dailyLedger.closingDate.toISOString().slice(0, 10),
    storeName: labor.dailyLedger.store.name,
    ledgerStatus: labor.dailyLedger.status,
    employeeId: labor.employeeId,
    workerName: labor.workerName,
    amount: labor.amount,
    targetEmployeeId: employee.id,
    targetEmployeeName: employee.name,
    targetDailyWage: employee.dailyWage,
  };
}

async function applyRepair(options, actor) {
  return db.$transaction(
    async (tx) => {
      const initial = await loadTarget(options, tx);
      await lockEmployeeNamesInTx(tx, [initial.employee.name]);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "DailyLedger" WHERE "id" = ${initial.labor.dailyLedger.id} FOR UPDATE`,
      );

      const current = await loadTarget(options, tx);
      if (current.labor.employeeId !== null) {
        throw new Error("잠금 후 대상 근무 기록이 이미 연결되었습니다.");
      }

      const before = serializeTarget(current);
      await tx.ledgerLaborItem.update({
        where: { id: current.labor.id },
        data: {
          employeeId: current.employee.id,
          updatedById: actor.id,
        },
      });
      await tx.dailyLedger.update({
        where: { id: current.labor.dailyLedger.id },
        data: { version: { increment: 1 }, updatedById: actor.id },
      });

      const after = {
        ...before,
        employeeId: current.employee.id,
      };
      const audit = await writeAuditLog(tx, {
        action: "ledger.employee_link.backfilled",
        targetType: "DailyLedger",
        targetId: current.labor.dailyLedger.id,
        actorId: actor.id,
        before: { laborItem: before },
        after: {
          laborItem: after,
          ledgerStatusAtEdit: current.labor.dailyLedger.status,
          closedEdit:
            current.labor.dailyLedger.status === "HEADQUARTERS_CLOSED",
        },
        reason: options.reason,
      });

      return { before, after, auditId: audit.id };
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

async function main() {
  const options = parseOptions();
  const target = await loadTarget(options);
  const before = serializeTarget(target);
  const plannedAfter = {
    ...before,
    employeeId: target.employee.id,
  };

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          database: databaseIdentity(),
          before,
          plannedAfter,
          auditAction: "ledger.employee_link.backfilled",
        },
        null,
        2,
      ),
    );
    return;
  }

  const actor = await requireRepairActor(
    options.actorEmail,
    target.labor.dailyLedger.storeId,
    target.labor.dailyLedger.status,
  );
  const result = await applyRepair(options, actor);
  console.log(
    JSON.stringify(
      {
        mode: "apply",
        database: databaseIdentity(),
        result: "complete",
        ...result,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}
