import request from "supertest";
import { getPrisma, signAccessToken } from "@starter-kit/shared";
import { app } from "../../app";
import { tasteProfileService } from "../../src/services/taste-profile.service";

// Exercises taste-profile aggregation against the real (test) Postgres. Book
// embeddings are seeded with known constant vectors (via raw SQL) so the
// rating-weighted average can be asserted exactly.

const prisma = getPrisma();

let seq = 0;
async function seedUser() {
  return prisma.user.create({
    data: {
      email: `taste-${Date.now()}-${seq++}@example.com`,
      passwordHash: "x",
      name: "Reader",
    },
  });
}

function cookieFor(user: { id: string; email: string; role: string }): string {
  const token = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role as "user" | "admin",
    sessionId: "00000000-0000-0000-0000-000000000000",
  });
  return `accessToken=${token}`;
}

/** Create a FINISHED book + journal entry + a BookEmbedding whose vector is all `value`. */
async function seedEmbeddedBook(opts: {
  userId: string;
  author: string;
  genre: string | null;
  rating: number | null;
  value: number;
}) {
  const book = await prisma.book.create({
    data: {
      userId: opts.userId,
      title: "T",
      author: opts.author,
      genre: opts.genre,
      status: "FINISHED",
    },
  });
  await prisma.journalEntry.create({
    data: {
      bookId: book.id,
      userId: opts.userId,
      reflectionText: "r",
      favoriteQuotes: [],
      rating: opts.rating,
    },
  });
  const vec = `[${Array(768).fill(opts.value).join(",")}]`;
  await prisma.$executeRaw`
    INSERT INTO book_embeddings (book_id, user_id, source_text, embedding, created_at, updated_at)
    VALUES (${book.id}::uuid, ${opts.userId}::uuid, 'seed', ${vec}::vector, now(), now())
  `;
  return book;
}

async function readProfileVector(userId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ embedding: string }[]>`
    SELECT embedding::text AS embedding FROM taste_profiles WHERE user_id = ${userId}::uuid
  `;
  return JSON.parse(rows[0]!.embedding) as number[];
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

describe("taste-profile refresh", () => {
  it("computes the rating-weighted average and persists the profile", async () => {
    const user = await seedUser();
    await seedEmbeddedBook({ userId: user.id, author: "Author A", genre: "SF", rating: 5, value: 1 });
    await seedEmbeddedBook({ userId: user.id, author: "Author B", genre: "Fantasy", rating: 1, value: 3 });

    const summary = await tasteProfileService.refresh(user.id);

    expect(summary.booksAggregated).toBe(2);
    expect(summary.dimensions).toBe(768);
    expect(summary.aggregatedData.avgRating).toBe(3); // (5 + 1) / 2
    expect(summary.aggregatedData.topGenres).toEqual(
      expect.arrayContaining([
        { genre: "SF", count: 1 },
        { genre: "Fantasy", count: 1 },
      ]),
    );
    expect(summary.aggregatedData.topAuthors).toEqual(
      expect.arrayContaining([
        { author: "Author A", count: 1 },
        { author: "Author B", count: 1 },
      ]),
    );

    // persisted vector = (5*1 + 1*3) / (5 + 1) = 8/6 per dimension
    const vec = await readProfileVector(user.id);
    expect(vec).toHaveLength(768);
    expect(vec[0]).toBeCloseTo(8 / 6, 4);
  });

  it("treats an unrated finished book as a neutral weight", async () => {
    const user = await seedUser();
    await seedEmbeddedBook({ userId: user.id, author: "A", genre: "SF", rating: null, value: 2 });

    const summary = await tasteProfileService.refresh(user.id);

    expect(summary.aggregatedData.avgRating).toBeNull(); // no explicit ratings
    const vec = await readProfileVector(user.id);
    expect(vec[0]).toBeCloseTo(2, 4); // single book → its own vector, any positive weight
  });

  it("re-refreshing updates the same profile row (no duplicate)", async () => {
    const user = await seedUser();
    await seedEmbeddedBook({ userId: user.id, author: "A", genre: "SF", rating: 4, value: 1 });

    await tasteProfileService.refresh(user.id);
    await tasteProfileService.refresh(user.id);

    expect(await prisma.tasteProfile.count({ where: { userId: user.id } })).toBe(1);
  });

  it("POST /api/ai/taste-profile/refresh returns 200 with the summary", async () => {
    const user = await seedUser();
    await seedEmbeddedBook({ userId: user.id, author: "A", genre: "SF", rating: 5, value: 1 });

    const res = await request(app)
      .post("/api/ai/taste-profile/refresh")
      .set("Cookie", cookieFor(user));

    expect(res.status).toBe(200);
    expect(res.body.data.booksAggregated).toBe(1);
    expect(res.body.data.dimensions).toBe(768);
  });

  it("returns 422 when the user has no embeddings yet", async () => {
    const user = await seedUser();
    const res = await request(app)
      .post("/api/ai/taste-profile/refresh")
      .set("Cookie", cookieFor(user));
    expect(res.status).toBe(422);
  });

  it("requires authentication (401)", async () => {
    const res = await request(app).post("/api/ai/taste-profile/refresh");
    expect(res.status).toBe(401);
  });
});
