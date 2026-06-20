import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

test("NextAuth uses internal credentials instead of external OAuth demo only", () => {
  const authConfig = readFileSync(
    path.join(root, "src", "server", "auth", "config.ts"),
    "utf8",
  );

  assert.match(authConfig, /CredentialsProvider/);
  assert.doesNotMatch(authConfig, /DiscordProvider/);
  assert.match(authConfig, /verifyPassword/);
  assert.match(authConfig, /DUMMY_PASSWORD_HASH/);
  assert.match(
    authConfig,
    /verifyPassword\(parsed\.data\.password, DUMMY_PASSWORD_HASH\)/,
  );
  assert.match(authConfig, /strategy:\s*"jwt"/);
  assert.match(authConfig, /role:\s*(user|token)\.role/);
});

test("server authorization helper protects headquarters-only routes", () => {
  const authzPath = path.join(root, "src", "server", "authz.ts");

  assert.ok(existsSync(authzPath), "src/server/authz.ts should exist");

  const authz = readFileSync(authzPath, "utf8");
  assert.match(authz, /requireHeadquartersUser/);
  assert.match(authz, /HEADQUARTERS/);
  assert.match(authz, /db\.user\.findUnique/);
  assert.match(authz, /redirect\("\/login/);
});

test("app route segment layout enforces server-session protection", () => {
  const appLayout = readFileSync(
    path.join(root, "src", "app", "app", "layout.tsx"),
    "utf8",
  );

  assert.match(
    appLayout,
    /import\s+{\s*requireAppUser\s*}\s+from\s+"~\/server\/authz"/,
  );
  assert.match(appLayout, /await\s+requireAppUser\(\)/);
});

test("server authorization helper enforces store access from database assignments", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );

  assert.match(authz, /getAppHomePath/);
  assert.match(authz, /getStoreManagerWorkspace/);
  assert.match(authz, /requireStoreAccess/);
  assert.match(authz, /db\.user\.findUnique/);
  assert.match(authz, /db\.store\.findFirst/);
  assert.match(authz, /assignments:\s*{\s*some:\s*{\s*userId:/s);
  assert.match(authz, /isActive:\s*true/);
  assert.match(authz, /UserRole\.HEADQUARTERS/);
  assert.match(authz, /UserRole\.STORE_MANAGER/);
  assert.match(authz, /redirect\("\/app\/unauthorized"\)/);
});

test("server authorization helper checks action permissions through active database profiles", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );

  assert.match(authz, /hasActionPermission/);
  assert.match(authz, /requireActionPermission/);
  assert.match(authz, /requireHeadquartersActionPermission/);
  assert.match(authz, /PermissionAction/);
  assert.match(authz, /db\.user\.(?:findUnique|findFirst)/);
  assert.match(
    authz,
    /requiredRole\s*=\s*options\.requiredRole\s*\?\?\s*UserRole\.HEADQUARTERS/,
  );
  assert.match(
    authz,
    /\.\.\.\(requiredRole\s*\?\s*{\s*role:\s*requiredRole\s*}\s*:\s*{}\)/s,
  );
  assert.match(authz, /permissionProfiles:\s*{\s*some:/s);
  assert.match(authz, /profile:\s*{\s*isActive:\s*true/s);
  assert.match(authz, /actions:\s*{\s*some:\s*{\s*action/s);
  assert.match(authz, /redirect\("\/app\/unauthorized"\)/);
});

test("server authorization helper scopes headquarters store access by permission profile mode", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );

  assert.match(authz, /StoreAccessMode/);
  assert.match(authz, /ALL_STORES/);
  assert.match(authz, /ASSIGNED_STORES/);
  assert.match(authz, /getActivePermissionProfiles/);
  assert.match(authz, /storeAccessMode\s*===\s*StoreAccessMode\.ALL_STORES/);
  assert.match(
    authz,
    /storeAccessMode\s*===\s*StoreAccessMode\.ASSIGNED_STORES/,
  );
  assert.match(authz, /id:\s*storeId,\s*isActive:\s*true/s);
  assert.match(
    authz,
    /assignments:\s*{\s*some:\s*{\s*userId:\s*currentUser\.id/s,
  );
});

test("server authorization helper exposes profile-aware semantic gates", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );

  for (const helper of [
    "requireSettingsAccess",
    "requireUserPermissionAccess",
    "requireReportAccess",
    "requireLedgerHqEditAccess",
    "requireStoreManagerLedgerEditAccess",
    "requireLedgerHqCloseAccess",
    "requireCorrectionCreateAccess",
    "requireExportCreateAccess",
    "getHeadquartersStoreScope",
    "requireHeadquartersStoreScope",
  ]) {
    assert.match(authz, new RegExp(`export async function ${helper}\\(`));
  }

  for (const action of [
    "SETTINGS_MANAGE",
    "USER_PERMISSION_MANAGE",
    "REPORT_VIEW",
    "LEDGER_EDIT",
    "LEDGER_HQ_CLOSE",
    "CORRECTION_CREATE",
    "EXPORT_CREATE",
  ]) {
    assert.match(authz, new RegExp(`PermissionAction\\.${action}`));
  }

  assert.match(authz, /db\.user\.findFirst\(/);
  assert.match(authz, /isActive:\s*true/);
  assert.match(authz, /permissionProfiles:\s*{\s*some:/s);
  assert.match(authz, /profile:\s*{\s*isActive:\s*true/s);
  assert.match(authz, /actions:\s*{\s*some:\s*{\s*action/s);
  assert.match(authz, /StoreAccessMode\.ASSIGNED_STORES/);
  assert.match(authz, /StoreAccessMode\.ALL_STORES/);
});

test("store manager entry routes and write actions require store-manager ledger edit access", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );
  const storeEntryPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "page.tsx"),
    "utf8",
  );
  const inventoryPage = readFileSync(
    path.join(
      root,
      "src",
      "app",
      "app",
      "store-entry",
      "inventory",
      "page.tsx",
    ),
    "utf8",
  );
  const lossesPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "losses", "page.tsx"),
    "utf8",
  );
  const ledgerActions = readFileSync(
    path.join(root, "src", "features", "ledger", "actions.ts"),
    "utf8",
  );
  const inventoryActions = readFileSync(
    path.join(root, "src", "features", "inventory", "actions.ts"),
    "utf8",
  );
  const lossActions = readFileSync(
    path.join(root, "src", "features", "losses", "actions.ts"),
    "utf8",
  );

  assert.match(
    authz,
    /export\s+async\s+function\s+requireStoreManagerLedgerEditAccess\(storeId:\s*string\)/,
  );
  assert.match(
    authz,
    /export\s+async\s+function\s+getStoreManagerLedgerEditWorkspace\(\)/,
  );
  assert.match(
    authz,
    /getStoreManagerLedgerEditWorkspace[\s\S]*requireStoreManagerLedgerEditAccess\(workspace\.store\.id\)/,
  );
  assert.match(
    authz,
    /requireStoreManagerLedgerEditAccess[\s\S]*currentUser\.role !== UserRole\.STORE_MANAGER[\s\S]*redirect\("\/app\/unauthorized"\)/,
  );
  assert.match(
    authz,
    /requireStoreManagerLedgerEditAccess[\s\S]*hasActionPermission\([\s\S]*PermissionAction\.LEDGER_EDIT[\s\S]*requiredRole:\s*UserRole\.STORE_MANAGER/s,
  );

  for (const route of [storeEntryPage, inventoryPage, lossesPage]) {
    assert.match(route, /requireStoreManagerLedgerEditAccess\(storeId\)/);
    assert.match(route, /getStoreManagerLedgerEditWorkspace\(\)/);
    assert.doesNotMatch(route, /const\s+\{\s*user,\s*store\s*\}\s*=\s*await\s+requireStoreAccess\(storeId\)/);
  }

  for (const source of [ledgerActions, inventoryActions, lossActions]) {
    assert.match(source, /requireStoreManagerLedgerEditAccess/);
  }
});

test("semantic headquarters gates require explicit actions and store scope", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );
  const dashboardQuery = readFileSync(
    path.join(root, "src", "features", "dashboard", "queries.ts"),
    "utf8",
  );
  const reportQuery = readFileSync(
    path.join(root, "src", "features", "reports", "queries.ts"),
    "utf8",
  );

  assert.match(
    authz,
    /requireReportAccess\(\)[\s\S]*PermissionAction\.REPORT_VIEW/,
  );
  assert.match(
    authz,
    /requireExportCreateAccess\(\)[\s\S]*PermissionAction\.EXPORT_CREATE/,
  );
  assert.doesNotMatch(
    authz,
    /function\s+requireExportCreateAccess\(\)[\s\S]*requireReportAccess\(/,
  );
  assert.match(authz, /getHeadquartersStoreScope/);
  assert.match(authz, /UserStoreAssignment|assignments:\s*{\s*some:/s);
  assert.match(authz, /StoreAccessMode\.ASSIGNED_STORES/);

  for (const source of [dashboardQuery, reportQuery]) {
    assert.match(source, /requireReportAccess\(\)/);
    assert.match(source, /getHeadquartersStoreScope\(\)/);
  }
});

test("headquarters navigation is derived from database-backed permissions", () => {
  const appSidebar = readFileSync(
    path.join(root, "src", "components", "app-sidebar.tsx"),
    "utf8",
  );
  const hqShell = readFileSync(
    path.join(root, "src", "components", "headquarters-shell.tsx"),
    "utf8",
  );
  const dashboardPage = readFileSync(
    path.join(root, "src", "app", "app", "dashboard", "page.tsx"),
    "utf8",
  );

  assert.match(appSidebar, /navigationItems/);
  assert.match(appSidebar, /requiredAction/);
  assert.match(appSidebar, /PermissionAction\.REPORT_VIEW/);
  assert.match(appSidebar, /PermissionAction\.SETTINGS_MANAGE/);
  assert.match(appSidebar, /PermissionAction\.USER_PERMISSION_MANAGE/);
  assert.match(appSidebar, /filterHeadquartersNavigationItems/);
  assert.doesNotMatch(
    appSidebar,
    /const navigationItems = \[[\s\S]*\] satisfies AppSidebarNavigationItem\[\];/,
  );

  assert.match(hqShell, /navigationItems/);
  assert.match(hqShell, /<AppSidebar[\s\S]*navigationItems={navigationItems}/);
  assert.match(dashboardPage, /getHeadquartersNavigationItems/);
});

test("headquarters pages and queries use semantic action gates before data reads", () => {
  const expected = [
    {
      file: path.join(root, "src", "app", "app", "dashboard", "page.tsx"),
      gate: "requireReportAccess",
    },
    {
      file: path.join(root, "src", "features", "dashboard", "queries.ts"),
      gate: "requireReportAccess",
    },
    {
      file: path.join(root, "src", "features", "reports", "queries.ts"),
      gate: "requireReportAccess",
    },
    {
      file: path.join(root, "src", "features", "master-data", "queries.ts"),
      gate: "requireSettingsAccess",
    },
    {
      file: path.join(
        root,
        "src",
        "features",
        "master-data",
        "user-queries.ts",
      ),
      gate: "requireUserPermissionAccess",
    },
    {
      file: path.join(
        root,
        "src",
        "features",
        "master-data",
        "user-actions.ts",
      ),
      gate: "requireUserPermissionAccess",
    },
    {
      file: path.join(root, "src", "features", "ledger", "hq-edit-actions.ts"),
      gate: "requireLedgerHqEditAccess",
    },
    {
      file: path.join(
        root,
        "src",
        "features",
        "inventory",
        "hq-edit-actions.ts",
      ),
      gate: "requireLedgerHqEditAccess",
    },
    {
      file: path.join(root, "src", "features", "losses", "hq-edit-actions.ts"),
      gate: "requireLedgerHqEditAccess",
    },
    {
      file: path.join(root, "src", "features", "ledger", "hq-close-actions.ts"),
      gate: "requireLedgerHqCloseAccess",
    },
    {
      file: path.join(root, "src", "features", "corrections", "actions.ts"),
      gate: "requireCorrectionCreateAccess",
    },
  ];

  for (const { file, gate } of expected) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(gate));
  }
});

test("ledger detail action UI is hidden unless the user has matching action permissions", () => {
  const ledgerPage = readFileSync(
    path.join(root, "src", "app", "app", "ledgers", "[ledgerId]", "page.tsx"),
    "utf8",
  );

  assert.match(ledgerPage, /hasActionPermission/);
  assert.match(ledgerPage, /PermissionAction\.LEDGER_EDIT/);
  assert.match(ledgerPage, /PermissionAction\.LEDGER_HQ_CLOSE/);
  assert.match(ledgerPage, /PermissionAction\.CORRECTION_CREATE/);
  assert.match(ledgerPage, /canEditLedger/);
  assert.match(ledgerPage, /canCloseLedger/);
  assert.match(ledgerPage, /canCreateCorrection/);
  assert.match(
    ledgerPage,
    /canEditLedger[\s\S]*\?[\s\S]*getActiveLedgerInputCodeOptions/,
  );
  assert.match(ledgerPage, /!isOriginalEditBlocked && canCloseLedger/);
  assert.match(
    ledgerPage,
    /ledger\.status === "HEADQUARTERS_CLOSED" && canCreateCorrection/,
  );
  assert.match(ledgerPage, /canEditLedger \? \(\s*<Tabs/);
});

test("store entry routes reject repeated storeId query values before authorization", () => {
  const authz = readFileSync(
    path.join(root, "src", "server", "authz.ts"),
    "utf8",
  );
  const storeEntryPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "page.tsx"),
    "utf8",
  );
  const inventoryPage = readFileSync(
    path.join(
      root,
      "src",
      "app",
      "app",
      "store-entry",
      "inventory",
      "page.tsx",
    ),
    "utf8",
  );
  const lossesPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "losses", "page.tsx"),
    "utf8",
  );

  assert.match(authz, /normalizeStoreIdParam/);
  assert.match(authz, /Array\.isArray\(value\)/);

  for (const route of [storeEntryPage, inventoryPage, lossesPage]) {
    assert.match(route, /normalizeStoreIdParam\(params\.storeId\)/);
    assert.doesNotMatch(route, /requireStoreAccess\(params\.storeId\)/);
  }
});

test("store manager shell preserves selected storeId in tab links", () => {
  const shell = readFileSync(
    path.join(root, "src", "components", "store-manager-shell.tsx"),
    "utf8",
  );
  const navigation = readFileSync(
    path.join(root, "src", "components", "store-manager-navigation.tsx"),
    "utf8",
  );
  const storeEntryPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "page.tsx"),
    "utf8",
  );
  const inventoryPage = readFileSync(
    path.join(
      root,
      "src",
      "app",
      "app",
      "store-entry",
      "inventory",
      "page.tsx",
    ),
    "utf8",
  );
  const lossesPage = readFileSync(
    path.join(root, "src", "app", "app", "store-entry", "losses", "page.tsx"),
    "utf8",
  );

  assert.match(shell, /storeId\?: string/);
  assert.match(shell, /StoreManagerNavigation/);
  assert.match(navigation, /URLSearchParams/);
  assert.match(navigation, /storeId/);

  for (const route of [storeEntryPage, inventoryPage, lossesPage]) {
    assert.match(route, /storeId={store\.id}/);
    assert.match(route, /storeId={workspace\.store\.id}/);
  }
});

test("store manager shell does not prefetch store entry data that can go stale", () => {
  const navigation = readFileSync(
    path.join(root, "src", "components", "store-manager-navigation.tsx"),
    "utf8",
  );

  assert.match(navigation, /prefetch={false}/);
});

test("authenticated shells expose a logout button that signs out to login", () => {
  const logoutButtonPath = path.join(
    root,
    "src",
    "components",
    "logout-button.tsx",
  );

  assert.ok(
    existsSync(logoutButtonPath),
    "src/components/logout-button.tsx should exist",
  );

  const logoutButton = readFileSync(logoutButtonPath, "utf8");
  const appSidebar = readFileSync(
    path.join(root, "src", "components", "app-sidebar.tsx"),
    "utf8",
  );
  const storeShell = readFileSync(
    path.join(root, "src", "components", "store-manager-shell.tsx"),
    "utf8",
  );

  assert.match(
    logoutButton,
    /import\s+{\s*signOut\s*}\s+from\s+"~\/server\/auth"/,
  );
  assert.match(logoutButton, /"use server"/);
  assert.match(logoutButton, /signOut\(\{\s*redirectTo:\s*"\/login"\s*}\)/s);
  assert.match(logoutButton, /로그아웃/);
  assert.match(appSidebar, /<LogoutButton\s*\/>/);
  assert.match(storeShell, /<LogoutButton\s*\/>/);
});
