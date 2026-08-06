/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  // Run test files serially: the integration suites share one Postgres database
  // and reset it, so parallel workers would race and wipe each other's rows.
  maxWorkers: 1,
  // Jest's 5s default is a poor fit for these hooks, and it shows up as a flake
  // that moves between suites depending on machine load. A `beforeAll` that
  // seeds three accounts spends ~1.7s in bcrypt alone (12 rounds, ~290ms a
  // hash, measured) before a single DB reset or HTTP round-trip — comfortable
  // when idle, over the line when the machine is busy. The cost is deliberate:
  // bcrypt is slow on purpose and the suites exercise the real one. So the
  // timeout is what's wrong, not the setup. 30s leaves an order of magnitude of
  // headroom while still failing a genuinely hung hook promptly.
  testTimeout: 30_000,
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setup.ts"],
  // Runs once per test file (after the framework is installed) to close the BullMQ
  // queues + ioredis connection opened at import time, so Jest exits without --forceExit.
  setupFilesAfterEnv: ["<rootDir>/tests/teardown.ts"],
  moduleNameMapper: {
    "^@starter-kit/shared$": "<rootDir>/../shared/src/index.ts",
    "^@starter-kit/shared/(.*)$": "<rootDir>/../shared/src/$1",
  },
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.json" }],
  },
};
