import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const uiComponents = [
  "button",
  "card",
  "table",
  "field",
  "input",
  "select",
  "dialog",
  "sheet",
  "tabs",
  "badge",
  "alert",
  "separator",
  "skeleton",
  "sonner",
  "sidebar",
  "chart",
];

test("shadcn is initialized with expected project files", () => {
  assert.ok(
    existsSync(path.join(root, "components.json")),
    "components.json should exist",
  );
  assert.ok(
    existsSync(path.join(root, "src", "lib", "utils.ts")),
    "shadcn utility helper should exist",
  );
});

test("required shadcn UI components are installed", () => {
  for (const component of uiComponents) {
    assert.ok(
      existsSync(
        path.join(root, "src", "components", "ui", `${component}.tsx`),
      ),
      `${component} component should exist`,
    );
  }
});

test("shared shadcn primitives keep mobile and accessibility safeguards", () => {
  const dialogSource = readFileSync(
    path.join(root, "src", "components", "ui", "dialog.tsx"),
    "utf8",
  );
  const sidebarSource = readFileSync(
    path.join(root, "src", "components", "ui", "sidebar.tsx"),
    "utf8",
  );
  const buttonSource = readFileSync(
    path.join(root, "src", "components", "ui", "button.tsx"),
    "utf8",
  );
  const tabsSource = readFileSync(
    path.join(root, "src", "components", "ui", "tabs.tsx"),
    "utf8",
  );

  assert.match(dialogSource, /max-h-\[min\(calc\(100dvh-2rem\),/);
  assert.match(dialogSource, /overflow-y-auto/);
  assert.match(dialogSource, /\[&>\[data-slot=dialog-footer\]\]:sticky/);
  assert.doesNotMatch(sidebarSource, /\[&>button\]:hidden/);
  assert.match(buttonSource, /hover:bg-primary\/90/);
  assert.doesNotMatch(buttonSource, /\[a\]:hover:bg-primary\/90/);
  assert.match(tabsSource, /orientation=\{orientation\}/);
});
