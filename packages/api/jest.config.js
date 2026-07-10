/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
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
