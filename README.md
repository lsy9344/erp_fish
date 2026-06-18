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

### Daily Start

```bash
docker compose up -d
pnpm start
```

Run `pnpm build` again before `pnpm start` when source code changed.

### Validation

Use the fast checks while developing:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:unit:file tests/unit/example.test.mjs
```

Run `pnpm build` before handing work off or before a release:

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
pnpm test:playwright -- tests/e2e/auth.spec.ts -g "비로그인 사용자가 루트 경로"
pnpm test:playwright -- tests/api/report-export.spec.ts
```

Override the safe defaults only with test-like values:

```bash
PORT=3199 PLAYWRIGHT_DATABASE_URL="postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e_branch" pnpm test:playwright -- tests/e2e/auth.spec.ts
```

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
