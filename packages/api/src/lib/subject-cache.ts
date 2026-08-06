import IORedis from "ioredis";
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
 * A ceiling on every cache call. Structurally nothing can queue (see the
 * client below), but a command already in flight on a silently dead socket
 * would still wait on TCP — a cache is never worth that, so it loses the race.
 */
const CACHE_OP_TIMEOUT_MS = 250;
/** How long the cache sits out after a timeout forces a client rebuild. */
const CLIENT_COOLDOWN_MS = 5_000;

/** Distinguishes "the socket went quiet" from an ordinary command failure. */
class CacheTimeout extends Error {}

interface CachedSubject {
  fetchedAt: number;
  works: OpenLibraryWork[];
}

const keyFor = (subject: string) => `${KEY_PREFIX}${subject}`;

/**
 * The cache gets its own connection, deliberately not the queue's.
 *
 * A job queue and a cache want opposite things from a connection. BullMQ needs
 * commands to survive a blip, so the shared client sets
 * `maxRetriesPerRequest: null` with the offline queue on — a command issued
 * while Redis is down waits for reconnect instead of failing. For a cache that
 * is exactly wrong: the read must fail immediately so the caller can go to the
 * network.
 *
 * An earlier attempt kept the shared client and checked `status === "ready"`
 * first. That races — the socket can drop between the check and the command,
 * and the command then lands in the offline queue we were trying to avoid.
 * These options make the property structural rather than timed:
 *   · enableOfflineQueue: false — a command on a down connection rejects at
 *     once, and nothing accumulates behind it;
 *   · maxRetriesPerRequest: 1 — one retry during a reconnect, then fail;
 *   · lazyConnect: true — no socket is opened until the cache is first used,
 *     so importing this module costs nothing.
 */
let client: IORedis | null = null;

function cacheClient(): IORedis {
  if (!client) {
    const created = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        connectTimeout: 1_000,
        // A cache read is only useful in the moment it was asked for. Never
        // replay one across a reconnect — the answer would arrive for a
        // request that finished long ago.
        autoResendUnfulfilledCommands: false,
      },
    );
    // ioredis is an EventEmitter, and an unheard "error" event is a thrown
    // exception. Connection errors are expected here and already reported by
    // the read/write handlers, so this listener exists to keep a cache outage
    // from taking the process down.
    created.on("error", () => {});
    client = created;
  }
  return client;
}

/**
 * Throw the client away and sit the cache out for a moment.
 *
 * `enableOfflineQueue: false` covers a socket that refuses writes, but not one
 * that accepts them and never answers: that command stays in ioredis'
 * commandQueue even after the caller stops awaiting it. Abandoning enough of
 * them would be the same slow accumulation in a different queue, so a timeout
 * ends the connection rather than leaving commands stranded on it. The
 * cooldown keeps a dead host from being redialled on every lookup.
 */
let cooldownUntil = 0;

function dropClient(reason: string): void {
  const dying = client;
  client = null;
  cooldownUntil = Date.now() + CLIENT_COOLDOWN_MS;
  try {
    dying?.disconnect();
  } catch {
    // already gone; nothing to release
  }
  console.error(
    `[ol-cache] dropped the cache client after ${reason}; skipping the cache ` +
      `for ${CLIENT_COOLDOWN_MS}ms`,
  );
}

/**
 * Hand back a connected client, or null to skip the cache this round. Nothing
 * here is load-bearing for safety — the connection options are — it only
 * decides whether it is worth issuing a command at all.
 */
async function connected(): Promise<IORedis | null> {
  if (Date.now() < cooldownUntil) return null;
  const c = cacheClient();
  if (c.status === "ready") return c;
  // "wait" is the lazyConnect idle state; "end" follows a failed attempt.
  if (c.status === "wait" || c.status === "end") {
    try {
      await withTimeout(c.connect(), "connect");
    } catch (err) {
      // A connect that stalls leaves a half-open client behind; a refused one
      // is simply down. Either way this round is a miss.
      if (err instanceof CacheTimeout) dropClient("a connect timeout");
      return null;
    }
    // connect() mutates status; the check above narrowed it, so re-read wide.
    return (c.status as string) === "ready" ? c : null;
  }
  // Mid-handshake or reconnecting: don't wait on it, take the miss.
  return null;
}

function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CacheTimeout(`redis ${label} timed out`)),
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
  const redis = await connected();
  if (!redis) return null;
  try {
    const raw = await withTimeout(redis.get(keyFor(subject)), "get");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSubject;
    if (!Array.isArray(parsed?.works) || typeof parsed?.fetchedAt !== "number") {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err instanceof CacheTimeout) dropClient(`a read timeout on "${subject}"`);
    console.error(
      `[ol-cache] read failed for "${subject}"`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Store a fresh response. Best-effort — a write failure never fails a report. */
async function write(subject: string, works: OpenLibraryWork[]): Promise<void> {
  const redis = await connected();
  if (!redis) return;
  try {
    const payload: CachedSubject = { fetchedAt: Date.now(), works };
    await withTimeout(
      redis.set(keyFor(subject), JSON.stringify(payload), "EX", TTL_SECONDS),
      "set",
    );
  } catch (err) {
    if (err instanceof CacheTimeout) dropClient(`a write timeout on "${subject}"`);
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
