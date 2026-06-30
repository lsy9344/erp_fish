# Release Checklist

Use this checklist before production deployment.

## Database

- Confirm a fresh database backup exists and restore access is available.
- Do not approve release with real business data until backup/PITR or an
  equivalent restore procedure has been rehearsed on staging.
- Run a migration dry run against staging or a production-like clone.
- Record the rollback or restore path, including the command and responsible
  operator.
- Confirm the release uses the expected `DATABASE_URL`.
- Confirm destructive reset scripts were not run against production. Remote
  destructive resets require explicit approval and `ALLOW_REMOTE_DESTRUCTIVE_RESET=yes`.

## Secrets

- Confirm `AUTH_SECRET` is present in the target environment and is not a local
  test value.
- Confirm no Vercel/Neon env dump files are tracked in git. If any secret was
  ever committed, rotate the exposed DB/Vercel credentials and document the
  rotation evidence before release.
- Review secret rotation needs for this release.
- Confirm seed password values are not committed or reused from local examples.
- Confirm `ALLOW_PRODUCTION_SEED` and `ALLOW_SEED_PASSWORD_ROTATION` are not set
  unless the release explicitly needs them and the reason is approved.
- Confirm `pnpm audit --audit-level high` passes.

## Permissions

- Run the store-manager permission profile SQL from `README.md`.
- Attach the result as permission profile evidence for the release review.
- Confirm headquarters users that can export reports have the intended
  `EXPORT_CREATE` permission.

## Verification Evidence

- Attach the CI run URL.
- Attach `pnpm test:api` evidence.
- Attach `pnpm test:e2e:core` evidence, or all split core group evidence
  (`ledger`, `hq`, `admin`, `imports`), or full E2E evidence.
- Confirm the core E2E evidence covers 10+ store search/status operations from
  `tests/e2e/master-data-stores.spec.ts`.
- Attach any failed-check rerun notes with the original failure link.

## Policy Gates

- Do not approve release if store-manager pages expose gross margin rate,
  inventory amount, cost, profit, FIFO/lot data, headquarters fixed cost, or
  cross-store comparison values before written approval.
- Do not approve release if ECOUNT ledger upload, preview, commit, void, or
  reprocess flows are opened without source preservation, row hash, mapping
  version, selected store/date validation, permissions, and audit logs.
- Do not approve release if FIFO lot history, integrated inventory amounts,
  bulk closing, monthly fixed-cost profit/loss, HR/payroll, external
  notifications, AI analysis, or operations-contract automation are included as
  completed product scope before policy approval.
- Do not approve release if `ENABLE_HR_PREVIEW=true` is enabled without the
  employee/payroll policy approval record.

## Go/No-Go

- Confirm the migration, rollback, restore, secret rotation, permission profile,
  CI, audit, and E2E evidence are all present.
- Do not approve release if rollback or restore steps are unknown.
- Do not approve release if policy-gated features appear complete in UI,
  release notes, or customer-facing documents without the matching approval
  record.
