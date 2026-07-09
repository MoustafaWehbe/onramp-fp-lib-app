import { PrismaClient } from "@prisma/client";

// Re-exported so consumer packages can annotate types (e.g. getDatabase())
// with a portable name instead of Prisma's generated internal path.
export type { PrismaClient } from "@prisma/client";

// Lazily-created singleton PrismaClient. Instantiation is deferred to the first
// getPrisma() call so that merely importing this module (e.g. via the package
// barrel) does not open a database connection — important for unit tests that
// mock the DB and never touch Prisma.
let prismaInstance: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }
  return prismaInstance;
}
