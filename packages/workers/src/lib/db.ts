import { getPrisma, type PrismaClient } from "@starter-kit/shared";

/** Returns the shared PrismaClient instance. */
export function getDatabase(): PrismaClient {
  return getPrisma();
}

/** Establishes the database connection for the worker process. */
export async function initializeDatabase(): Promise<void> {
  await getPrisma().$connect();
}
