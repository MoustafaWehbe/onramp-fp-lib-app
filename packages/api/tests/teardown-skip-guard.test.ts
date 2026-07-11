// Regression guard for the shared Jest teardown (tests/teardown.ts).
//
// A test file whose tests are ALL skipped is a legitimate pattern — a pending
// suite, or an env-gated live smoke test that no-ops in normal runs. Jest does
// NOT run `afterAll` hooks for such a file, so the teardown must not open any
// handle at import time that it relies on `afterAll` to close. Otherwise the
// open ioredis/BullMQ socket keeps the Jest worker alive and the entire api
// suite hangs when run without `--forceExit`.
//
// This file intentionally contains only skipped tests and imports nothing that
// opens a Redis handle itself. It is the canary for that all-skipped path: if
// the api suite starts hanging again, this file is exercising the regression.
describe.skip("teardown regression guard (all tests skipped on purpose)", () => {
  it("is skipped, and must not leak a Redis handle via teardown", () => {
    expect(true).toBe(true);
  });
});
