// Shared Jest teardown — registered via `setupFilesAfterEnv`, so it runs once per
// test file, inside that file's module registry.
//
// Importing the Express app (or the `@starter-kit/shared` barrel directly) eagerly
// opens two BullMQ queues and an ioredis connection at import time
// (packages/shared/queue/client.ts). Those are module singletons, so an open Redis
// socket keeps the Jest worker alive after the tests finish — the "A worker process
// failed to exit gracefully" warning that previously required `--forceExit`.
//
// Closing them here means every app-importing test file is covered automatically:
// individual files no longer need their own queue/Redis `afterAll`. Closing the
// handles is a no-op-fast even when Redis is unreachable, so unit test files that
// never touch the queue (e.g. auth.service) still tear down cleanly.
import {
  emailQueue,
  embeddingsQueue,
  getRedisConnection,
} from "@starter-kit/shared";

afterAll(async () => {
  await emailQueue.close();
  await embeddingsQueue.close();
  await getRedisConnection().quit();
});
