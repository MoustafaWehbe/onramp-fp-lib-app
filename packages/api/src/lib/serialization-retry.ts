/**
 * Runs a thunk (typically a SERIALIZABLE prisma.$transaction), retrying a
 * bounded number of times when Postgres aborts it with a serialization
 * conflict (Prisma error P2034). Nothing is committed on a conflict, so the
 * retry is safe; any other failure propagates untouched.
 */
export async function withSerializationRetry<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt < attempts && (err as { code?: string }).code === "P2034") {
        continue;
      }
      throw err;
    }
  }
}
