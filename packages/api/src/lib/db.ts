import { getPrisma, type PrismaClient } from "@starter-kit/shared";

/** Returns the shared PrismaClient instance. */
export function getDatabase(): PrismaClient {
  return getPrisma();
}

/** Establishes the database connection at API startup. */
export async function initializeDatabase(): Promise<void> {
  await getPrisma().$connect();
  console.info("Database connection established");
}
