# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

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
- Seed login email: `admin@example.com`
- Seed login password: `AdminPassword123!`
- Seed login name: `본사 관리자`

### First Setup

1. Install Docker Desktop and keep it running.
2. Install Node.js and pnpm.
3. Create `.env` from `.env.example` if `.env` does not exist.
4. Start PostgreSQL:

```bash
docker compose up -d
```

5. Install packages:

```bash
pnpm install
```

6. Apply Prisma migrations:

```bash
pnpm db:migrate
```

7. Create or update the test headquarters account:

```bash
pnpm db:seed
```

8. Build and start the app in production mode:

```bash
pnpm build
pnpm start
```

9. Open `http://localhost:3000` and log in with:

```text
admin@example.com
AdminPassword123!
```

### Daily Start

```bash
docker compose up -d
pnpm start
```

Run `pnpm build` again before `pnpm start` when source code changed.

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
`.env` from `.env.example`, generate a fresh `AUTH_SECRET`, then run the first
setup commands above.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.
