# GitHub CI Guide

## What Runs

The workflow lives at `.github/workflows/ci.yml`.

- Pull requests run `Quality Gate` and `Playwright Smoke`.
- Pushes to feature branches run the same fast checks.
- `Playwright Smoke` runs representative E2E smoke tests as three parallel groups:
  `ledger`, `hq`, and `admin`.
- The broader core E2E bundle stays in `pnpm test:e2e:core` for local release
  checks.
- Pushes to `main` or `master` also run the full Playwright suite in 4 shards.
  The smoke job is skipped on those pushes because the full suite covers it.
- A weekly schedule runs a 10-iteration smoke burn-in to catch flaky UI timing.
- Manual runs can trigger full Playwright and burn-in when needed.
  Manual full Playwright runs skip the smoke job because the full suite covers
  the same tests.

## Fast Local Loop

Use these while developing:

```bash
pnpm test:unit:file tests/unit/example.test.mjs
pnpm test:unit
pnpm typecheck
pnpm test:playwright -- tests/e2e/auth.spec.ts:16 --reporter=line
pnpm test:e2e:smoke:ledger
```

Run the heavier checks before pushing important work:

```bash
pnpm lint
pnpm format:check
pnpm build
```

## Manual GitHub Run

1. Open the repository on GitHub.
2. Go to `Actions`.
3. Select `CI`.
4. Click `Run workflow`.
5. Choose options:
   - `run_full_e2e`: runs the full Playwright suite in 4 shards and skips
     smoke.
   - `run_burn_in`: runs the smoke test with `--repeat-each=10`.
   - `e2e_grep`: optional text filter for manual full e2e runs.

## Database Used In CI

CI starts a PostgreSQL service with this database:

```text
postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e
```

The Playwright wrapper forces test runs to use a test-like database, so inherited local values such as `DATABASE_URL=rider` cannot leak into CI.

The quality job also creates a short-lived test `.env` file from CI environment
values. Playwright commands use `PLAYWRIGHT_DATABASE_URL` through
`scripts/run-playwright-clean.mjs`, and the wrapper refuses production-like
database names before tests start.

## Artifacts

Playwright uploads artifacts only on failure:

- `test-results/`
- `playwright-report/`

Artifacts are kept for 14 days.

## When To Use Each Check

- Small code change: unit file, typecheck.
- Server logic change: related unit tests, full unit tests, typecheck.
- UI/navigation/auth change: one targeted Playwright test.
- Before merge: PR CI.
- Before release or after broad UI changes: manual full e2e.
- Suspected flaky test: manual burn-in.

## Troubleshooting

- If CI fails during install, rerun once. Dependency or browser cache may be cold.
- If Playwright fails, download the failed job artifact and inspect `test-results`.
- If PR smoke is slow, check which `Playwright Smoke` group is slow and run the
  matching local command: `pnpm test:e2e:smoke:ledger`,
  `pnpm test:e2e:smoke:hq`, or `pnpm test:e2e:smoke:admin`.
- If smoke passes but a release path needs broader coverage, run
  `pnpm test:e2e:core` or the matching core group locally.
- If full e2e is slow, check which shard is slow and run that file locally with `pnpm test:playwright -- <file>`.
- If a manual grep run behaves oddly, prefer file and line targeting, for example `tests/e2e/auth.spec.ts:16`.
