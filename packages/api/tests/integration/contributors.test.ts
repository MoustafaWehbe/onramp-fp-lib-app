import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Shelf sharing + contributors, against the real (test) Postgres. The headline
// assertion is the ISOLATION boundary: a contributor with access to a shared
// shelf can read that shelf's book metadata, but never the owner's journal
// entries, ratings, or reading metrics. Shared handles are closed by
// tests/teardown.ts.

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
  return { id: reg.body.data.id as string, cookie: getCookie(login, "accessToken") as string };
}

async function resetDb() {
  await prisma.shelfShare.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

let aliceId = "";
let aliceCookie = "";
let bobId = "";
let bobCookie = "";
let carolCookie = "";
let shelfId = "";
let bookId = "";

beforeAll(async () => {
  await resetDb();

  const alice = await registerAndLogin("alice@example.com");
  const bob = await registerAndLogin("bob@example.com");
  const carol = await registerAndLogin("carol@example.com");
  aliceId = alice.id;
  aliceCookie = alice.cookie;
  bobId = bob.id;
  bobCookie = bob.cookie;
  carolCookie = carol.cookie;

  // Seed Alice's private library directly (shelf CRUD lives on another branch).
  const shelf = await prisma.shelf.create({
    data: { userId: aliceId, name: "Sci-Fi" },
  });
  shelfId = shelf.id;
  const book = await prisma.book.create({
    data: {
      userId: aliceId,
      title: "Dune",
      author: "Frank Herbert",
      genre: "Science Fiction",
      status: "FINISHED",
    },
  });
  bookId = book.id;
  await prisma.shelf.update({
    where: { id: shelfId },
    data: { books: { connect: { id: bookId } } },
  });
  // Alice's personal reflection + rating — a contributor must never see these.
  await prisma.journalEntry.create({
    data: {
      bookId,
      userId: aliceId,
      reflectionText: "A profound meditation on ecology and power.",
      favoriteQuotes: ["Fear is the mind-killer."],
      rating: 5,
    },
  });
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("Shelf sharing + contributors (integration, real database)", () => {
  it("requires authentication (401)", async () => {
    expect((await request(app).get("/api/contributors")).status).toBe(401);
    expect(
      (await request(app).get(`/api/shelves/${shelfId}/shares`)).status,
    ).toBe(401);
  });

  it("owner invites an existing user (201, PENDING)", async () => {
    const res = await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie)
      .send({ email: "bob@example.com", accessLevel: "VIEW" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.accessLevel).toBe("VIEW");
    expect(res.body.data.user.email).toBe("bob@example.com");
  });

  it("rejects inviting an unknown email (404) and inviting yourself (400)", async () => {
    const ghost = await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie)
      .send({ email: "ghost@example.com" });
    expect(ghost.status).toBe(404);

    const self = await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie)
      .send({ email: "alice@example.com" });
    expect(self.status).toBe(400);
  });

  it("rejects a duplicate invite (409)", async () => {
    const res = await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie)
      .send({ email: "bob@example.com" });
    expect(res.status).toBe(409);
  });

  it("won't let a non-owner manage another user's shelf shares (404)", async () => {
    const list = await request(app)
      .get(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", carolCookie);
    expect(list.status).toBe(404);

    const invite = await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", carolCookie)
      .send({ email: "carol@example.com" });
    expect(invite.status).toBe(404);
  });

  it("owner lists the shelf's shares", async () => {
    const res = await request(app)
      .get(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].user.email).toBe("bob@example.com");
  });

  it("invitee accepts the invite (200, ACCEPTED)", async () => {
    const res = await request(app)
      .post(`/api/shelves/${shelfId}/shares/accept`)
      .set("Cookie", bobCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACCEPTED");
  });

  // ── The isolation boundary ──────────────────────────────────────────────
  it("a contributor sees the shared shelf's book metadata only — never the owner's journal, ratings, or metrics", async () => {
    // Bob sees the shared shelf and its book's catalogue fields...
    const shared = await request(app)
      .get("/api/contributors/shelves")
      .set("Cookie", bobCookie);
    expect(shared.status).toBe(200);
    const shelf = shared.body.data.find(
      (s: { shelfId: string }) => s.shelfId === shelfId,
    );
    expect(shelf).toBeDefined();
    expect(shelf.name).toBe("Sci-Fi");
    const book = shelf.books[0];
    expect(book.title).toBe("Dune");
    expect(book.status).toBe("FINISHED");
    // ...but nothing from Alice's private journal.
    expect(book).not.toHaveProperty("rating");
    expect(book).not.toHaveProperty("reflectionText");
    expect(book).not.toHaveProperty("favoriteQuotes");
    expect(book).not.toHaveProperty("journalEntry");

    // Bob can't reach Alice's book, journal, or fold it into his own metrics.
    expect(
      (await request(app).get(`/api/books/${bookId}`).set("Cookie", bobCookie))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/books/${bookId}/journal`)
          .set("Cookie", bobCookie)
      ).status,
    ).toBe(404);
    // Alice's shared shelf holds a FINISHED book, but it must not count toward
    // Bob's reading metrics.
    const analytics = await request(app)
      .get("/api/analytics/summary")
      .set("Cookie", bobCookie);
    expect(analytics.status).toBe(200);
    expect(analytics.body.data.totalFinished).toBe(0);
  });

  it("owner sees the contributor across their shelves", async () => {
    const res = await request(app)
      .get("/api/contributors")
      .set("Cookie", aliceCookie);
    expect(res.status).toBe(200);
    const entry = res.body.data.find(
      (c: { user: { id: string } }) => c.user.id === bobId,
    );
    expect(entry).toBeDefined();
    expect(entry.accessLevel).toBe("VIEW");
    expect(entry.status).toBe("ACCEPTED");
    expect(entry.shelfName).toBe("Sci-Fi");
  });

  it("a declined invite grants no access", async () => {
    await request(app)
      .post(`/api/shelves/${shelfId}/shares`)
      .set("Cookie", aliceCookie)
      .send({ email: "carol@example.com" });
    const declined = await request(app)
      .post(`/api/shelves/${shelfId}/shares/decline`)
      .set("Cookie", carolCookie);
    expect(declined.status).toBe(200);
    expect(declined.body.data.status).toBe("DECLINED");

    const carolShared = await request(app)
      .get("/api/contributors/shelves")
      .set("Cookie", carolCookie);
    expect(carolShared.body.data).toHaveLength(0);
  });

  it("revoking a share removes the contributor's access", async () => {
    const revoke = await request(app)
      .delete(`/api/shelves/${shelfId}/shares/${bobId}`)
      .set("Cookie", aliceCookie);
    expect(revoke.status).toBe(204);

    const bobShared = await request(app)
      .get("/api/contributors/shelves")
      .set("Cookie", bobCookie);
    expect(bobShared.body.data).toHaveLength(0);
  });
});
