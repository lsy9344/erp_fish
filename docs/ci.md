# GitHub CI Guide

## What Runs

The workflow lives at `.github/workflows/ci.yml`. The design goal is fast
feedback on the common case (a small change pushed to a feature branch) and
heavier verification only at integration points (PR, `staging`, `main`).

- Pushes to feature branches run only `Fast Checks` (lint + typecheck + unit,
  no DB, no build, no browser) — about 1-2 minutes. This is the everyday loop.
- Pull requests run `Fast Checks`, `Production Build`, `API Tests`, and
  `Playwright Smoke`.
- Pull request updates and pushes from the same branch cancel older in-progress runs.
- `Playwright Smoke` runs representative E2E smoke tests as three parallel groups:
  `ledger`, `hq`, and `admin`.
- Pushes to `staging` run `Fast Checks`, `Production Build`, `API Tests`, and the
  broader core E2E bundle split into four parallel groups: `ledger`, `hq`,
  `admin`, and `imports`. Smoke is skipped here because core covers it.
- Pushes to `main` or `master` run `Fast Checks`, `Production Build`, `API Tests`,
  and the full Playwright suite in 4 shards. The smoke job is skipped on those
  pushes because the full suite covers it.
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

## Pre-Push Hook

A shared git hook at `.githooks/pre-push` runs `lint + typecheck + unit` locally
before every push, so the same failures `Fast Checks` would catch on CI are
caught in seconds on your machine. It is the same gate, just earlier.

Enable it once per clone (the hook file is committed; the `core.hooksPath`
pointer is local git config and is not):

```bash
git config core.hooksPath .githooks
```

The hook works regardless of which tool performs the push (plain git, Claude
Code, Codex CLI) because it is a git-level hook, not tied to any one tool.

Bypass options:

- One push only: `git push --no-verify`
- Persistently in a shell: set `SKIP_PREPUSH=1`

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
deployment checks before merging or promoting production changes. GitHub Actions
also runs the core E2E `ledger`, `hq`, `admin`, and `imports` groups on `staging` so
multiple feature branches are tested together before promotion.

## Database Used In CI

CI starts a PostgreSQL service with this database:

```text
postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e
```

The Playwright wrapper forces test runs to use a test-like database, so inherited local values such as `DATABASE_URL=rider` cannot leak into CI.

The build and test jobs also create a short-lived test `.env` file from CI
environment values. Playwright commands use `PLAYWRIGHT_DATABASE_URL` through
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
- Before merging a feature branch: PR CI.
- Before promoting to production: merge to `staging` and wait for core E2E.
- After `main` or `master` push: full Playwright runs automatically.
- After broad risky UI changes: manual full e2e can still be run before merge.
- Suspected flaky test: manual burn-in.

## Troubleshooting

- If CI fails during install, rerun once. Dependency cache may be cold.
- If Playwright fails, download the failed job artifact and inspect `test-results`.
- If PR smoke is slow, check which `Playwright Smoke` group is slow and run the
  matching local command: `pnpm test:e2e:smoke:ledger`,
  `pnpm test:e2e:smoke:hq`, or `pnpm test:e2e:smoke:admin`.
- If staging core E2E fails, run the matching local group:
  `pnpm test:e2e:core:ledger`, `pnpm test:e2e:core:hq`,
  `pnpm test:e2e:core:admin`, or `pnpm test:e2e:core:imports`.
- If full e2e is slow, check which shard is slow and run that file locally with `pnpm test:playwright -- <file>`.
- If a manual grep run behaves oddly, prefer file and line targeting, for example `tests/e2e/auth.spec.ts:16`.
