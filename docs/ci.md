# GitHub CI Guide

## What Runs

The workflow lives at `.github/workflows/ci.yml`.

- Pull requests run `Quality Gate`, `API Tests`, and `Playwright Smoke`.
- Pushes to feature, `develop`, `staging`, `main`, and `master` branches run
  the same fast checks.
- Pull request updates and pushes from the same branch cancel older in-progress runs.
- `Playwright Smoke` runs representative E2E smoke tests as three parallel groups:
  `ledger`, `hq`, and `admin`.
- The broader core E2E bundle stays in `pnpm test:e2e:core` for local release
  checks.
- Pushes do not run the full Playwright suite automatically. This keeps deploy
  test pushes fast, including pushes to `main`.
- The nightly schedule runs the full Playwright suite in 4 shards at 19:00 UTC
  (04:00 KST). The full Playwright shards run only `tests/e2e`; API tests stay
  in `API Tests`.
- Manual runs can trigger full Playwright and burn-in when needed.
  Manual full Playwright runs skip the smoke job because the full suite covers
  the same tests.
  Manual burn-in runs a 10-iteration smoke loop to catch flaky UI timing.

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

## Branch And Deployment Flow

Recommended branch roles:

- `main`: production deployment branch.
- `staging`: deployment branch for testing on a real preview URL.
- Feature branches: short-lived implementation branches.

Code in this repository controls GitHub Actions, Vercel cron entries in
`vercel.json`, package scripts, and documentation. The deployment platform UI
controls which Git branch is the production branch, which branches receive
preview/staging deployments, production and preview environment variables,
domains, aliases, and GitHub integration settings.

Current Vercel branch setup:

- Production Branch: `main`.
- Preview Branch: `staging`, covered by Vercel's Preview target.
- Stable staging URL:
  `https://erp-fish-git-staging-noahs-projects-731be159.vercel.app`.
- Staging-specific Preview env: `AUTH_SECRET`, `AUTH_TRUST_HOST`.

Pushes to `staging` create/update that Vercel Preview URL. Use it for quick
deployment checks before merging or promoting production changes.

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

Playwright jobs run inside the official Playwright container image, so they use
the same PostgreSQL service through the `postgres` service hostname instead of
`localhost`.

## Artifacts

Playwright uploads artifacts when a Playwright job fails or is cancelled:

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

- If CI fails during install, rerun once. Dependency cache may be cold.
- If Playwright fails, download the failed job artifact and inspect `test-results`.
- If PR smoke is slow, check which `Playwright Smoke` group is slow and run the
  matching local command: `pnpm test:e2e:smoke:ledger`,
  `pnpm test:e2e:smoke:hq`, or `pnpm test:e2e:smoke:admin`.
- If smoke passes but a release path needs broader coverage, run
  `pnpm test:e2e:core` or the matching core group locally.
- If full e2e is slow, check which shard is slow and run that file locally with `pnpm test:playwright -- <file>`.
- If a manual grep run behaves oddly, prefer file and line targeting, for example `tests/e2e/auth.spec.ts:16`.
