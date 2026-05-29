import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  assert.ok(existsSync(path.join(root, "components.json")), "components.json should exist");
  assert.ok(existsSync(path.join(root, "src", "lib", "utils.ts")), "shadcn utility helper should exist");
});

test("required shadcn UI components are installed", () => {
  for (const component of uiComponents) {
    assert.ok(
      existsSync(path.join(root, "src", "components", "ui", `${component}.tsx`)),
      `${component} component should exist`,
    );
  }
});
