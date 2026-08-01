import request from "supertest";
import { getPrisma, type ChatMessage } from "@starter-kit/shared";
import { app } from "../../app";
import {
  generateDiscoveryReport,
  listDiscoveryReports,
  getDiscoveryReport,
  type DiscoveryDeps,
} from "../../src/services/discovery-report.service";
import type { Candidate } from "../../src/services/candidate-retrieval.service";

// Generation is exercised with an injected `generate` (mock model) and `retrieve`
// (fixed candidates), so the verify/retry/persist logic is deterministic and needs
// no live Ollama or Open Library.

const prisma = getPrisma();

function candidate(title: string, author: string, similarity: number): Candidate {
  return {
    title,
    author,
    openLibraryId: `OL_${title.replace(/\s/g, "")}`,
    coverUrl: null,
    firstPublishYear: 2000,
    similarity,
  };
}

const CANDIDATES: Candidate[] = [
  candidate("The Fifth Season", "N.K. Jemisin", 0.9),
  candidate("Ancillary Justice", "Ann Leckie", 0.85),
  candidate("The Dispossessed", "Ursula K. Le Guin", 0.8),
  candidate("A Memory Called Empire", "Arkady Martine", 0.75),
  candidate("Gideon the Ninth", "Tamsyn Muir", 0.7),
];

function goodJson(): string {
  return JSON.stringify({
    picks: [
      { rank: 1, title: "The Fifth Season", author: "N.K. Jemisin", why: "Geology as oppression, like your Broken Earth note." },
      { rank: 2, title: "Ancillary Justice", author: "Ann Leckie", why: "Identity and empire, echoing your Le Guin love." },
      { rank: 3, title: "The Dispossessed", author: "Ursula K. Le Guin", why: "The political tenderness you admired." },
    ],
  });
}

let seq = 0;
async function seedUser() {
  return prisma.user.create({
    data: { email: `disc-${Date.now()}-${seq++}@example.com`, passwordHash: "x", name: "Reader" },
  });
}

async function reset() {
  await prisma.discoveryReport.deleteMany(); // cascades RecommendationItem
  await prisma.bookEmbedding.deleteMany();
  await prisma.tasteProfile.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("generateDiscoveryReport", () => {
  it("verifies picks and persists a 3-item report", async () => {
    const user = await seedUser();
    const generate = jest.fn(async (_m: ChatMessage[]): Promise<string> => goodJson());
    const deps: DiscoveryDeps = { retrieve: async () => CANDIDATES, generate };

    const report = await generateDiscoveryReport(user.id, {}, deps);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(report.items).toHaveLength(3);
    expect(report.items.map((i) => i.title)).toEqual([
      "The Fifth Season",
      "Ancillary Justice",
      "The Dispossessed",
    ]);
    expect(report.items[0]).toMatchObject({
      rank: 1,
      author: "N.K. Jemisin",
      similarity: 0.9,
    });
    expect(report.items[0]!.rationale).toMatch(/geology/i);

    const persisted = await prisma.discoveryReport.findUnique({
      where: { id: report.id },
      include: { items: true },
    });
    expect(persisted?.items).toHaveLength(3);
  });

  it("parses fenced ```json output from the model", async () => {
    const user = await seedUser();
    const generate = jest.fn(
      async (_m: ChatMessage[]): Promise<string> => "```json\n" + goodJson() + "\n```",
    );
    const report = await generateDiscoveryReport(user.id, {}, { retrieve: async () => CANDIDATES, generate });
    expect(report.items).toHaveLength(3);
  });

  it("retries once with a correction that names the problem, then succeeds", async () => {
    const user = await seedUser();
    const badJson = JSON.stringify({
      picks: [
        { rank: 1, title: "Invented Title", author: "Nobody", why: "x" },
        { rank: 2, title: "Ancillary Justice", author: "Ann Leckie", why: "y" },
        { rank: 3, title: "The Dispossessed", author: "Ursula K. Le Guin", why: "z" },
      ],
    });
    const generate = jest
      .fn(async (_m: ChatMessage[]): Promise<string> => goodJson())
      .mockResolvedValueOnce(badJson);

    const report = await generateDiscoveryReport(user.id, {}, { retrieve: async () => CANDIDATES, generate });

    expect(generate).toHaveBeenCalledTimes(2);
    const secondMessages = generate.mock.calls[1]![0];
    const correction = secondMessages[secondMessages.length - 1]!.content;
    expect(correction).toMatch(/Invented Title/);
    expect(correction).toMatch(/not one of the 5 candidates/i);
    expect(report.items.map((i) => i.title)).not.toContain("Invented Title");
    expect(report.items).toHaveLength(3);
  });

  it("fails cleanly (502) when the model misses twice", async () => {
    const user = await seedUser();
    const bad = JSON.stringify({ picks: [{ rank: 1, title: "Nope", author: "X", why: "a" }] });
    const generate = jest.fn(async (_m: ChatMessage[]): Promise<string> => bad);

    await expect(
      generateDiscoveryReport(user.id, {}, { retrieve: async () => CANDIDATES, generate }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await prisma.discoveryReport.count({ where: { userId: user.id } })).toBe(0);
  });

  it("returns 422 when there are fewer than 3 candidates", async () => {
    const user = await seedUser();
    const generate = jest.fn(async (_m: ChatMessage[]): Promise<string> => goodJson());
    await expect(
      generateDiscoveryReport(user.id, {}, { retrieve: async () => CANDIDATES.slice(0, 2), generate }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 422 when the user has no taste profile (real retrieval, no network)", async () => {
    const user = await seedUser();
    await expect(generateDiscoveryReport(user.id, {})).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("POST /api/ai/discovery-report requires authentication (401)", async () => {
    const res = await request(app).post("/api/ai/discovery-report").send({});
    expect(res.status).toBe(401);
  });
});

describe("reading past discovery reports", () => {
  const deps = (): DiscoveryDeps => ({
    retrieve: async () => CANDIDATES,
    generate: async () => goodJson(),
  });

  it("lists a user's reports newest-first, each with its three picks", async () => {
    const user = await seedUser();
    const first = await generateDiscoveryReport(user.id, {}, deps());
    const second = await generateDiscoveryReport(
      user.id,
      { moodModifier: "something coastal" },
      deps(),
    );

    const reports = await listDiscoveryReports(user.id);

    expect(reports.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(reports[0]!.moodModifier).toBe("something coastal");
    expect(reports[0]!.items).toHaveLength(3);
    expect(reports[0]!.items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });

  it("returns only that user's reports", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    await generateDiscoveryReport(alice.id, {}, deps());

    expect(await listDiscoveryReports(bob.id)).toHaveLength(0);
  });

  it("fetches one report by id", async () => {
    const user = await seedUser();
    const created = await generateDiscoveryReport(user.id, {}, deps());

    const fetched = await getDiscoveryReport(user.id, created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.items.map((i) => i.title)).toEqual(
      created.items.map((i) => i.title),
    );
  });

  it("won't hand a report to another user (404)", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const report = await generateDiscoveryReport(alice.id, {}, deps());

    await expect(getDiscoveryReport(bob.id, report.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("404s for a report that doesn't exist", async () => {
    const user = await seedUser();
    await expect(
      getDiscoveryReport(user.id, "00000000-0000-0000-0000-0000000000ff"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("GET /api/ai/discovery-reports requires authentication (401)", async () => {
    const res = await request(app).get("/api/ai/discovery-reports");
    expect(res.status).toBe(401);
  });
});
