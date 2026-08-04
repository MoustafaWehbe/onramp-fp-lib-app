import { getRedisConnection } from "@starter-kit/shared";
import type { OpenLibraryWork } from "./open-library";

// Subject slugs come from deriveSubjects, which produces near-identical values
// run to run — so the same handful of /subjects responses were being refetched
// cold on every report. They are public catalogue data with no per-user
// content, which is what makes them cacheable at all.

/** Bump when the stored shape changes; old keys then simply miss. */
const KEY_PREFIX = "ol:subject:v1:";
/** Entries live a week… */
const TTL_SECONDS = 7 * 24 * 60 * 60;
/** …but anything older than a day is refreshed when we can reach the network. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1_000;

/**
 * Cache operations get a hard ceiling. The shared connection is configured
 * with `maxRetriesPerRequest: null` for BullMQ's benefit, which means that
 * while Redis is unreachable commands QUEUE INDEFINITELY rather than
 * rejecting — an awaited get would hang the request forever instead of
 * degrading. A try/catch cannot rescue a promise that never settles, so every
 * cache call races this timeout and a timeout reads as a miss.
 */
const CACHE_OP_TIMEOUT_MS = 250;

interface CachedSubject {
  fetchedAt: number;
  works: OpenLibraryWork[];
}

const keyFor = (subject: string) => `${KEY_PREFIX}${subject}`;

function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`redis ${label} timed out`)),
      CACHE_OP_TIMEOUT_MS,
    );
  });
  return Promise.race([op, ceiling]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Read a cached subject response. Redis is never a hard dependency here: any
 * failure (unreachable, malformed payload) logs once and reads as a miss, so
 * retrieval falls through to the live fetch exactly as it did before the cache
 * existed.
 */
async function read(subject: string): Promise<CachedSubject | null> {
  try {
    const raw = await withTimeout(
      getRedisConnection().get(keyFor(subject)),
      "get",
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSubject;
    if (!Array.isArray(parsed?.works) || typeof parsed?.fetchedAt !== "number") {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error(
      `[ol-cache] read failed for "${subject}"`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Store a fresh response. Best-effort — a write failure never fails a report. */
async function write(subject: string, works: OpenLibraryWork[]): Promise<void> {
  try {
    const payload: CachedSubject = { fetchedAt: Date.now(), works };
    await withTimeout(
      getRedisConnection().set(
        keyFor(subject),
        JSON.stringify(payload),
        "EX",
        TTL_SECONDS,
      ),
      "set",
    );
  } catch (err) {
    console.error(
      `[ol-cache] write failed for "${subject}"`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Wrap a subject fetcher with the Redis cache.
 *
 * Fresh (< 24h) entries are served without touching the network. Stale entries
 * still attempt a live fetch, but fall back to the stale copy if that fetch
 * fails — the behaviour that keeps discovery working over a flaky network
 * path: a report is generated from yesterday's candidates instead of erroring.
 * A miss with a failing fetch propagates, so a genuine total outage still
 * surfaces as it always did.
 */
export function withSubjectCache(
  fetcher: (subject: string) => Promise<OpenLibraryWork[]>,
): (subject: string) => Promise<OpenLibraryWork[]> {
  return async (subject: string) => {
    const cached = await read(subject);
    const isFresh =
      cached !== null && Date.now() - cached.fetchedAt < STALE_AFTER_MS;
    if (cached && isFresh) return cached.works;

    try {
      const works = await fetcher(subject);
      await write(subject, works);
      return works;
    } catch (err) {
      if (cached) {
        console.info(
          `[ol-cache] serving stale "${subject}" (fetched ${new Date(
            cached.fetchedAt,
          ).toISOString()}) — live fetch failed`,
        );
        return cached.works;
      }
      throw err;
    }
  };
}
