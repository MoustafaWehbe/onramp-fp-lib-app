import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Design E18 — sharing ONE book with one named person. The headline assertion
// is the projection boundary: the recipient sees catalogue metadata and the
// sender's name, and never the owner's journal, rating, or lifecycle status.
// book_shares is touched via raw SQL (see book-shares.service.ts note).

const prisma = getPrisma();

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

async function registerAndLogin(
  email: string,
): Promise<{ id: string; cookie: string }> {
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "SecurePass1", name: "User" });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "SecurePass1" });
  return {
    id: reg.body.data.id as string,
    cookie: getCookie(login, "accessToken") as string,
  };
}

async function resetDb() {
  await prisma.$executeRaw`DELETE FROM book_shares`;
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

let irisCookie = "";
let mayaCookie = "";
let bookId = "";

beforeAll(async () => {
  await resetDb();

  const iris = await registerAndLogin("iris@example.com");
  const maya = await registerAndLogin("maya@example.com");
  irisCookie = iris.cookie;
  mayaCookie = maya.cookie;

  // Iris owns a finished, journaled, rated book — all things Maya must not see.
  const created = await request(app)
    .post("/api/books")
    .set("Cookie", irisCookie)
    .send({
      title: "The Winter Orchard",
      author: "Sofia Lindqvist",
      genre: "Literary Fiction",
      year: 2024,
      pageCount: 312,
      status: "FINISHED",
    });
  bookId = created.body.data.id as string;

  await request(app)
    .put(`/api/books/${bookId}/journal`)
    .set("Cookie", irisCookie)
    .send({ reflectionText: "Private thoughts about frost.", rating: 5 });
});

afterAll(async () => {
  await resetDb();
});

describe("POST /api/books/:id/share", () => {
  it("rejects an address with no account", async () => {
    const res = await request(app)
      .post(`/api/books/${bookId}/share`)
      .set("Cookie", irisCookie)
      .send({ email: "nobody@example.com" });
    expect(res.status).toBe(404);
  });

  it("rejects sharing with yourself", async () => {
    const res = await request(app)
      .post(`/api/books/${bookId}/share`)
      .set("Cookie", irisCookie)
      .send({ email: "iris@example.com" });
    expect(res.status).toBe(400);
  });

  it("shares with an existing reader, once", async () => {
    const res = await request(app)
      .post(`/api/books/${bookId}/share`)
      .set("Cookie", irisCookie)
      .send({ email: "maya@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.data.recipient.name).toBe("User");

    const dup = await request(app)
      .post(`/api/books/${bookId}/share`)
      .set("Cookie", irisCookie)
      .send({ email: "maya@example.com" });
    expect(dup.status).toBe(409);
  });

  it("won't share a book you don't own", async () => {
    const res = await request(app)
      .post(`/api/books/${bookId}/share`)
      .set("Cookie", mayaCookie)
      .send({ email: "iris@example.com" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/book-shares/received — the projection boundary", () => {
  it("gives the recipient metadata and the sender's name, nothing else", async () => {
    const res = await request(app)
      .get("/api/book-shares/received")
      .set("Cookie", mayaCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const share = res.body.data[0];
    expect(share.book).toEqual({
      id: bookId,
      title: "The Winter Orchard",
      author: "Sofia Lindqvist",
      genre: "Literary Fiction",
      coverImage: null,
      year: 2024,
      pageCount: 312,
    });
    expect(share.sender.name).toBe("User");

    // The boundary itself: no journal, rating, status, or dates leak through.
    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain("Private thoughts");
    expect(flat).not.toContain("rating");
    expect(flat).not.toContain("FINISHED");
    expect(share.book.status).toBeUndefined();
  });

  it("never exposes the owner's journal over the shared book's endpoints", async () => {
    // Maya cannot read Iris's book or journal directly either.
    const book = await request(app)
      .get(`/api/books/${bookId}`)
      .set("Cookie", mayaCookie);
    expect(book.status).toBe(404);
    const journal = await request(app)
      .get(`/api/books/${bookId}/journal`)
      .set("Cookie", mayaCookie);
    expect(journal.status).toBe(404);
  });

  it("never exposes the owner's attached file or reading progress", async () => {
    // The share is metadata-only; the new file surface answers exactly like
    // the journal — not found, never "exists but forbidden".
    const file = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", mayaCookie);
    expect(file.status).toBe(404);
    const progress = await request(app)
      .get(`/api/books/${bookId}/progress`)
      .set("Cookie", mayaCookie);
    expect(progress.status).toBe(404);
  });
});

describe("DELETE /api/book-shares/:shareId — take it back", () => {
  it("only the sender can revoke, and the share disappears", async () => {
    const sent = await request(app)
      .get("/api/book-shares/sent")
      .set("Cookie", irisCookie);
    expect(sent.status).toBe(200);
    const shareId = sent.body.data[0].shareId as string;

    const notMine = await request(app)
      .delete(`/api/book-shares/${shareId}`)
      .set("Cookie", mayaCookie);
    expect(notMine.status).toBe(404);

    const revoked = await request(app)
      .delete(`/api/book-shares/${shareId}`)
      .set("Cookie", irisCookie);
    expect(revoked.status).toBe(204);

    const after = await request(app)
      .get("/api/book-shares/received")
      .set("Cookie", mayaCookie);
    expect(after.body.data).toHaveLength(0);
  });
});
