# Folio — Established Decisions Reference

Durable, agreed decisions for the Folio final project (personal reading journal +
AI taste-discovery). This file is the single source of truth for choices already
settled with the instructor (Moustafa Wehbe) so future work — and fresh worktrees,
which don't inherit gitignored notes — doesn't re-litigate them.

## Data model & persistence

- **ORM: Prisma**, confirmed by Moustafa (overrides the starter kit's Sequelize models).
- **pgvector** is layered on top of the starter kit's plain-Postgres image (the
  `pgvector/pgvector:pg16` image + `vector` extension enabled in migrations and
  `docker/postgres/init.sql`).
- **Book dedup:** match on `openLibraryId` first; fall back to `(userId, title, author)`
  for manually-entered books. (Postgres allows multiple NULL `openLibraryId` rows, so
  manual entries aren't blocked.)
- **Cover field is `coverImage`** (not `coverImageUrl` — corrected during Books CRUD).
- **`Shelf` complements `Book.status`**, it does not replace it. `Book.status` is the
  reading lifecycle with 4 states including `ABANDONED`; a book can also sit on any
  number of shelves. Shelf sharing / Contributors remain design-only and out of scope
  until PR #5 clears.

## AI provider

- **Provider: self-hosted Ollama**, confirmed reachable at the LAN address held only in
  the local (gitignored) `.env` as `OLLAMA_BASE_URL`. **Never commit the literal address.**
- **Embedding model: `nomic-embed-text`**, **768-dim** (confirmed from a live response).
  pgvector columns are `vector(768)`; Prisma models expose them as
  `Unsupported("vector(768)")` and similarity is queried via `$queryRaw` (cosine distance).
- **Generation model: parameterized via `OLLAMA_GENERATION_MODEL`**, value pending the
  bake-off between `gemma4:26b` and `qwen3.6:27b-64k`. Both are already pulled and
  available on the host — nothing to install. The chosen value lives in local `.env`,
  never in `.env.example`.

## Retrieval & generation contract

- **Candidate retrieval: Open Library Subjects API only** (`/subjects/{subject}.json`),
  free/unauthenticated. A **descriptive `User-Agent` header is required**; it is not for
  bulk use. If a paid fallback ever seems necessary, **stop and ask first.**
- **The generation model never invents a title.** Candidates are real books, embedded on
  the fly and ranked by pgvector cosine similarity against the user's
  `TasteProfile.embedding`. The model must pick **exactly 3 of the top 5, verbatim**,
  enforced by a **server-side check** on returned titles/authors — not by prompt
  instruction alone.

## Process

- **One branch = one PR = one distinct issue.** PRs and commits read human, no automated
  signature.
- **Never push to `main`. Never merge autonomously.** Push feature branches; open PRs
  against `main`; request review from Moustafa on every PR.
- If anything here conflicts with the real repo state, **stop and say so** rather than
  reconciling silently.
