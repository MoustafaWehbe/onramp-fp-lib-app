# Folio — a private reading journal

Folio is a personal archive for what you read and what you thought of it. No
feed, no followers, no public profiles — a library, a private journal, and a
set of AI features that read only your own shelf. Built on the course's
full-stack TypeScript starter kit (the stack below is unchanged).

## Features

- **Library & catalog search** — add books by searching Open Library ("Use
  this" fills the form) or type them in by hand; the manual form never blocks
  on the catalog. Covers can be uploaded (JPG/PNG/WEBP, 5 MB) or Folio sets
  the title in type instead.
- **Format** — each book carries a `Physical / Ebook / Audiobook` label for
  your own filtering. It is only a label: Folio doesn't store or open files.
- **Journal** — rating and reflections unlock when a book is marked Finished,
  and are visible to exactly one person: you. AI prompts offer a few ways into
  a blank reflection; dismissing them is remembered per book.
- **Similar books** — "Books like this one," ranked from your own embedded
  library by vector similarity. Nothing comes from outside your shelves.
- **Discovery** — a taste profile built from your finished books retrieves
  real Open Library candidates and writes a grounded three-pick report; an
  optional mood modifier steers it. Requires the taste profile to be built
  first — the page offers that when it's missing.
- **Mood shelves** — a sentence in, a themed shelf out of your own books. The
  mood text is never stored; keeping the shelf uses the ordinary shelves.
- **Reading Memory** — semantic search over your own reflections ("grief"
  finds "mourning"). When the model is offline it degrades to exact word
  search and says so.
- **Year in Reading** — a written private retrospective with counts read
  straight off your shelves, and a keepsake card saved to your device.
- **Sharing** — invite one person to a single shelf (view or write), or send
  one book to one named reader. A shared book carries catalogue metadata and
  your name — never your rating, journal, or anything else you've read.
- **Password reset** — email-style reset flow with single-use, hour-long
  tokens; a successful reset signs the account out everywhere.
- **Admin console** — a deliberately separate dark console: anonymized
  aggregates, an audit log that outlives deleted accounts, and two-step typed
  confirmation for destructive actions.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend | Express, Prisma, Zod |
| Background Jobs | BullMQ, Redis |
| Database | PostgreSQL 16 + pgvector |
| Monorepo | Turborepo |
| Language | TypeScript (everywhere) |

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

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in watch mode |
| `npm run build` | Build all packages |
| `npm run test` | Run all test suites |
| `npm run lint` | Lint all packages |

## Environment Variables

See `.env.example` for all required variables. Three worth knowing about:

- **`OLLAMA_BASE_URL` / models** — the AI features (prompts, similar books,
  mood shelves, semantic memory search, discovery, the year narrative) run
  against a self-hosted Ollama. Without it the app still works: every AI
  surface degrades to a designed state (memory search falls back to exact
  word matching) rather than breaking.
- **`CORS_ORIGIN`** — also the origin used in password-reset links. If the web
  app runs anywhere other than `http://localhost:5173`, set it, or the logged
  reset link points at the wrong origin.
- **`VITE_API_PROXY_TARGET` / `VITE_PORT`** (in `packages/web/.env.local`) —
  the dev proxy target and port, for running the web app against an API that
  isn't on `:3000`.

## Good to know in development

- **Password reset links** — the email worker is a mock, so the reset link is
  printed to the API console behind a `PASSWORD RESET` banner when you submit
  the forgot form. Follow it from there.
- **Embedding delay** — a reflection becomes semantically searchable in
  `/memory` roughly 15 seconds after saving (the worker picks the job off the
  queue and embeds it). `npm run dev` starts the workers; nothing manual.
- **Discovery prerequisite** — reports need a taste profile; `/discover`
  offers to build one when it's missing. Both the profile refresh and report
  generation are local model calls and can take a minute.
- **Rate limits** — production allows 100 requests per 15 minutes;
  development allows 2,000 so ordinary clicking around doesn't go dark. Auth
  endpoints allow 10 attempts per window in both.

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

## Design

Every screen and state comes from a design canvas:
`planning-reference/design/folio-v2.html` (81 frames — style guide, motion
spec, and sections A–G). `planning-reference/state-coverage.md` audits every
designed empty/loading/failed/unavailable state against the code.
`ARCHITECTURE.md` covers the data model, the API contract, and the AI and
privacy decisions.

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
