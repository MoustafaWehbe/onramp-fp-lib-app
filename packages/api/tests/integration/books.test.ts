import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Exercises the Books CRUD + journal endpoints against the real (test) Postgres.

const prisma = getPrisma();

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

let accessCookie = "";

/** Attach the logged-in user's access cookie to a supertest request. */
function authed<T extends { set(field: string, value: string): T }>(req: T): T {
  return req.set("Cookie", accessCookie);
}

async function resetDb() {
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  await resetDb();
  await request(app)
    .post("/api/auth/register")
    .send({ email: "books@example.com", password: "SecurePass1", name: "Books" });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "books@example.com", password: "SecurePass1" });
  accessCookie = getCookie(login, "accessToken") as string;
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  // Shared BullMQ/Redis handles are closed once per file by tests/teardown.ts.
});

describe("Books CRUD (integration, real database)", () => {
  let bookId = "";

  it("creates a book (201), defaulting status to WANT_TO_READ", async () => {
    const res = await authed(request(app).post("/api/books")).send({
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
      genre: "Science Fiction",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("The Left Hand of Darkness");
    expect(res.body.data.status).toBe("WANT_TO_READ");
    bookId = res.body.data.id;
  });

  it("requires authentication (401)", async () => {
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(401);
  });

  it("lists the user's books and filters by status", async () => {
    const all = await authed(request(app).get("/api/books"));
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThanOrEqual(1);

    const finished = await authed(
      request(app).get("/api/books").query({ status: "FINISHED" }),
    );
    expect(finished.status).toBe(200);
    expect(finished.body.data).toHaveLength(0);
  });

  it("rejects a duplicate (title, author) with 409", async () => {
    const res = await authed(request(app).post("/api/books")).send({
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
    });
    expect(res.status).toBe(409);
  });

  it("gets a book by id and 404s for a missing one", async () => {
    const ok = await authed(request(app).get(`/api/books/${bookId}`));
    expect(ok.status).toBe(200);

    const missing = await authed(
      request(app).get("/api/books/00000000-0000-0000-0000-0000000000ff"),
    );
    expect(missing.status).toBe(404);
  });

  it("rejects a journal entry until FINISHED (409), then accepts it (200)", async () => {
    const tooEarly = await authed(
      request(app).put(`/api/books/${bookId}/journal`),
    ).send({ reflectionText: "Loved it." });
    expect(tooEarly.status).toBe(409);

    const patched = await authed(
      request(app).patch(`/api/books/${bookId}`),
    ).send({ status: "FINISHED" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe("FINISHED");

    const journal = await authed(
      request(app).put(`/api/books/${bookId}/journal`),
    ).send({
      reflectionText: "A quiet, profound book about gender and trust.",
      favoriteQuotes: ["Light is the left hand of darkness."],
      rating: 5,
    });
    expect(journal.status).toBe(200);
    expect(journal.body.data.rating).toBe(5);

    const got = await authed(request(app).get(`/api/books/${bookId}/journal`));
    expect(got.status).toBe(200);
    expect(got.body.data.reflectionText).toContain("profound");
  });

  it("does not expose another user's book (404)", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "other@example.com", password: "SecurePass1", name: "Other" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "other@example.com", password: "SecurePass1" });
    const otherCookie = getCookie(login, "accessToken") as string;

    const res = await request(app)
      .get(`/api/books/${bookId}`)
      .set("Cookie", otherCookie);
    expect(res.status).toBe(404);
  });

  it("deletes a book (204), then 404s", async () => {
    const del = await authed(request(app).delete(`/api/books/${bookId}`));
    expect(del.status).toBe(204);

    const after = await authed(request(app).get(`/api/books/${bookId}`));
    expect(after.status).toBe(404);
  });
});
