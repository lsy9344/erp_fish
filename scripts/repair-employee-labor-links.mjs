import "./_loadenv.mjs";

import { PrismaClient } from "../generated/prisma/index.js";
import {
  linkExistingLaborItemsInTx,
  lockEmployeeNamesInTx,
} from "../src/features/labor/employee-labor-linking.ts";

const db = new PrismaClient();
const applyConfirmation = "LINK_EMPLOYEE_LABOR";
const valueOptions = ["--store-name", "--actor-email", "--reason", "--confirm"];
const flagOptions = new Set(["--apply", "--include-closed"]);

function normalizedEmployeeName(name) {
  return name.trim().toLocaleLowerCase("ko-KR");
}

function argumentValue(name) {
  const prefix = `${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseOptions() {
  for (const argument of process.argv.slice(2)) {
    const knownFlag = flagOptions.has(argument);
    const knownValue = valueOptions.some((name) =>
      argument.startsWith(`${name}=`),
    );
    if (!knownFlag && !knownValue) {
      throw new Error(`알 수 없는 옵션입니다: ${argument}`);
    }
  }

  const options = {
    apply: process.argv.includes("--apply"),
    includeClosed: process.argv.includes("--include-closed"),
    storeName: argumentValue("--store-name")?.trim() || null,
    actorEmail: argumentValue("--actor-email")?.trim() || null,
    reason: argumentValue("--reason")?.trim() || null,
    confirmation: argumentValue("--confirm")?.trim() || null,
  };

  if (!options.storeName) {
    throw new Error("--store-name=<지점명>이 필요합니다.");
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

async function requireRepairActor(actorEmail, storeId, includeClosed) {
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
  if (includeClosed) requiredActions.push("LEDGER_CLOSED_EDIT");
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

async function loadCandidates(storeId, includeClosed) {
  const statuses = includeClosed
    ? ["IN_PROGRESS", "IN_REVIEW", "HEADQUARTERS_CLOSED"]
    : ["IN_PROGRESS", "IN_REVIEW"];
  const [employees, allEmployeeNames] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        hireDate: true,
        isActive: true,
        dailyWage: true,
      },
    }),
    db.employee.findMany({ select: { name: true } }),
  ]);
  const nameCounts = new Map();
  for (const employee of allEmployeeNames) {
    const normalizedName = normalizedEmployeeName(employee.name);
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
  }
  const uniqueEmployees = employees.filter(
    (employee) => nameCounts.get(normalizedEmployeeName(employee.name)) === 1,
  );

  const candidates = [];
  for (const employee of uniqueEmployees) {
    const ledgerWhere = {
      storeId,
      status: { in: statuses },
      closingDate: { gte: employee.hireDate },
    };
    const [unlinkedItems, linkedZeroItems] = await Promise.all([
      db.ledgerLaborItem.findMany({
        where: {
          employeeId: null,
          workerName: { equals: employee.name, mode: "insensitive" },
          dailyLedger: ledgerWhere,
        },
        select: { id: true, dailyLedgerId: true, amount: true },
      }),
      (employee.dailyWage ?? 0) > 0
        ? db.ledgerLaborItem.findMany({
            where: {
              employeeId: employee.id,
              amount: 0,
              dailyLedger: ledgerWhere,
            },
            select: { id: true, dailyLedgerId: true },
          })
        : Promise.resolve([]),
    ]);
    if (unlinkedItems.length === 0 && linkedZeroItems.length === 0) continue;
    candidates.push({
      employee,
      unlinkedItemCount: unlinkedItems.length,
      linkedZeroAmountCount: linkedZeroItems.length,
      dailyLedgerIds: [
        ...new Set(
          [...unlinkedItems, ...linkedZeroItems].map(
            (item) => item.dailyLedgerId,
          ),
        ),
      ],
      unlinkedZeroAmountCount: unlinkedItems.filter((item) => item.amount === 0)
        .length,
    });
  }

  return candidates;
}

function candidateSummary(options, candidates) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    database: databaseIdentity(),
    store: options.storeName,
    includeClosed: options.includeClosed,
    employeeCount: candidates.length,
    unlinkedLaborItemCount: candidates.reduce(
      (sum, candidate) => sum + candidate.unlinkedItemCount,
      0,
    ),
    dailyLedgerCount: new Set(
      candidates.flatMap((candidate) => candidate.dailyLedgerIds),
    ).size,
    unlinkedZeroAmountCount: candidates.reduce(
      (sum, candidate) => sum + candidate.unlinkedZeroAmountCount,
      0,
    ),
    linkedZeroAmountCount: candidates.reduce(
      (sum, candidate) => sum + candidate.linkedZeroAmountCount,
      0,
    ),
  };
}

async function main() {
  const options = parseOptions();
  const store = await db.store.findFirst({
    where: { name: options.storeName, isActive: true },
    select: { id: true },
  });
  if (!store) {
    throw new Error(`활성 지점을 찾을 수 없습니다: ${options.storeName}`);
  }

  const candidates = await loadCandidates(store.id, options.includeClosed);
  console.log(JSON.stringify(candidateSummary(options, candidates), null, 2));
  if (!options.apply || candidates.length === 0) return;

  const actor = await requireRepairActor(
    options.actorEmail,
    store.id,
    options.includeClosed,
  );
  let linkedLaborItemCount = 0;
  let filledLinkedZeroAmountCount = 0;
  const linkedDailyLedgerIds = new Set();

  for (const candidate of candidates) {
    const result = await db.$transaction(
      async (tx) => {
        await lockEmployeeNamesInTx(tx, [candidate.employee.name]);
        const currentEmployee = await tx.employee.findUnique({
          where: { id: candidate.employee.id },
          select: {
            id: true,
            name: true,
            hireDate: true,
            isActive: true,
            dailyWage: true,
          },
        });
        if (
          !currentEmployee ||
          !currentEmployee.isActive ||
          currentEmployee.name !== candidate.employee.name ||
          currentEmployee.hireDate.getTime() !==
            candidate.employee.hireDate.getTime() ||
          currentEmployee.dailyWage !== candidate.employee.dailyWage
        ) {
          throw new Error(
            `직원 정보가 점검 후 변경됐습니다: ${candidate.employee.name}`,
          );
        }

        return linkExistingLaborItemsInTx({
          tx,
          employee: currentEmployee,
          actorId: actor.id,
          canEditLedgers: true,
          includeClosedLedgers: options.includeClosed,
          storeIds: [store.id],
          fillLinkedZeroAmounts: true,
          auditReason: options.reason,
        });
      },
      { maxWait: 30_000, timeout: 120_000 },
    );
    linkedLaborItemCount += result.linkedLaborItemCount;
    filledLinkedZeroAmountCount += result.filledLinkedZeroAmountCount;
    for (const dailyLedgerId of result.linkedDailyLedgerIds) {
      linkedDailyLedgerIds.add(dailyLedgerId);
    }
  }

  console.log(
    JSON.stringify(
      {
        result: "complete",
        linkedLaborItemCount,
        filledLinkedZeroAmountCount,
        linkedDailyLedgerCount: linkedDailyLedgerIds.size,
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
