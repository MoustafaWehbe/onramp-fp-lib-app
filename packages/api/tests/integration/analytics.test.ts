import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

const prisma = getPrisma();

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

let accessCookie = "";
let userId = "";

async function resetDb() {
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  await resetDb();

  const reg = await request(app).post("/api/auth/register").send({
    email: "analytics@example.com",
    password: "SecurePass1",
    name: "Analytics",
  });
  userId = reg.body.data.id;
  const login = await request(app).post("/api/auth/login").send({
    email: "analytics@example.com",
    password: "SecurePass1",
  });
  accessCookie = getCookie(login, "accessToken") as string;

  // Seed a small library directly (Books CRUD is a separate branch).
  const [a, b, c] = await Promise.all([
    prisma.book.create({
      data: {
        userId,
        title: "A",
        author: "X",
        genre: "Science Fiction",
        status: "FINISHED",
      },
    }),
    prisma.book.create({
      data: {
        userId,
        title: "B",
        author: "Y",
        genre: "Science Fiction",
        status: "FINISHED",
      },
    }),
    prisma.book.create({
      data: {
        userId,
        title: "C",
        author: "Z",
        genre: "Fantasy",
        status: "FINISHED",
      },
    }),
  ]);
  await prisma.book.create({
    data: {
      userId,
      title: "D",
      author: "W",
      genre: "Fantasy",
      status: "READING",
    },
  });

  await Promise.all([
    prisma.journalEntry.create({
      data: {
        bookId: a.id,
        userId,
        reflectionText: "a",
        favoriteQuotes: [],
        rating: 5,
      },
    }),
    prisma.journalEntry.create({
      data: {
        bookId: b.id,
        userId,
        reflectionText: "b",
        favoriteQuotes: [],
        rating: 3,
      },
    }),
    prisma.journalEntry.create({
      data: {
        bookId: c.id,
        userId,
        reflectionText: "c",
        favoriteQuotes: [],
        rating: 4,
      },
    }),
  ]);

  // Backdate one finished book so the velocity series spans two months.
  await prisma.$executeRaw`UPDATE "books" SET "updated_at" = '2024-01-15T00:00:00Z' WHERE "id" = ${a.id}::uuid`;
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  // Shared BullMQ/Redis handles are closed once per file by tests/teardown.ts.
});

describe("Analytics summary (integration, real database)", () => {
  it("requires authentication (401)", async () => {
    const res = await request(app).get("/api/analytics/summary");
    expect(res.status).toBe(401);
  });

  it("returns the user's reading summary (200)", async () => {
    const res = await request(app)
      .get("/api/analytics/summary")
      .set("Cookie", accessCookie);
    expect(res.status).toBe(200);

    const s = res.body.data;
    expect(s.totalFinished).toBe(3);
    expect(s.averageRating).toBe(4); // (5 + 3 + 4) / 3

    const byGenre = Object.fromEntries(
      s.genreBreakdown.map((g: { genre: string; count: number }) => [
        g.genre,
        g.count,
      ]),
    );
    expect(byGenre["Science Fiction"]).toBe(2);
    // The seed includes a READING Fantasy book (D) precisely so this asserts
    // the breakdown counts finished books only — Fantasy has 2 in the library
    // but 1 finished.
    expect(byGenre["Fantasy"]).toBe(1);

    const jan = s.velocity.find(
      (v: { month: string; finished: number }) => v.month === "2024-01",
    );
    expect(jan?.finished).toBe(1);
    expect(s.velocity.length).toBeGreaterThanOrEqual(2);

    // C12 tile sublines. No seeded pageCounts → 0, never null.
    expect(s.pagesFinished).toBe(0);
    // Science Fiction has two rated books (5, 3 → 4.0); Fantasy has one and
    // must not qualify — a single five-star can't crown a favourite.
    expect(s.topRatedGenre).toEqual({ genre: "Science Fiction", average: 4 });
    // Book D is the only READING book, added moments ago.
    expect(s.longestInProgress).toEqual({ title: "D", weeks: 0 });
  });

  it("scopes to the requesting user only (empty for a fresh user)", async () => {
    await request(app).post("/api/auth/register").send({
      email: "empty@example.com",
      password: "SecurePass1",
      name: "Empty",
    });
    const login = await request(app).post("/api/auth/login").send({
      email: "empty@example.com",
      password: "SecurePass1",
    });
    const cookie = getCookie(login, "accessToken") as string;

    const res = await request(app)
      .get("/api/analytics/summary")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.totalFinished).toBe(0);
    expect(res.body.data.averageRating).toBeNull();
    expect(res.body.data.genreBreakdown).toHaveLength(0);
    expect(res.body.data.velocity).toHaveLength(0);
    expect(res.body.data.pagesFinished).toBe(0);
    expect(res.body.data.topRatedGenre).toBeNull();
    expect(res.body.data.longestInProgress).toBeNull();
  });
});
