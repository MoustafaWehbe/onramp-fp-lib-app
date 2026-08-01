-- Enable pgvector for embedding storage / similarity search.
-- Runs automatically on first initialization of the postgres data volume
-- (files in /docker-entrypoint-initdb.d/ are executed by the postgres image).
-- Prisma migrations also enable it (idempotently) so CI and prod don't depend
-- on this script; this only guarantees local `docker-compose up` has it ready.
CREATE EXTENSION IF NOT EXISTS vector;

-- The integration tests connect to a separate `starter_kit_test` database
-- (hardcoded in packages/api/tests/setup.ts) so a test run never touches dev
-- data. compose only creates POSTGRES_DB, so create the test database here or
-- `npm test` fails on a clean clone with "database does not exist".
SELECT 'CREATE DATABASE starter_kit_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'starter_kit_test')\gexec

\connect starter_kit_test
CREATE EXTENSION IF NOT EXISTS vector;
