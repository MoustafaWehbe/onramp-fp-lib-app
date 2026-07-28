// Shared Jest teardown — registered via `setupFilesAfterEnv`, so it runs once per
// test file, inside that file's module registry.
//
// Importing the Express app (or the `@starter-kit/shared` barrel directly) eagerly
// opens two BullMQ queues and an ioredis connection at import time
// (packages/shared/queue/client.ts). Those are module singletons, so an open Redis
// socket keeps the Jest worker alive after the tests finish — the "A worker process
// failed to exit gracefully" warning that previously required `--forceExit`.
//
// The barrel is imported LAZILY, inside the afterAll, rather than at module top
// level. Jest does NOT run afterAll hooks for a file whose tests are ALL skipped
// (describe.skip / it.skip). A top-level import here would therefore open the
// Redis handle for such a file and then never close it — leaking the very handle
// this teardown exists to release and hanging the run without --forceExit.
// Deferring the import means an all-skipped file opens nothing and has nothing to
// leak, while a normal file's afterAll import returns the same cached singletons
// the app already opened and closes them. Closing is a no-op-fast even when Redis
// is unreachable, so unit test files that never touch the queue (e.g. auth.service)
// still tear down cleanly.
afterAll(async () => {
  // Lazy import: for an all-skipped test file this afterAll never runs, so the
  // shared queue/Redis singletons are never instantiated on its behalf.
  const { emailQueue, embeddingsQueue, getRedisConnection } = await import(
    "@starter-kit/shared"
  );

  // Attempt every close independently: if one queue close rejects, the other —
  // and the Redis quit — must still run, or we'd leak the very handles this
  // teardown exists to release.
  await Promise.allSettled([emailQueue.close(), embeddingsQueue.close()]);
  await getRedisConnection()
    .quit()
    .catch(() => undefined);
});
