import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return readFileSync(filePath, "utf8");
}

test("global CSS exposes ERP Fish mockup design tokens", () => {
  const source = readProjectFile("src", "styles", "globals.css");

  assert.match(source, /--background:\s*#f9fafb/i);
  assert.match(source, /--primary:\s*#2563eb/i);
  assert.match(source, /--accent:\s*#0ea5e9/i);
  assert.match(source, /--warning:\s*#f59e0b/i);
  assert.match(source, /--success:/i);
  assert.match(source, /--radius:\s*0\.5rem/i);
  assert.match(source, /font-variant-numeric:\s*tabular-nums/i);
});

test("HQ shell and sidebar preserve menu labels while adding mockup active navigation", () => {
  const shellSource = readProjectFile(
    "src",
    "components",
    "headquarters-shell.tsx",
  );
  const sidebarSource = readProjectFile("src", "components", "app-sidebar.tsx");
  const sidebarUiSource = readProjectFile(
    "src",
    "components",
    "ui",
    "sidebar.tsx",
  );
  const sidebarNavSource = readProjectFile(
    "src",
    "components",
    "app-sidebar-nav.tsx",
  );

  for (const label of [
    "홈",
    "리포트",
    "기준정보",
    "품목 마스터",
    "매입 기준",
    "이상 신호 기준값",
    "코드 관리",
    "사용자/권한",
    "변경 이력",
    "설정",
  ]) {
    assert.match(sidebarSource, new RegExp(label));
  }

  assert.doesNotMatch(sidebarSource, /^"use client";/);
  assert.doesNotMatch(sidebarSource, /usePathname/);
  assert.match(sidebarSource, /<AppSidebarNav\s+navigationItems=/);
  assert.match(sidebarSource, /<LogoutButton\s*\/>/);
  assert.match(sidebarNavSource, /^"use client";/);
  assert.match(sidebarNavSource, /usePathname/);
  assert.match(sidebarNavSource, /isActive=/);
  assert.match(sidebarNavSource, /bg-primary/);
  assert.match(shellSource, /max-w-\[1600px\]/);
  assert.match(shellSource, /min-w-0/);
  assert.match(shellSource, /bg-background/);
  assert.match(sidebarUiSource, /min-w-0 flex-1 flex-col/);
});

test("shared metric cards and status chips carry the mockup presentation system", () => {
  const metricCardSource = readProjectFile(
    "src",
    "components",
    "metric-card.tsx",
  );
  const statusBadgeSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-status-badge.tsx",
  );
  const signalSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );

  assert.match(metricCardSource, /tabular-nums/);
  assert.match(metricCardSource, /variant\?:/);
  assert.match(metricCardSource, /warning/);
  assert.match(statusBadgeSource, /bg-success\/10/);
  assert.match(statusBadgeSource, /bg-warning\/15/);
  assert.match(statusBadgeSource, /bg-primary\/10/);
  assert.match(signalSource, /TriangleAlertIcon/);
  assert.match(signalSource, /CircleAlertIcon/);
});

test("inventory entry follows the mobile mockup table and sticky action cues", () => {
  const source = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(
    source,
    /bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
  assert.match(source, /sticky/);
  assert.match(source, /bg-primary\/5/);
  assert.match(source, /border-primary/);
  assert.match(source, /sticky top-0/);
});
