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
  assert.match(shell, /URLSearchParams/);
  assert.match(shell, /storeId/);

  for (const route of [storeEntryPage, inventoryPage, lossesPage]) {
    assert.match(route, /storeId={store\.id}/);
    assert.match(route, /storeId={workspace\.store\.id}/);
  }
});

test("store manager shell does not prefetch store entry data that can go stale", () => {
  const shell = readFileSync(
    path.join(root, "src", "components", "store-manager-shell.tsx"),
    "utf8",
  );

  assert.match(shell, /prefetch={false}/);
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
