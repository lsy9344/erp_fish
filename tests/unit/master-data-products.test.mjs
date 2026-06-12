import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  return path.join(root, ...segments);
}

function readProjectFile(...segments) {
  return readFileSync(projectPath(...segments), "utf8");
}

function assertProjectFile(...segments) {
  const filePath = projectPath(...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

test("Prisma schema keeps products, purchase standards, and ledger snapshots without hard-delete semantics", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = projectPath("prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames
    .filter((name) => name > "20260529133500_add_user_management_fields")
    .find((name) => {
      const migrationPath = path.join(migrationsRoot, name, "migration.sql");
      return (
        existsSync(migrationPath) &&
        /CREATE TABLE "Product"/.test(readFileSync(migrationPath, "utf8")) &&
        /CREATE TABLE "PurchaseStandard"/.test(
          readFileSync(migrationPath, "utf8"),
        )
      );
    });

  assert.match(schema, /model\s+Product\s*{[^}]*id\s+String\s+@id[^}]*}/s);
  assert.match(schema, /model\s+Product\s*{[^}]*name\s+String[^}]*}/s);
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*category\s+(?:ProductCategory|String)[^}]*}/s,
  );
  assert.match(schema, /model\s+Product\s*{[^}]*spec\s+String[^}]*}/s);
  assert.match(schema, /model\s+Product\s*{[^}]*defaultUnitPrice\s+Int[^}]*}/s);
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s,
  );
  assert.match(schema, /model\s+Product\s*{[^}]*updatedById\s+String\?[^}]*}/s);
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*updatedBy\s+User\?[^}]*@relation/s,
  );
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*purchaseStandards\s+PurchaseStandard\[\][^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*@@unique\(\[name,\s*category,\s*spec\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+PurchaseStandard\s*{[^}]*productId\s+String[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+PurchaseStandard\s*{[^}]*standardUnitPrice\s+Int\?[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+PurchaseStandard\s*{[^}]*referenceInfo\s+String\?[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+PurchaseStandard\s*{[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+PurchaseStandard\s*{[^}]*product\s+Product\s+@relation\([^)]*onDelete:\s*(?:Restrict|NoAction)[^)]*\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*updatedProducts\s+Product\[\][^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*updatedPurchaseStandards\s+PurchaseStandard\[\][^}]*}/s,
  );
  assert.ok(
    storyMigration,
    "Product and PurchaseStandard migration should exist after the user-management migration",
  );
  assert.match(
    readFileSync(
      path.join(migrationsRoot, storyMigration, "migration.sql"),
      "utf8",
    ),
    /CREATE UNIQUE INDEX "Product_name_category_spec_key" ON "Product"\("name", "category", "spec"\)/,
  );

  for (const modelName of [
    "LedgerPurchaseItem",
    "LedgerInventoryItem",
    "LedgerInventoryAdjustment",
    "LedgerLossItem",
    "InventoryOpeningSnapshot",
  ]) {
    const modelPattern = new RegExp(`model\\s+${modelName}\\s*{[^}]*}`, "s");
    const model = schema.match(modelPattern)?.[0] ?? "";

    assert.match(model, /productName\s+String/);
    assert.match(model, /productCategory\s+String/);
    assert.match(model, /productSpec\s+String/);
    assert.match(model, /unitPrice\s+Int/);
  }
});

test("product schemas normalize input and return Korean field errors", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "product-schemas.ts",
  );
  const { productFormSchema, productStatusSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const parsed = productFormSchema.parse({
    name: "  스토리52 고등어  ",
    category: " 냉동 ",
    spec: " 10kg ",
    defaultUnitPrice: "12000",
  });

  assert.deepEqual(parsed, {
    name: "스토리52 고등어",
    category: "냉동",
    spec: "10kg",
    defaultUnitPrice: 12000,
    isActive: true,
  });
  assert.deepEqual(productStatusSchema.parse({ isActive: false }), {
    isActive: false,
  });

  const blank = productFormSchema.safeParse({
    name: " ",
    category: " ",
    spec: " ",
    defaultUnitPrice: "-1",
  });
  assert.equal(blank.success, false);
  assert.deepEqual(blank.error.flatten().fieldErrors.name, [
    "품목명을 입력해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.category, [
    "구분을 선택해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.spec, [
    "규격을 입력해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.defaultUnitPrice, [
    "기본 단가는 0원 이상의 정수여야 합니다.",
  ]);

  const decimal = productFormSchema.safeParse({
    name: "스토리52 고등어",
    category: "냉동",
    spec: "10kg",
    defaultUnitPrice: "12.5",
  });
  assert.equal(decimal.success, false);
  assert.deepEqual(decimal.error.flatten().fieldErrors.defaultUnitPrice, [
    "기본 단가는 0원 이상의 정수여야 합니다.",
  ]);

  const tooLarge = productFormSchema.safeParse({
    name: "스토리52 고등어",
    category: "냉동",
    spec: "10kg",
    defaultUnitPrice: "2147483648",
  });
  assert.equal(tooLarge.success, false);
  assert.deepEqual(tooLarge.error.flatten().fieldErrors.defaultUnitPrice, [
    "기본 단가는 0원 이상의 정수여야 합니다.",
  ]);
});

test("purchase standard schema requires a product and price or reference info", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-schemas.ts",
  );
  const { purchaseStandardFormSchema, purchaseStandardStatusSchema } =
    await import(pathToFileURL(schemaPath).href);

  assert.deepEqual(
    purchaseStandardFormSchema.parse({
      productId: " product-1 ",
      standardUnitPrice: "",
      referenceInfo: "  30% 단가 참고  ",
    }),
    {
      productId: "product-1",
      standardUnitPrice: null,
      referenceInfo: "30% 단가 참고",
      isActive: true,
    },
  );
  assert.deepEqual(
    purchaseStandardFormSchema.parse({
      productId: "product-1",
      standardUnitPrice: "9900",
      referenceInfo: "",
      isActive: false,
    }),
    {
      productId: "product-1",
      standardUnitPrice: 9900,
      referenceInfo: null,
      isActive: false,
    },
  );
  assert.deepEqual(purchaseStandardStatusSchema.parse({ isActive: true }), {
    isActive: true,
  });

  const blank = purchaseStandardFormSchema.safeParse({
    productId: " ",
    standardUnitPrice: "",
    referenceInfo: " ",
  });
  assert.equal(blank.success, false);
  assert.deepEqual(blank.error.flatten().fieldErrors.productId, [
    "품목을 선택해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.standardUnitPrice, [
    "기준 단가 또는 참조 정보를 입력해 주세요.",
  ]);

  const negative = purchaseStandardFormSchema.safeParse({
    productId: "product-1",
    standardUnitPrice: "-100",
    referenceInfo: "",
  });
  assert.equal(negative.success, false);
  assert.deepEqual(negative.error.flatten().fieldErrors.standardUnitPrice, [
    "기준 단가는 0원 이상의 정수여야 합니다.",
  ]);

  const tooLarge = purchaseStandardFormSchema.safeParse({
    productId: "product-1",
    standardUnitPrice: "2147483648",
    referenceInfo: "",
  });
  assert.equal(tooLarge.success, false);
  assert.deepEqual(tooLarge.error.flatten().fieldErrors.standardUnitPrice, [
    "기준 단가는 0원 이상의 정수여야 합니다.",
  ]);
});

test("product and purchase standard actions enforce auth, audit, transactions, and revalidation", () => {
  const productActions = readProjectFile(
    "src",
    "features",
    "master-data",
    "product-actions.ts",
  );
  const standardActions = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-actions.ts",
  );

  assert.match(productActions, /"use server"/);
  assert.match(productActions, /export\s+async\s+function\s+createProduct/);
  assert.match(productActions, /export\s+async\s+function\s+updateProduct/);
  assert.match(
    productActions,
    /export\s+async\s+function\s+updateProductStatus/,
  );
  assert.match(productActions, /requireSettingsAccess\(\)/);
  assert.match(productActions, /db\.\$transaction/);
  assert.match(productActions, /writeAuditLog/);
  assert.match(productActions, /product\.created/);
  assert.match(productActions, /product\.updated/);
  assert.match(productActions, /product\.activated/);
  assert.match(productActions, /product\.deactivated/);
  assert.match(productActions, /before:\s*toProductAuditValue\(existing\)/);
  assert.match(productActions, /after:\s*toProductAuditValue\(updated\)/);
  assert.match(productActions, /ActionResult/);
  assert.match(productActions, /DUPLICATE_PRODUCT/);
  assert.match(
    productActions,
    /revalidatePath\("\/app\/master-data\/products"\)/,
  );
  assert.match(
    productActions,
    /revalidatePath\("\/app\/master-data\/purchase-standards"\)/,
  );
  assert.match(productActions, /revalidatePath\("\/app\/dashboard"\)/);
  assert.match(productActions, /revalidatePath\("\/app\/store-entry"\)/);
  assert.doesNotMatch(
    productActions,
    /export\s+async\s+function\s+deleteProduct/,
  );
  assert.doesNotMatch(productActions, /\.delete\(/);
  assert.doesNotMatch(productActions, /ledgerPurchaseItem\.update/i);
  assert.doesNotMatch(productActions, /ledgerInventoryItem\.update/i);
  assert.doesNotMatch(productActions, /ledgerInventoryAdjustment\.update/i);
  assert.doesNotMatch(productActions, /ledgerLossItem\.update/i);
  assert.doesNotMatch(productActions, /inventoryOpeningSnapshot\.update/i);

  assert.match(standardActions, /"use server"/);
  assert.match(
    standardActions,
    /export\s+async\s+function\s+createPurchaseStandard/,
  );
  assert.match(
    standardActions,
    /export\s+async\s+function\s+updatePurchaseStandard/,
  );
  assert.match(
    standardActions,
    /export\s+async\s+function\s+updatePurchaseStandardStatus/,
  );
  assert.match(standardActions, /requireSettingsAccess\(\)/);
  assert.match(standardActions, /db\.\$transaction/);
  assert.match(standardActions, /writeAuditLog/);
  assert.match(standardActions, /purchase_standard\.created/);
  assert.match(standardActions, /purchase_standard\.updated/);
  assert.match(standardActions, /purchase_standard\.activated/);
  assert.match(standardActions, /purchase_standard\.deactivated/);
  assert.match(standardActions, /ActionResult/);
  assert.match(standardActions, /INACTIVE_PRODUCT_STANDARD_ACTIVATION/);
  assert.match(standardActions, /product\.isActive/);
  assert.match(
    standardActions,
    /revalidatePath\("\/app\/master-data\/purchase-standards"\)/,
  );
  assert.match(standardActions, /revalidatePath\("\/app\/dashboard"\)/);
  assert.match(standardActions, /revalidatePath\("\/app\/store-entry"\)/);
  assert.doesNotMatch(
    standardActions,
    /export\s+async\s+function\s+deletePurchaseStandard/,
  );
  assert.doesNotMatch(standardActions, /\.delete\(/);
});

test("product and purchase standard queries expose headquarters lists and active options", () => {
  const productQueries = readProjectFile(
    "src",
    "features",
    "master-data",
    "product-queries.ts",
  );
  const standardQueries = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-queries.ts",
  );

  assert.match(productQueries, /getProductsForHeadquarters/);
  assert.match(productQueries, /getActiveProductOptions/);
  assert.match(productQueries, /normalizeProductSearch/);
  assert.match(productQueries, /normalizeProductCategoryFilter/);
  assert.match(productQueries, /normalizeProductStatusFilter/);
  assert.match(productQueries, /requireSettingsAccess\(\)/);
  assert.match(productQueries, /requireAppUser\(\)/);
  assert.match(productQueries, /name:\s*{\s*contains:\s*q/s);
  assert.match(productQueries, /category/);
  assert.match(productQueries, /isActive:\s*true/);

  assert.match(standardQueries, /getPurchaseStandardsForHeadquarters/);
  assert.match(standardQueries, /getActivePurchaseStandardOptions/);
  assert.match(standardQueries, /requireSettingsAccess\(\)/);
  assert.match(standardQueries, /product:\s*{/);
  assert.match(standardQueries, /isActive:\s*true/);
  assert.match(standardQueries, /product:\s*{\s*isActive:\s*true\s*}/s);
});

test("Story 5.2 stays within basic product master scope", () => {
  const productActions = readProjectFile(
    "src",
    "features",
    "master-data",
    "product-actions.ts",
  );
  const productClient = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "product-management-client.tsx",
  );
  const routesRoot = projectPath("src", "app", "api", "products");

  assert.equal(
    existsSync(projectPath("src", "features", "products")),
    false,
    "Story 5.2 should extend src/features/master-data instead of adding a products domain",
  );
  assert.equal(
    existsSync(routesRoot),
    false,
    "Story 5.2 should not add a public /app/api/products route handler",
  );
  for (const source of [productActions, productClient]) {
    assert.doesNotMatch(source, /alias|별칭|merge|병합/i);
    assert.doesNotMatch(source, /eCount|이카운트/i);
    assert.doesNotMatch(source, /FIFO|fifo/);
    assert.doesNotMatch(source, /mapping|매핑/i);
    assert.doesNotMatch(source, /effectiveStart|적용 시작일/i);
  }
});

test("product and purchase standard screens follow headquarters shell and form accessibility contracts", () => {
  const productsPage = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "products",
    "page.tsx",
  );
  const standardsPage = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "purchase-standards",
    "page.tsx",
  );
  const productClient = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "product-management-client.tsx",
  );
  const standardClient = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "purchase-standard-management-client.tsx",
  );
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.match(productsPage, /requireSettingsAccess/);
  assert.match(productsPage, /HeadquartersShell/);
  assert.match(productsPage, /ProductManagementClient/);
  assert.match(standardsPage, /requireSettingsAccess/);
  assert.match(standardsPage, /HeadquartersShell/);
  assert.match(standardsPage, /PurchaseStandardManagementClient/);
  assert.match(productClient, /inputMode="numeric"/);
  assert.match(productClient, /aria-invalid/);
  assert.match(productClient, /aria-describedby/);
  assert.match(productClient, /focusFirstError/);
  assert.match(standardClient, /inputMode="numeric"/);
  assert.match(standardClient, /aria-invalid/);
  assert.match(standardClient, /aria-describedby/);
  assert.match(standardClient, /focusFirstError/);
  assert.match(sidebar, /\/app\/master-data\/products/);
  assert.match(sidebar, /\/app\/master-data\/purchase-standards/);
});
