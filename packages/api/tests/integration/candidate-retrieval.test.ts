import { getPrisma } from "@starter-kit/shared";
import {
  retrieveCandidates,
  type OpenLibraryWork,
  type RetrievalDeps,
} from "../../src/services/candidate-retrieval.service";

// Retrieval is exercised with a mocked Open Library fetch (shape taken from a real
// /subjects response) and a deterministic embedder, so the ranking is exact and no
// network is touched. A separate, skipped live smoke test hits the real API.

const prisma = getPrisma();
const DIM = 768;

function profileVector(): number[] {
  const v = new Array(DIM).fill(0);
  v[0] = 1; // taste centroid = unit vector along dim 0
  return v;
}

// Unit vector whose cosine similarity with profileVector() is exactly `primary`.
function gradedVec(primary: number): number[] {
  const v = new Array(DIM).fill(0);
  v[0] = primary;
  v[1] = Math.sqrt(Math.max(0, 1 - primary * primary));
  return v;
}

let seq = 0;
async function seedUser() {
  return prisma.user.create({
    data: {
      email: `cand-${Date.now()}-${seq++}@example.com`,
      passwordHash: "x",
      name: "Reader",
    },
  });
}

async function seedProfile(userId: string, embedding: number[], topGenres: string[]) {
  const vec = `[${embedding.join(",")}]`;
  const agg = JSON.stringify({
    topGenres: topGenres.map((g) => ({ genre: g, count: 1 })),
    topAuthors: [],
    avgRating: null,
  });
  await prisma.$executeRaw`
    INSERT INTO taste_profiles (user_id, aggregated_data, embedding, refreshed_at, created_at, updated_at)
    VALUES (${userId}::uuid, ${agg}::jsonb, ${vec}::vector, now(), now(), now())
  `;
}

function work(id: string, title: string, author: string): OpenLibraryWork {
  return {
    key: `/works/${id}`,
    title,
    authors: [{ name: author }],
    cover_id: 111,
    first_publish_year: 2001,
    subject: ["fiction"],
  };
}

async function reset() {
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

describe("retrieveCandidates", () => {
  it("maps OL works to candidates and returns the top 5 by similarity to the profile", async () => {
    const user = await seedUser();
    await seedProfile(user.id, profileVector(), ["Science fiction"]);

    const primaries: Record<string, number> = {
      Alpha: 0.9,
      Bravo: 0.8,
      Charlie: 0.7,
      Delta: 0.6,
      Echo: 0.5,
      Foxtrot: 0.4,
    };
    const works = Object.keys(primaries).map((t, i) =>
      work(`OL${i + 1}W`, t, `Author ${t}`),
    );

    const fetchSubjectWorks = jest.fn(async () => works);
    const embed = jest.fn(async (text: string) => {
      const hit = Object.keys(primaries).find((t) => text.includes(t));
      return gradedVec(hit ? primaries[hit]! : 0);
    });
    const deps: RetrievalDeps = { fetchSubjectWorks, embed };

    const result = await retrieveCandidates(user.id, {}, deps);

    expect(fetchSubjectWorks).toHaveBeenCalledWith("science_fiction");
    expect(result).toHaveLength(5);
    expect(result.map((c) => c.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
    ]);
    expect(result[0]).toMatchObject({
      title: "Alpha",
      author: "Author Alpha",
      openLibraryId: "OL1W",
      coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
      firstPublishYear: 2001,
    });
    expect(result[0]!.similarity).toBeCloseTo(0.9, 4);
  });

  it("excludes books already in the library (by openLibraryId and by title/author)", async () => {
    const user = await seedUser();
    await seedProfile(user.id, profileVector(), ["Fantasy"]);

    await prisma.book.create({
      data: {
        userId: user.id,
        title: "Owned By Id",
        author: "Someone",
        openLibraryId: "OL100W",
        status: "FINISHED",
      },
    });
    await prisma.book.create({
      data: { userId: user.id, title: "Owned By Name", author: "Jane Doe", status: "READING" },
    });

    const works = [
      work("OL100W", "Different Title", "Different Author"), // excluded by OL id
      work("OL200W", "owned by name", "JANE DOE"), // excluded by case-insensitive title/author
      work("OL300W", "Keep Me", "New Author"), // kept
    ];
    const deps: RetrievalDeps = {
      fetchSubjectWorks: jest.fn(async () => works),
      embed: jest.fn(async () => gradedVec(0.5)),
    };

    const result = await retrieveCandidates(user.id, {}, deps);
    expect(result.map((c) => c.title)).toEqual(["Keep Me"]);
  });

  it("dedups the same work across multiple subjects", async () => {
    const user = await seedUser();
    await seedProfile(user.id, profileVector(), ["Science fiction", "Fantasy"]);

    const dup = work("OL500W", "Shared", "Author");
    const fetchSubjectWorks = jest.fn(async (subject: string) =>
      subject === "science_fiction" ? [dup, work("OL501W", "SciOnly", "A")] : [dup],
    );
    const deps: RetrievalDeps = {
      fetchSubjectWorks,
      embed: jest.fn(async () => gradedVec(0.5)),
    };

    const result = await retrieveCandidates(user.id, {}, deps);
    expect(result.filter((c) => c.openLibraryId === "OL500W")).toHaveLength(1);
    expect(fetchSubjectWorks).toHaveBeenCalledTimes(2);
  });

  it("blends the mood modifier into the ranking query", async () => {
    const user = await seedUser();
    await seedProfile(user.id, profileVector(), ["Science fiction"]);

    const embed = jest.fn(async () => gradedVec(0.5));
    const deps: RetrievalDeps = {
      fetchSubjectWorks: jest.fn(async () => [work("OL1W", "A", "Auth")]),
      embed,
    };

    await retrieveCandidates(user.id, { moodModifier: "cozy and short" }, deps);
    expect(embed).toHaveBeenCalledWith("cozy and short");
  });

  it("throws 422 when the taste profile has no embedding yet", async () => {
    const user = await seedUser();
    const deps: RetrievalDeps = {
      fetchSubjectWorks: jest.fn(async () => []),
      embed: jest.fn(async () => gradedVec(0.5)),
    };
    await expect(retrieveCandidates(user.id, {}, deps)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("surfaces a 502 when every Open Library fetch fails", async () => {
    const user = await seedUser();
    await seedProfile(user.id, profileVector(), ["Science fiction"]);
    const deps: RetrievalDeps = {
      fetchSubjectWorks: jest.fn(async () => {
        throw new Error("network down");
      }),
      embed: jest.fn(async () => gradedVec(0.5)),
    };
    await expect(retrieveCandidates(user.id, {}, deps)).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
