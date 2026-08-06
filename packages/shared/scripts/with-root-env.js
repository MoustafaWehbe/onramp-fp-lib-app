#!/usr/bin/env node
// Runs a command with the repo-root .env loaded. The Prisma CLI only reads
// .env next to itself or the schema — never the root file README step 4 tells
// you to create — so a clean clone failed step 5 with "Environment variable
// not found: DATABASE_URL". Values already present in the environment win, so
// CI and inline overrides behave exactly as before.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
