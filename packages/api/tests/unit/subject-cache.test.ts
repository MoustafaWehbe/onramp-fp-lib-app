import type { OpenLibraryWork } from "../../src/lib/open-library";

// The subject cache sits above the injected fetcher and must never make Redis
// a hard dependency: a cold miss fetches and stores, a fresh hit skips the
// network, a stale entry falls back to itself when the live fetch fails, and
// any Redis error degrades to the pre-cache behaviour. The Redis connection is
// mocked — no server required.

const store = new Map<string, string>();
const redisMock = {
  // ioredis exposes the socket state; the cache only issues commands when it
  // reads "ready", so nothing lands in the offline queue during an outage.
  status: "ready",
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  // The shared teardown quits the connection and closes the queues; the mock
  // supplies both so nothing real is opened (and so nothing real leaks).
  quit: jest.fn(async () => "OK"),
};

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

  it("issues no commands at all while the connection is down", async () => {
    // ioredis would hold them in its offline queue until reconnect, on the
    // same connection BullMQ uses — a slow leak under a sustained outage.
    redisMock.status = "reconnecting";
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("treats a malformed cache entry as a miss", async () => {
    store.set(KEY, "{not json");
    const fetcher = jest.fn(async () => works);

    await expect(withSubjectCache(fetcher)("poetry")).resolves.toEqual(works);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
