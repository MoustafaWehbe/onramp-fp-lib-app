-- Enable pgvector for embedding storage / similarity search.
-- Runs automatically on first initialization of the postgres data volume
-- (files in /docker-entrypoint-initdb.d/ are executed by the postgres image).
-- Prisma migrations also enable it (idempotently) so CI and prod don't depend
-- on this script; this only guarantees local `docker-compose up` has it ready.
CREATE EXTENSION IF NOT EXISTS vector;
