import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";
import * as schemas from "../../src/features/headquarters-expenses/schemas.ts";

const root = process.cwd();
const actionSource = readFileSync(
  path.join(root, "src", "features", "headquarters-expenses", "actions.ts"),
  "utf8",
);

const compiledActions = ts.transpileModule(actionSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function loadActions(options = {}) {
  const state = {
    actorCalls: 0,
    scopeCalls: 0,
    transactionCalls: 0,
    createCalls: 0,
    auditRows: [],
    createdRows: [],
    committed: false,
    rolledBack: false,
    revalidationSwallowed: false,
  };

  const actionResult = {
    actionOk(data) {
      return { ok: true, data };
    },
    actionError(code, message, fieldErrors) {
      return {
        ok: false,
        error: { code, message, fieldErrors },
      };
    },
  };

  const authz = {
    async requireSettingsAccess() {
      state.actorCalls += 1;

      if (options.authError) {
        throw new Error("unauthorized");
      }

      return { id: "actor-1" };
    },
    async getHeadquartersStoreScope() {
      state.scopeCalls += 1;
      return { storeIds: options.allowedStoreIds ?? ["store-1"] };
    },
  };

  const audit = {
    async writeAuditLog(_tx, input) {
      if (input.targetId === options.failAuditTargetId) {
        throw new Error("audit failed");
      }

      state.auditRows.push(input);
    },
  };

  const tx = {
    headquartersExpense: {
      async create({ data }) {
        state.createCalls += 1;

        if (state.createCalls === options.failCreateCall) {
          throw new Error("create failed");
        }

        const expense = {
          id: `expense-${state.createCalls}`,
          expenseDate: data.expenseDate,
          storeId: data.storeId,
          category: data.category,
          amount: data.amount,
          adjustmentReason: data.adjustmentReason,
          memo: data.memo,
        };
        state.createdRows.push(expense);
        return expense;
      },
    },
  };

  const db = {
    async $transaction(callback) {
      state.transactionCalls += 1;

      try {
        const result = await callback(tx);
        state.committed = true;
        return result;
      } catch (error) {
        state.rolledBack = true;
        throw error;
      }
    },
  };

  const revalidation = {
    revalidateBestEffort(callback) {
      try {
        callback();
      } catch {
        state.revalidationSwallowed = true;
      }
    },
    revalidateDashboardAndReports() {},
  };

  const nextCache = {
    revalidatePath() {
      if (options.revalidationError) {
        throw new Error("revalidation failed");
      }
    },
  };

  const modules = new Map([
    ["~/lib/action-result", actionResult],
    ["~/server/audit", audit],
    ["~/server/authz", authz],
    ["~/server/db", { db }],
    ["~/server/revalidation", revalidation],
    ["next/cache", nextCache],
    ["./schemas", schemas],
  ]);

  const requireMock = (specifier) => {
    const depModule = modules.get(specifier);

    if (!depModule) {
      throw new Error(`Unexpected action dependency: ${specifier}`);
    }

    return depModule;
  };

  const context = vm.createContext({ console, Date, Error, Promise });
  const factory = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) {${compiledActions}\n})`,
  ).runInContext(context);
  const moduleObject = { exports: {} };

  factory(moduleObject.exports, requireMock, moduleObject, "actions.ts", root);

  return { actions: moduleObject.exports, state };
}

function validBatch() {
  return {
    expenseDate: "2026-06-22",
    storeId: "store-1",
    items: [
      { category: "임차료", amount: 1000, memo: null, adjustmentReason: null },
      { category: "전기세", amount: 2000, memo: null, adjustmentReason: null },
    ],
  };
}

test("batch action validates every row before opening a transaction", async () => {
  const { actions, state } = loadActions();

  const result = await actions.createHeadquartersExpenses({
    ...validBatch(),
    items: [{ category: "임차료", amount: "" }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.deepEqual(result.error.fieldErrors, {
    "items.0.amount": ["지출 금액은 0원 이상의 정수여야 합니다."],
  });
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.createCalls, 0);
});

test("batch action requires settings access and rejects an out-of-scope shared store", async () => {
  const denied = loadActions({ allowedStoreIds: ["store-2"] });
  const deniedResult =
    await denied.actions.createHeadquartersExpenses(validBatch());

  assert.equal(deniedResult.ok, false);
  assert.equal(deniedResult.error.code, "STORE_OUT_OF_SCOPE");
  assert.equal(denied.state.actorCalls, 1);
  assert.equal(denied.state.scopeCalls, 1);
  assert.equal(denied.state.transactionCalls, 0);

  const unauthorized = loadActions({ authError: true });

  await assert.rejects(
    unauthorized.actions.createHeadquartersExpenses(validBatch()),
    /unauthorized/,
  );
  assert.equal(unauthorized.state.actorCalls, 1);
  assert.equal(unauthorized.state.transactionCalls, 0);
});

test("batch action rolls back when a later row audit fails", async () => {
  const { actions, state } = loadActions({ failAuditTargetId: "expense-2" });

  await assert.rejects(
    actions.createHeadquartersExpenses(validBatch()),
    /audit failed/,
  );

  assert.equal(state.transactionCalls, 1);
  assert.equal(state.createdRows.length, 2);
  assert.equal(state.auditRows.length, 1);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
});

test("batch action returns committed ids when revalidation throws", async () => {
  const { actions, state } = loadActions({ revalidationError: true });

  const result = await actions.createHeadquartersExpenses(validBatch());

  assert.equal(result.ok, true);
  assert.deepEqual([...result.data.ids], ["expense-1", "expense-2"]);
  assert.equal(state.committed, true);
  assert.equal(state.revalidationSwallowed, true);
  assert.equal(state.auditRows.length, 2);
});
