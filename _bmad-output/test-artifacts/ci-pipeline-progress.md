---
stepsCompleted:
  [
    "step-01-preflight",
    "step-02-generate-pipeline",
    "step-03-configure-quality-gates",
    "step-04-validate-and-summary",
  ]
lastStep: "step-04-validate-and-summary"
lastSaved: "2026-06-18"
---

# CI Pipeline Progress

## Step 1: Preflight

- Git repository: present.
- Remote: `origin` points to GitHub.
- Stack: fullstack, because the project has Next.js app routes, Prisma, Node tests, and Playwright.
- Test framework: Node test runner for unit tests, Playwright for API/e2e tests.
- CI platform: GitHub Actions.
- Node version: 22 via `.nvmrc` and workflow env.

## Step 2: Pipeline

- Created `.github/workflows/ci.yml`.
- PR and branch pushes run fast checks: format, lint, typecheck, unit, build, and one Playwright smoke test.
- Full Playwright is sharded across 4 jobs and only runs on main/master push or manual request.
- Playwright artifacts upload only on failure.

## Step 3: Quality Gates

- Quality gate fails on any format, lint, type, unit, build, or smoke e2e failure.
- PostgreSQL service is isolated to `erp_fish_e2e`.
- Burn-in runs the smoke Playwright test 10 times on weekly schedule or manual request.
- No Slack/email notification is configured because no notification secret exists.

## Step 4: Summary

- Normal CI requires no GitHub secrets.
- Usage guide: `docs/ci.md`.
- Secret guidance: `docs/ci-secrets-checklist.md`.
