import request from "supertest";
import { getPrisma, type ChatMessage } from "@starter-kit/shared";
import { app } from "../../app";
import {
  generateDiscoveryReport,
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
