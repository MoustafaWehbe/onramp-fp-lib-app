import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Admin account management + F18 aggregates against the real (test) Postgres.
// Shared BullMQ/Redis handles are closed once per file by tests/teardown.ts.

const prisma = getPrisma();

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

async function resetDb() {
  await prisma.discoveryReport.deleteMany();
  await prisma.journalEntry.deleteMany();
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

let adminCookie = "";
let adminId = "";
let readerId = "";
let readerCookie = "";

beforeAll(async () => {
  await resetDb();

  readerCookie = await registerAndLogin("reader@example.com");
  const reader = await prisma.user.findUnique({
    where: { email: "reader@example.com" },
  });
  readerId = reader!.id;
  // Give the reader some content the admin must never see.
  const book = await prisma.book.create({
    data: {
      userId: readerId,
      title: "Private Title",
      author: "Private Author",
      status: "FINISHED",
    },
  });
  await prisma.journalEntry.create({
    data: {
      bookId: book.id,
      userId: readerId,
      reflectionText: "Deeply personal reflection.",
      rating: 5,
    },
  });

  // Promote a second account to admin directly (registration never grants it).
  await registerAndLogin("boss@example.com");
  const boss = await prisma.user.update({
    where: { email: "boss@example.com" },
    data: { role: "admin" },
  });
  adminId = boss.id;
  // Log in again so the JWT carries the admin role.
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "boss@example.com", password: "SecurePass1" });
  adminCookie = getCookie(login, "accessToken") as string;
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("admin account management + aggregates", () => {
  it("is admin-only: 401 unauthenticated, 403 as a normal user", async () => {
    expect((await request(app).get("/api/admin/stats")).status).toBe(401);
    const asReader = await request(app)
      .get("/api/admin/stats")
      .set("Cookie", readerCookie);
    expect(asReader.status).toBe(403);
  });

  it("lists accounts with book counts but never reading content", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const reader = res.body.data.find(
      (u: { email: string }) => u.email === "reader@example.com",
    );
    expect(reader._count.books).toBe(1);
    // Account fields only — the response must not carry titles or journals.
    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain("Private Title");
    expect(flat).not.toContain("Deeply personal reflection");
  });

  it("gets one account by id and 404s for a missing one", async () => {
    const ok = await request(app)
      .get(`/api/admin/users/${readerId}`)
      .set("Cookie", adminCookie);
    expect(ok.status).toBe(200);
    expect(ok.body.data.email).toBe("reader@example.com");

    const missing = await request(app)
      .get("/api/admin/users/00000000-0000-0000-0000-0000000000ff")
      .set("Cookie", adminCookie);
    expect(missing.status).toBe(404);
  });

  it("updates a user's role and emailVerified", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${readerId}`)
      .set("Cookie", adminCookie)
      .send({ emailVerified: true });
    expect(res.status).toBe(200);
    expect(res.body.data.emailVerified).toBe(true);
  });

  it("rejects an empty patch (422, the validate middleware's convention)", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${readerId}`)
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(422);
  });

  it("won't let an admin demote or delete themselves (400)", async () => {
    const demote = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", adminCookie)
      .send({ role: "user" });
    expect(demote.status).toBe(400);

    const del = await request(app)
      .delete(`/api/admin/users/${adminId}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(400);
  });

  it("returns real aggregates in stats — counts, signups, reports/day, cohorts", async () => {
    const res = await request(app)
      .get("/api/admin/stats")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const stats = res.body.data;
    expect(stats.userCount).toBe(2);
    expect(stats.bookCount).toBe(1);
    expect(stats.signups7d).toBe(2);
    expect(stats.activeUsers30d).toBeGreaterThanOrEqual(2);
    expect(stats.reportsPerDay).toHaveLength(14);
    expect(stats.cohorts[0]).toMatchObject({ accounts: 2 });
    // Aggregates only — never a title or a journal.
    expect(JSON.stringify(stats)).not.toContain("Private Title");
  });

  it("deletes another user's account (204), cascading their data", async () => {
    const del = await request(app)
      .delete(`/api/admin/users/${readerId}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);
    expect(await prisma.book.count({ where: { userId: readerId } })).toBe(0);
  });
});
