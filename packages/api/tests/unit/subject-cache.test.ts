import type { OpenLibraryWork } from "../../src/lib/open-library";

// The subject cache sits above the injected fetcher and must never make Redis
// a hard dependency: a cold miss fetches and stores, a fresh hit skips the
// network, a stale entry falls back to itself when the live fetch fails, and
// any Redis error degrades to the pre-cache behaviour. The Redis connection is
// mocked — no server required.

const store = new Map<string, string>();
const redisMock = {
  // ioredis' socket state. The cache opens lazily, so "wait" is the start.
  status: "ready" as string,
  connect: jest.fn(async () => {
    redisMock.status = "ready";
  }),
  on: jest.fn(),
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  quit: jest.fn(async () => "OK"),
};

// The cache builds its own ioredis client (queue semantics are wrong for a
// cache), so that constructor is what gets stubbed.
jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

// The shared barrel is stubbed too: the suite teardown closes the queues and
// quits the connection, and nothing real should be opened by a unit test.
jest.mock("@starter-kit/shared", () => ({
  getRedisConnection: () => redisMock,
  emailQueue: { close: jest.fn(async () => undefined) },
  embeddingsQueue: { close: jest.fn(async () => undefined) },
}));

// Imported after the mock so the module picks it up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withSubjectCache } = require("../../src/lib/subject-cache") as {
  withSubjectCache: (
    f: (s: string) => Promise<OpenLibraryWork[]>,
  ) => (s: string) => Promise<OpenLibraryWork[]>;
};

const KEY = "ol:subject:v1:poetry";
const works: OpenLibraryWork[] = [
  { key: "/works/OL1W", title: "Salt & Ember", authors: [{ name: "Okafor" }] },
];

function seed(fetchedAt: number, value: OpenLibraryWork[] = works) {
  store.set(KEY, JSON.stringify({ fetchedAt, works: value }));
}

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  redisMock.status = "ready";
  // clearAllMocks keeps implementations but not one-shot overrides; re-arm the
  // happy-path connect so a persistent rejection can't leak between tests.
  redisMock.connect.mockImplementation(async () => {
    redisMock.status = "ready";
  });
  redisMock.get.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisMock.set.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  });
});

describe("withSubjectCache", () => {
  it("fetches and stores on a cold miss", async () => {
    const fetcher = jest.fn(async () => works);
    const cached = withSubjectCache(fetcher);

    await expect(cached("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(store.get(KEY)!);
    expect(stored.works).toEqual(works);
    expect(typeof stored.fetchedAt).toBe("number");
  });

  it("serves a fresh entry without touching the network", async () => {
    seed(Date.now());
    const fetcher = jest.fn(async () => []);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refreshes a stale entry when the fetch succeeds", async () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1_000;
    seed(twoDaysAgo);
    const fresher: OpenLibraryWork[] = [
      { key: "/works/OL2W", title: "Blue Hours", authors: [{ name: "Sato" }] },
    ];
    const fetcher = jest.fn(async () => fresher);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(fresher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(KEY)!).works).toEqual(fresher);
  });

  it("serves the stale copy when the live fetch fails", async () => {
    seed(Date.now() - 2 * 24 * 60 * 60 * 1_000);
    const fetcher = jest.fn(async () => {
      throw new Error("Open Library unreachable");
    });

    // The demo-saving case: yesterday's candidates beat no report at all.
    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("propagates the failure when there is nothing cached", async () => {
    const fetcher = jest.fn(async () => {
      throw new Error("Open Library unreachable");
    });

    await expect(withSubjectCache(fetcher)("poetry")).rejects.toThrow(
      "Open Library unreachable",
    );
  });

  it("falls through to a live fetch when Redis reads fail", async () => {
    redisMock.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("still returns results when Redis writes fail", async () => {
    redisMock.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
  });

  it("falls through when Redis hangs instead of rejecting", async () => {
    // The shared connection sets maxRetriesPerRequest: null for BullMQ, so an
    // unreachable Redis QUEUES commands rather than failing them. Without the
    // timeout this await never settles and discovery hangs.
    redisMock.get.mockImplementationOnce(() => new Promise(() => {}));
    const fetcher = jest.fn(async () => works);

    const started = Date.now();
    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("issues no commands at all when the connection can't be made", async () => {
    // enableOfflineQueue: false means a command would reject rather than
    // queue, but there is no reason to issue one at all — and nothing may
    // accumulate while Redis is down.
    redisMock.status = "wait";
    // Persistently down: the write path attempts its own connect, and that
    // must fail too — a one-shot rejection would let the store slip through.
    redisMock.connect.mockRejectedValue(new Error("ECONNREFUSED"));
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("connects on first use, then reuses the open client", async () => {
    redisMock.status = "wait";
    const fetcher = jest.fn(async () => works);
    const cached = withSubjectCache(fetcher);

    await cached("poetry"); // cold: connects, misses, fetches, stores
    await cached("poetry"); // warm: same client, served from cache
    expect(redisMock.connect).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats a malformed cache entry as a miss", async () => {
    store.set(KEY, "{not json");
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
