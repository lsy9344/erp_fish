# Opening Inventory Two-Decimal Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 과거 재고 엑셀 업로드만 0 이상 소수점 둘째 자리 수량을 허용하고, 승인된 고객 양식을 실제 업로드 가능한 상태로 수정한 뒤 `main`에 병합·배포한다.

**Architecture:** 공용 한 자리 수량 정책은 유지하고 `opening-import.ts`의 과거 재고 파서 경계에만 두 자리 검증을 둔다. 간단 양식 생성기만 두 자리 계약으로 바꾸고 전체 재고 흐름 양식은 한 자리를 유지한다. 고객 원본 기반 xlsx는 `@oai/artifact-tool`로 `F53=1.38`을 반영해 검증한 뒤 추적 양식과 전달본을 동일 파일로 맞춘다.

**Tech Stack:** TypeScript, Node.js test runner, pnpm, `@oai/artifact-tool`, Microsoft Excel COM verification, Git/GitHub CLI, GitHub Actions, Vercel Git integration.

## Global Constraints

- 과거 재고 업로드의 `남은 수량`만 소수점 둘째 자리까지 허용한다.
- 일반 재고·매입·손실 입력과 이카운트 매입·공급 업로드의 한 자리 정책은 유지한다.
- 사용자 제공 파일의 실제 값 `1.375`만 `1.38`로 수정한다.
- 단가·금액의 정수 정책과 DB `Decimal(12, 2)` 스키마는 변경하지 않는다.
- 고객 원본의 시트, 값, 수식, 열 너비, 행 높이, 표시 서식을 보존한다. 승인된 `F53` 값과 수량 검증·표시 형식만 달라질 수 있다.
- `build-simple-inventory-template.mjs`는 정책 일치용으로 수정하되 실행해 고객 원본 기반 추적 xlsx를 덮어쓰지 않는다.
- `main` 푸시가 Vercel 프로덕션 자동 배포를 만들므로 `vercel --prod`를 별도로 실행하지 않는다.

---

### Task 1: 최신 main 기반 격리 작업공간 준비

**Files:**
- No production file changes.
- Consume: `docs/superpowers/specs/2026-07-13-opening-inventory-two-decimal-upload-design.md`
- Consume: `docs/superpowers/plans/2026-07-13-opening-inventory-two-decimal-upload.md`

**Interfaces:**
- Consumes: local `main`, `origin/main`, committed design/plan documents.
- Produces: clean branch `codex/opening-inventory-two-decimal` in `C:\Code\Project\erp_fish\.worktrees\opening-inventory-two-decimal`.

- [ ] **Step 1: Confirm the worktree location is ignored**

```powershell
git check-ignore -v .worktrees
```

Expected: `.gitignore` reports `.worktrees/` as ignored.

- [ ] **Step 2: Create the isolated branch from the latest production branch**

```powershell
git fetch origin
git worktree add `
  C:\Code\Project\erp_fish\.worktrees\opening-inventory-two-decimal `
  -b codex/opening-inventory-two-decimal origin/main
```

Expected: the new worktree is clean and starts at `origin/main`.

- [ ] **Step 3: Bring the approved documentation commits into the feature branch**

```powershell
git -C C:\Code\Project\erp_fish\.worktrees\opening-inventory-two-decimal cherry-pick c822460 feat/rev_02
```

Expected: the design and this plan are present on top of `origin/main` with no unrelated files.

- [ ] **Step 4: Install the locked dependencies and copy ignored local configuration**

```powershell
$worktree='C:\Code\Project\erp_fish\.worktrees\opening-inventory-two-decimal'
pnpm --dir $worktree install --frozen-lockfile
Copy-Item -LiteralPath C:\Code\Project\erp_fish\.env.local -Destination $worktree\.env.local
Copy-Item -LiteralPath C:\Code\Project\erp_fish\.vercel -Destination $worktree\.vercel -Recurse
```

Expected: dependencies install without lockfile changes; ignored environment and Vercel project linkage are available without printing secret values.

- [ ] **Step 5: Verify the clean baseline**

```powershell
pnpm --dir $worktree test:unit:file tests/unit/inventory-opening-import.test.mjs
```

Expected: the unmodified `main` baseline test file passes.

---

### Task 2: Make the opening-inventory parser accept two decimals

**Files:**
- Modify: `tests/unit/inventory-opening-import.test.mjs:275-368`
- Modify: `src/features/inventory/opening-import.ts:4-8,374-389`

**Interfaces:**
- Consumes: existing `InventoryOpeningImportError`, `MAX_VALIDATION_DECIMAL`, and `roundToTwoDecimals`.
- Produces: `cellQuantity()` accepts `0`, `0.2`, `0.62`, `0.71` and rejects negative or three-decimal input.

- [ ] **Step 1: Write the failing acceptance test**

Change the parser test to include both numeric and string two-decimal values:

```js
test("parseInventoryOpeningWorkbook reads up to two-decimal quantities and derives opening months", async () => {
  const { parseInventoryOpeningWorkbook } =
    await importInventoryOpeningImport();
  const workbook = createInventoryWorkbook([
    [46203, "삼국유통", "냉)포크오징어", "MA", "냉동", 2.2, 205000, 451000, "", "", ""],
    ["2026-06-30", "삼국유통", "원문광어", "", "생물", "0.62", "29,500", "18,290", "앱광어", "3kg", "앱 매핑"],
    ["2026-06-30", "삼국유통", "참돔", "1kg", "생물", 0.71, 10000, 7100, "", "", ""],
  ]);

  const result = parseInventoryOpeningWorkbook(workbook);

  assert.deepEqual(result.rows.map((row) => row.quantity), [2.2, 0.62, 0.71]);
  assert.equal(result.totalQuantity, 3.53);
  assert.equal(result.totalInventoryAmount, 476390);
});
```

Change the rejection test to use `2.281`, retain the exact row error, and add `-0.1` as an already-required boundary case.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm --dir $worktree test:unit:file `
  --test-name-pattern "reads up to two-decimal quantities" `
  tests/unit/inventory-opening-import.test.mjs
```

Expected: FAIL because `0.62` is rejected by the current one-decimal parser.

- [ ] **Step 3: Implement the local two-decimal boundary**

Replace the one-decimal imports with:

```ts
import {
  MAX_VALIDATION_DECIMAL,
  roundToTwoDecimals,
} from "../../lib/validation.ts";
```

Add a parser-local helper next to `parseNumber`:

```ts
function isNonNegativeTwoDecimalInRange(value: number) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_VALIDATION_DECIMAL
  ) {
    return false;
  }

  const scaled = value * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}
```

Use it in `cellQuantity` and return `roundToTwoDecimals(parsed)`. Do not modify the shared one-decimal helper.

- [ ] **Step 4: Run the parser tests and verify GREEN**

```powershell
pnpm --dir $worktree test:unit:file tests/unit/inventory-opening-import.test.mjs
```

Expected: the full opening-inventory unit test file passes.

- [ ] **Step 5: Commit the parser behavior**

```powershell
git -C $worktree add -- `
  src/features/inventory/opening-import.ts `
  tests/unit/inventory-opening-import.test.mjs
git -C $worktree commit -m "fix: accept two-decimal opening inventory quantities"
```

---

### Task 3: Keep only the simple opening template on the two-decimal policy

**Files:**
- Modify: `tests/unit/inventory-opening-import.test.mjs:575-636`
- Modify: `outputs/inventory_import_template/build-simple-inventory-template.mjs:116-128,162,187,222,234,265`
- Do not modify: `outputs/inventory_import_template/build-inventory-template.mjs`

**Interfaces:**
- Consumes: the existing ExcelJS simple-template builder.
- Produces: future simple templates use `#,##0.00` and `ROUND(cell,2)=cell`; the full template remains one decimal.

- [ ] **Step 1: Split the builder contract test and verify RED**

Replace the combined one-decimal assertion with explicit policies:

```js
test("inventory template builders keep their approved quantity precision", () => {
  // read simpleSource and fullSource as before
  assert.match(simpleSource, /ROUND\(\$\{firstCell\},2\)=\$\{firstCell\}/);
  assert.match(simpleSource, /소수점 둘째 자리까지/);
  assert.match(simpleSource, /numFmt:\s*"#,##0\.00"/);
  assert.match(simpleSource, /twoDecimalQuantityValidation\(inventory,\s*"F4:F2004"\)/);
  assert.match(simpleSource, /twoDecimalQuantityValidation\(lots,\s*"G4:G1004"\)/);

  assert.match(fullSource, /ROUND\(\$\{firstCell\},1\)=\$\{firstCell\}/);
  assert.match(fullSource, /소수점 첫째 자리까지/);
  assert.match(fullSource, /numFmt:\s*"#,##0\.0"/);
});
```

Run:

```powershell
pnpm --dir $worktree test:unit:file `
  --test-name-pattern "builders keep their approved quantity precision" `
  tests/unit/inventory-opening-import.test.mjs
```

Expected: FAIL because the simple builder still uses one decimal.

- [ ] **Step 2: Make the smallest simple-builder changes**

Rename `oneDecimalQuantityValidation` to `twoDecimalQuantityValidation`, change the formula to `ROUND(${firstCell},2)=${firstCell}`, change the error and guide text to `소수점 둘째 자리까지`, change the two quantity column formats to `#,##0.00`, and update only these calls:

```js
twoDecimalQuantityValidation(inventory, "F4:F2004");
twoDecimalQuantityValidation(lots, "G4:G1004");
```

Do not execute the builder because its output path would overwrite the approved customer-based workbook.

- [ ] **Step 3: Verify GREEN and the full-template guard**

```powershell
pnpm --dir $worktree test:unit:file `
  --test-name-pattern "builders keep their approved quantity precision" `
  tests/unit/inventory-opening-import.test.mjs
```

Expected: PASS and the full builder still asserts one-decimal formulas and display formats.

- [ ] **Step 4: Commit the generator contract**

```powershell
git -C $worktree add -- `
  outputs/inventory_import_template/build-simple-inventory-template.mjs `
  tests/unit/inventory-opening-import.test.mjs
git -C $worktree commit -m "fix: align opening inventory template precision"
```

---

### Task 4: Correct the approved workbook and lock its real contract

**Files:**
- Modify: `tests/unit/inventory-opening-import.test.mjs:370-428`
- Modify: `outputs/inventory_import_template/과거_재고_간단_입력_양식.xlsx`
- Update deliverable outside the commit: `outputs/inventory_template_from_123123/123123_소수입력_수정본.xlsx`
- Temporary authoring script: `.tmp/inventory_decimal_work/inventory-template.mjs`

**Interfaces:**
- Consumes: user attachment `C:\Users\KimYS\Documents\카카오톡 받은 파일\123123.xlsx` and the approved two-decimal workbook reconstruction.
- Produces: 66 parsed inventory rows, including row 5 quantity `0.71` and row 53 quantity `1.38`; project and deliverable xlsx hashes match.

- [ ] **Step 1: Write the tracked-workbook regression tests and verify RED**

Change the real-file test to assert:

```js
const result = parseInventoryOpeningWorkbook(workbook);
assert.equal(result.sheetName, "재고입력");
assert.equal(result.rows.length, 66);
assert.equal(result.rows.find((row) => row.rowNumber === 4)?.quantity, 1.5);
assert.equal(result.rows.find((row) => row.rowNumber === 5)?.quantity, 0.71);
assert.equal(result.rows.find((row) => row.rowNumber === 53)?.quantity, 1.38);
```

Replace the generic-builder page-setup assertions with the approved customer-workbook contract:

```js
assert.match(inventory, /sqref="E4:E72"/);
assert.match(inventory, /sqref="F4:F2004"/);
assert.match(inventory, /ROUND\(F4,2\)=F4/);
assert.match(lots, /sqref="G4:G1004"/);
assert.match(lots, /ROUND\(G4,2\)=G4/);
const workbookRelationships = readZipEntry(
  workbook,
  "xl/_rels/workbook.xml.rels",
);
assert.doesNotMatch(workbookRelationships, /externalLink/);
```

Run:

```powershell
pnpm --dir $worktree test:unit:file `
  --test-name-pattern "tracked namespaced inventory template|tracked inventory template preserves" `
  tests/unit/inventory-opening-import.test.mjs
```

Expected: FAIL against the old generic tracked workbook.

- [ ] **Step 2: Author the approved value correction with artifact-tool**

Use the existing continuous artifact-tool builder and add the single approved data change before export:

```js
inventory.getRange("F53").values = [[1.38]];
```

Update its verification assertion from `1.375` to `1.38`, then run with the bundled Node runtime:

```powershell
$node='C:\Users\KimYS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$artifactWork='C:\Code\Project\erp_fish\.tmp\inventory_decimal_work'
& $node "$artifactWork\inventory-template.mjs" --build-attached
& $node "$artifactWork\inventory-template.mjs" --verify-attached
```

Expected: values/formulas comparison passes with the approved F53 exception, formula-error scan reports zero matches, and all four sheets render.

- [ ] **Step 3: Copy the verified artifact to both required locations**

```powershell
$deliverable='C:\Code\Project\erp_fish\outputs\inventory_template_from_123123\123123_소수입력_수정본.xlsx'
$tracked="$worktree\outputs\inventory_import_template\과거_재고_간단_입력_양식.xlsx"
Copy-Item -LiteralPath $deliverable -Destination $tracked -Force
Copy-Item -LiteralPath $deliverable -Destination 'C:\Code\Project\erp_fish\outputs\inventory_import_template\과거_재고_간단_입력_양식.xlsx' -Force
```

Expected: the deliverable, root project copy, and isolated tracked copy have the same SHA256 hash.

- [ ] **Step 4: Verify the real workbook with the app parser and Excel**

```powershell
pnpm --dir $worktree test:unit:file tests/unit/inventory-opening-import.test.mjs
```

Open the isolated tracked file through Excel COM without saving. Confirm `재고입력!F5`, `재고입력!F73`, and `입고별잔량_선택!G5` accept `0.2`, `0.62`, and `0.71`, while `-0.1` and `0.001` return `Validation.Value = false`.

Expected: the full test file passes, Excel opens four sheets, all accepted/rejected cases match, and the binary does not change after the read-only check.

- [ ] **Step 5: Commit the approved workbook and its tests**

```powershell
git -C $worktree add -- `
  outputs/inventory_import_template/과거_재고_간단_입력_양식.xlsx `
  tests/unit/inventory-opening-import.test.mjs
git -C $worktree commit -m "fix: update opening inventory workbook data"
```

---

### Task 5: Run the complete local release gate

**Files:**
- Verify only; no planned source creation.

**Interfaces:**
- Consumes: all implementation commits.
- Produces: fresh evidence that the change is safe to push to production.

- [ ] **Step 1: Run focused and full verification**

```powershell
pnpm --dir $worktree test:unit:file tests/unit/inventory-opening-import.test.mjs
pnpm --dir $worktree test:unit
pnpm --dir $worktree check
pnpm --dir $worktree build
pnpm --dir $worktree audit --audit-level high
git -C $worktree diff --check origin/main...HEAD
git -C $worktree status --short
```

Expected: every command exits 0, no high-severity audit finding blocks release, and only intentional commits differ from `origin/main`.

- [ ] **Step 2: Review the exact production diff**

```powershell
git -C $worktree log --oneline origin/main..HEAD
git -C $worktree diff --stat origin/main...HEAD
git -C $worktree diff origin/main...HEAD -- `
  src/features/inventory/opening-import.ts `
  tests/unit/inventory-opening-import.test.mjs `
  outputs/inventory_import_template/build-simple-inventory-template.mjs
```

Expected: no shared validation, DB schema, full template builder, unrelated code, secrets, or customer reference files are included.

---

### Task 6: Fast-forward main and verify the automatic production deployment

**Files:**
- No additional planned file changes.

**Interfaces:**
- Consumes: verified feature branch and Vercel's Git integration for `main`.
- Produces: `origin/main` at the implementation SHA, green CI, Vercel deployment for that SHA, and a healthy production URL.

- [ ] **Step 1: Reconfirm origin/main has not moved**

```powershell
git -C $worktree fetch origin
git -C $worktree merge-base --is-ancestor origin/main HEAD
```

Expected: exit 0. If `origin/main` moved, rebase the feature branch onto it and rerun Task 5 before continuing.

- [ ] **Step 2: Fast-forward local main and rerun the focused gate**

```powershell
git -C $worktree switch main
git -C $worktree merge --ff-only codex/opening-inventory-two-decimal
pnpm --dir $worktree test:unit:file tests/unit/inventory-opening-import.test.mjs
pnpm --dir $worktree check
pnpm --dir $worktree build
```

Expected: fast-forward succeeds and merged `main` passes the fresh gate.

- [ ] **Step 3: Push main once and capture the exact SHA**

```powershell
git -C $worktree push origin main
$sha=git -C $worktree rev-parse origin/main
```

Expected: push succeeds; this single `main` push triggers the Vercel production deployment. Do not run `vercel --prod`.

- [ ] **Step 4: Wait for GitHub CI and Vercel**

```powershell
$run=gh run list --repo lsy9344/erp_fish --workflow CI --branch main --commit $sha --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json
gh run watch $run.databaseId --repo lsy9344/erp_fish --exit-status

gh api "repos/lsy9344/erp_fish/commits/$sha/status" `
  --jq '.statuses[] | select(.context=="Vercel") | {state,description,target_url}'

vercel inspect https://erp-fish.vercel.app --wait --timeout 5m
vercel inspect https://erp-fish.vercel.app --logs |
  Select-String -Pattern 'Cloning|Commit:|No pending migrations|Deployment completed|Error'
```

Expected: CI conclusion is `success`; Vercel status is `success`/`Ready`; deployment logs show the same `$sha` and no error.

- [ ] **Step 5: Perform a non-mutating production smoke check**

```powershell
(Invoke-WebRequest https://erp-fish.vercel.app -Method Head -TimeoutSec 30).StatusCode
```

Expected: HTTP 200 or the existing expected authentication redirect. Do not upload the workbook to production during automated verification because that would create or update real inventory data.

- [ ] **Step 6: Record final evidence**

Report the merged SHA, CI URL, Vercel deployment URL/status, production HTTP result, deliverable link, and the fact that production data was not mutated during smoke verification.
