# Starter Kit

A full-stack TypeScript monorepo with everything pre-configured so you can focus on building features.

## Stack

| Layer           | Technology                              |
| --------------- | --------------------------------------- |
| Frontend        | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend         | Express, Prisma, Zod                    |
| Background Jobs | BullMQ, Redis                           |
| Database        | PostgreSQL 16 + pgvector                |
| Monorepo        | Turborepo                               |
| Language        | TypeScript (everywhere)                 |

## Project Structure

```
packages/
  web/        → React + Vite frontend (port 5173)
  api/        → Express REST API (port 3000)
  workers/    → BullMQ background job processors
  shared/     → Shared utilities (auth, db models, queue, AI)
```

## Getting Started

### 1. Prerequisites

- Node.js >= 20
- Docker (for PostgreSQL + Redis)

### 2. Install dependencies

```bash
npm install
```

This also generates the Prisma client (a `postinstall` hook). Nothing imports
`@prisma/client` successfully until that has run, so don't skip it with
`--ignore-scripts`.

### 3. Start infrastructure

```bash
docker compose up -d
```

Brings up PostgreSQL (with pgvector) and Redis. On the very first run this also
creates the `starter_kit_test` database the integration tests use.

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

`DATABASE_URL` must be set before the next step.

### 5. Run database migrations

```bash
npm run db:deploy --workspace @starter-kit/shared   # apply migrations
npm run db:seed   --workspace @starter-kit/shared   # optional: seeds an admin user
```

Use `db:migrate` instead of `db:deploy` when you're authoring a new migration.
The seed reads `ADMIN_PASSWORD` from the environment and warns if it's unset.

### 6. Start development servers

```bash
# Start all packages in parallel
npm run dev

# Or start individually
cd packages/api && npm run dev     # API on :3000
cd packages/web && npm run dev     # Web on :5173
cd packages/workers && npm run dev # Workers
```

## Available Scripts (root)

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Start all packages in watch mode |
| `npm run build` | Build all packages               |
| `npm run test`  | Run all test suites              |
| `npm run lint`  | Lint all packages                |

## Environment Variables

See `.env.example` for all required variables.

## Testing

```bash
npm run test              # Run all tests
cd packages/api && npm test  # API tests (Jest)
cd packages/web && npm test  # Web tests (Vitest)
```

The API integration tests run against a real `starter_kit_test` database, so
Docker must be up. Apply migrations to it once:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/starter_kit_test \
  npm run db:deploy --workspace @starter-kit/shared
```

If you created your Postgres volume before `starter_kit_test` was added to
`docker/postgres/init.sql`, that script won't re-run — create the database by
hand once:

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE starter_kit_test;"
```

## Docker

The `docker-compose.yml` starts:

- **PostgreSQL 16 with pgvector** (`pgvector/pgvector:pg16`) on port `5432` —
  the plain `postgres:16` image can't satisfy `CREATE EXTENSION vector`
- **Redis 7** on port `6379`
