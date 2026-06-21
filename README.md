# ERP Fish

ERP Fish is an internal ERP web app built with Next.js, Prisma, PostgreSQL,
NextAuth/Auth.js, Tailwind CSS, and shadcn/ui. The current local workflow uses
Docker PostgreSQL and seed-created internal accounts.

## Local Docker Test Run

This project runs PostgreSQL through Docker and runs the Next.js app on your PC
with `pnpm`.

### Fixed Local Values

- PostgreSQL service name: `postgres`
- Database name: `erp_fish`
- Database user: `postgres`
- Database password: `erp_fish_local_pw`
- Local database port: `5432`
- Database URL:
  `postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish`
- Auth local host trust: `AUTH_TRUST_HOST=true`
- Headquarters seed email: `admin@example.com`
- Headquarters seed name: `본사 관리자`
- Store manager seed email: `store-manager@example.com`

Do not commit real seed passwords. Set local values in `.env`.

### First Setup

1. Install Docker Desktop and keep it running.
2. Install Node.js and pnpm.
3. Create `.env` from `.env.example` if `.env` does not exist.
4. Fill the required local secrets in `.env`:

```env
AUTH_SECRET="generate-a-new-random-secret-of-at-least-32-characters"
SEED_HQ_PASSWORD="choose-a-local-password-of-at-least-12-characters"
SEED_STORE_MANAGER_PASSWORD="choose-a-local-password-of-at-least-12-characters"
```

Generate a local `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

5. Start PostgreSQL:

```bash
docker compose up -d
```

6. Install packages:

```bash
pnpm install
```

7. Apply Prisma migrations:

```bash
pnpm db:migrate
```

8. Create or update the seed headquarters and store manager accounts:

```bash
pnpm db:seed
```

9. Build and start the app in production mode:

```bash
pnpm build
pnpm start
```

10. Open `http://localhost:3000` and log in with:

```text
admin@example.com
the SEED_HQ_PASSWORD value from your local .env
```

For the full first-run account, password rotation, store manager assignment,
and 10+ store operation procedure, see
[`docs/first-run-accounts-and-store-management.md`](docs/first-run-accounts-and-store-management.md).

### Daily Start

```bash
docker compose up -d
pnpm start
```

Run `pnpm build` again before `pnpm start` when source code changed.

### Validation

Use the fast checks while developing:

```bash
pnpm db:validate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:unit:file tests/unit/example.test.mjs
```

Run the release gate as one serial command:

```bash
pnpm release:preflight
```

This command runs DB validation, typecheck, lint, build, unit tests, API tests,
core E2E, and `git diff --check` in order. Do not run `pnpm build`,
`pnpm test:api`, or E2E Playwright commands in parallel in the same worktree
because they can touch the same `.next` output. Use a separate worktree or an
isolated build output if parallel release checks are needed.

Run `pnpm build` before handing work off when the full release gate is not
needed:

```bash
pnpm build
```

Playwright runs through `scripts/run-playwright-clean.mjs` so inherited shell
variables from other projects cannot point tests at the wrong database.
By default it uses:

```text
DATABASE_URL=postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e
PORT=3102
```

Create the e2e database once if it does not exist:

```bash
docker exec erp_fish_postgres createdb -U postgres erp_fish_e2e
```

Run only the Playwright file or test you need:

```bash
pnpm test:e2e -- tests/e2e/auth.spec.ts
pnpm test:e2e -- tests/e2e/store-ledger-inventory.spec.ts -g "월초 스냅샷"
pnpm test:playwright -- tests/e2e/auth.spec.ts -g "비로그인 사용자가 루트 경로"
pnpm test:playwright -- tests/api/report-export.spec.ts
```

The release smoke bundle covers representative store-ledger, headquarters,
report/export, permission, master-data, and anomaly-threshold flows:

```bash
pnpm test:e2e:core
```

Prisma CLI commands read `DATABASE_URL` directly. They do not run the app-level
normalization in `src/env.js`, so release shells must provide a standard
`postgresql://` or `postgres://` URL before running:

```bash
pnpm db:validate
pnpm db:migrate
```

### Release Preflight Notes

- Before production deployment, complete `docs/release-checklist.md`.
- The live production stack, infrastructure, and exact deploy procedure are
  recorded in `docs/production-deployment.md`.
- FIFO lot policy for this release is forward-only. Existing ledgers without
  FIFO lots keep the existing fallback calculation, and FIFO-derived money
  metrics stay in the "기준 확인 필요" state when the basis is not confirmed.
  Historical FIFO backfill must be a separate approved staging run.
- ECOUNT store matching accepts exact store names and the same base store name
  with a parenthesized business suffix, such as `진수산(수산물)` or
  `진수산 （수산물）`. Different base store names or mismatched closing dates are
  blocked with a file error.
- `PURCHASE_ROW` corrections remain out of this release scope. The Prisma enum
  is kept for compatibility, but UI selection and server creation are blocked
  until report overlay support exists.
- Before release, check active store-manager permission profiles in the target
  database:

```sql
SELECT
  u.email,
  u.name,
  array_agg(DISTINCT pp.code ORDER BY pp.code) AS profiles,
  bool_or(ppa.action = 'LEDGER_EDIT') AS can_edit_ledger
FROM "User" u
LEFT JOIN "UserPermissionProfile" upp ON upp."userId" = u.id
LEFT JOIN "PermissionProfile" pp ON pp.id = upp."profileId" AND pp."isActive" = true
LEFT JOIN "PermissionProfileAction" ppa ON ppa."profileId" = pp.id
WHERE u.role = 'STORE_MANAGER' AND u."isActive" = true
GROUP BY u.id, u.email, u.name
ORDER BY u.email;
```

Override the safe defaults only with test-like values:

```bash
PORT=3199 PLAYWRIGHT_DATABASE_URL="postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e_branch" pnpm test:playwright -- tests/e2e/auth.spec.ts
```

GitHub Actions CI usage is documented in `docs/ci.md`.

### Stop

```bash
docker compose down
```

Stop the Next.js app with `Ctrl+C` in the terminal running `pnpm start`.

### Reset All Local Database Data

This deletes the Docker PostgreSQL volume and all local DB data.

```bash
docker compose down -v
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

### If Port 5432 Is Already In Use

Edit `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"
```

Then edit `.env`:

```env
DATABASE_URL="postgresql://postgres:erp_fish_local_pw@localhost:5433/erp_fish"
```

After changing the port, restart PostgreSQL:

```bash
docker compose down
docker compose up -d
```

### Moving To Another PC

Copy the project files, but do not copy `node_modules`, `.next`, or local Docker
volumes. On the new PC, install Docker Desktop, Node.js, and pnpm, create a new
`.env` from `.env.example`, generate a fresh `AUTH_SECRET`, set local seed
passwords, then run the first setup commands above.

## Learn More

- [Create T3 App](https://create.t3.gg/)
- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Tailwind CSS](https://tailwindcss.com)
