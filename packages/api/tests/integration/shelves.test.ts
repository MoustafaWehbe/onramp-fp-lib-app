import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Exercises the Shelves CRUD + book-membership endpoints against the real
// (test) Postgres. Shared BullMQ/Redis handles are closed by tests/teardown.ts.

const prisma = getPrisma();

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

let accessCookie = "";

function authed<T extends { set(field: string, value: string): T }>(req: T): T {
  return req.set("Cookie", accessCookie);
}

async function resetDb() {
  await prisma.journalEntry.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function registerAndLogin(email: string): Promise<string> {
  await request(app)
    .post("/api/auth/register")
    .send({ email, password: "SecurePass1", name: "User" });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "SecurePass1" });
  return getCookie(login, "accessToken") as string;
}

beforeAll(async () => {
  await resetDb();
  accessCookie = await registerAndLogin("shelves@example.com");
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("Shelves CRUD (integration, real database)", () => {
  let shelfId = "";

  it("requires authentication (401)", async () => {
    const res = await request(app).get("/api/shelves");
    expect(res.status).toBe(401);
  });

  it("creates a shelf (201)", async () => {
    const res = await authed(request(app).post("/api/shelves")).send({
      name: "Favorites",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Favorites");
    shelfId = res.body.data.id;
  });

  it("rejects a duplicate shelf name (409)", async () => {
    const res = await authed(request(app).post("/api/shelves")).send({
      name: "Favorites",
    });
    expect(res.status).toBe(409);
  });

  it("lists the user's shelves", async () => {
    const res = await authed(request(app).get("/api/shelves"));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("gets a shelf with its (empty) books, and 404s for a missing one", async () => {
    const ok = await authed(request(app).get(`/api/shelves/${shelfId}`));
    expect(ok.status).toBe(200);
    expect(ok.body.data.books).toEqual([]);

    const missing = await authed(
      request(app).get("/api/shelves/00000000-0000-0000-0000-0000000000ff"),
    );
    expect(missing.status).toBe(404);
  });

  it("adds a book to the shelf and removes it", async () => {
    const book = await authed(request(app).post("/api/books")).send({
      title: "Dune",
      author: "Frank Herbert",
    });
    const bookId = book.body.data.id as string;

    const added = await authed(
      request(app).post(`/api/shelves/${shelfId}/books`),
    ).send({ bookId });
    expect(added.status).toBe(200);
    expect(
      added.body.data.books.map((b: { id: string }) => b.id),
    ).toContain(bookId);

    const removed = await authed(
      request(app).delete(`/api/shelves/${shelfId}/books/${bookId}`),
    );
    expect(removed.status).toBe(204);

    const after = await authed(request(app).get(`/api/shelves/${shelfId}`));
    expect(after.body.data.books).toHaveLength(0);
  });

  it("renames a shelf (200)", async () => {
    const res = await authed(
      request(app).patch(`/api/shelves/${shelfId}`),
    ).send({ name: "All-time favorites" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("All-time favorites");
  });

  it("won't shelve another user's book, and won't expose another user's shelf (404)", async () => {
    const otherCookie = await registerAndLogin("other-shelves@example.com");
    const otherBook = await request(app)
      .post("/api/books")
      .set("Cookie", otherCookie)
      .send({ title: "Solaris", author: "Stanisław Lem" });
    const otherBookId = otherBook.body.data.id as string;

    const add = await authed(
      request(app).post(`/api/shelves/${shelfId}/books`),
    ).send({ bookId: otherBookId });
    expect(add.status).toBe(404);

    const peek = await request(app)
      .get(`/api/shelves/${shelfId}`)
      .set("Cookie", otherCookie);
    expect(peek.status).toBe(404);
  });

  it("deletes a shelf (204), then 404s", async () => {
    const del = await authed(request(app).delete(`/api/shelves/${shelfId}`));
    expect(del.status).toBe(204);

    const after = await authed(request(app).get(`/api/shelves/${shelfId}`));
    expect(after.status).toBe(404);
  });
});
