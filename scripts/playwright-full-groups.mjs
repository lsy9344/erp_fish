// Keep each group sequential: specs share the guarded, freshly seeded test DB.
// Every group uses next start; the provider fixture runs in the test process.
export const fullE2EGroups = [
  {
    id: 1,
    serverMode: "production",
    specs: [
      "auth",
      "chat-widget",
      "historical-import-lifecycle",
      "hq-reports-comparison",
      "hq-reports-monthly",
      "labor-employees",
      "master-data-codes",
      "master-data-stores",
      "master-data-users",
      "permission-profiles",
    ],
  },
  {
    id: 2,
    serverMode: "production",
    specs: [
      "anomaly-thresholds",
      "calculation-policy-gates",
      "ecount-supply-imports",
      "employee-past-wage",
      "headquarters-expenses",
      "hq-closed-ledger-sales-price",
      "hq-ledger-corrections",
      "hq-ledger-edit",
      "hq-reports",
    ],
  },
  {
    id: 3,
    serverMode: "production",
    specs: [
      "hq-dashboard",
      "hq-reports-daily",
      "inventory-plan-regressions",
      "store-ledger-inventory",
      "store-ledger-inventory-adjustment",
      "store-ledger-cost-labor",
    ],
  },
  {
    id: 4,
    serverMode: "production",
    specs: [
      "hq-reports-inventory",
      "hq-reports-review",
      "master-data-history",
      "master-data-products",
      "master-data-purchase-standards",
      "meeting-0627-acceptance",
      "store-ledger-conflicts",
      "store-ledger-losses",
      "store-ledger-purchase",
      "store-ledger-review",
      "store-ledger-sales",
      "store-sales-price-plan",
    ],
  },
];

export function getFullE2EGroup(id) {
  const group = fullE2EGroups.find((entry) => String(entry.id) === String(id));
  if (!group) throw new Error(`Unknown full E2E group: ${id}`);
  return {
    ...group,
    specs: group.specs.map((name) => `tests/e2e/${name}.spec.ts`),
  };
}
