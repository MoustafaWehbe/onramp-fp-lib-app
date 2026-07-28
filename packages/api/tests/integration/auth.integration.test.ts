import request from "supertest";
import type { Response } from "supertest";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// These tests exercise the real auth endpoints against the real (test) Postgres
// configured in tests/setup.ts (starter_kit_test) — nothing is mocked. They are
// the proof that the Prisma cutover behaves correctly end-to-end.

const prisma = getPrisma();

const user = {
  email: "integration@example.com",
  password: "SecurePass1",
  name: "Integration User",
};

/** Extract a single Set-Cookie value (e.g. "accessToken=abc") by name. */
function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

async function resetDb() {
  // ON DELETE CASCADE from users would suffice, but be explicit for clarity.
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  // BullMQ/Redis handles opened via the app barrel are closed centrally in
  // tests/teardown.ts (setupFilesAfterEnv).
});

describe("Auth endpoints (integration, real database)", () => {
  it("registers a new user and persists it (201)", async () => {
    const res = await request(app).post("/api/auth/register").send(user);

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe(user.email);

    const persisted = await prisma.user.findUnique({
      where: { email: user.email },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.role).toBe("user");
  });

  it("rejects a duplicate email (409)", async () => {
    const res = await request(app).post("/api/auth/register").send(user);
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials and sets auth cookies (200)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(getCookie(res, "accessToken")).toBeDefined();
    expect(getCookie(res, "refreshToken")).toBeDefined();

    // a refresh token row was persisted for the new session
    expect(await prisma.refreshToken.count()).toBeGreaterThan(0);
  });

  it("rejects login with a wrong password (401)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword9" });

    expect(res.status).toBe(401);
  });

  it("refreshes tokens with a valid refresh cookie (200)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    const refreshCookie = getCookie(login, "refreshToken");
    expect(refreshCookie).toBeDefined();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie as string);

    expect(res.status).toBe(200);
    expect(getCookie(res, "accessToken")).toBeDefined();
  });

  it("rejects a refresh token after logout", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    const accessCookie = getCookie(login, "accessToken");
    const refreshCookie = getCookie(login, "refreshToken");
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", [accessCookie as string, refreshCookie as string]);
    expect(logout.status).toBe(200);

    // the refresh token issued for that session is now revoked
    const refresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie as string);
    expect(refresh.status).toBe(401);
  });

  it("handles a concurrent duplicate registration as 409, not 500", async () => {
    const racer = {
      email: "race@example.com",
      password: "SecurePass1",
      name: "Race User",
    };

    // Fire two registrations at once. Both can pass the pre-check before either
    // commits, so one wins the unique constraint (201) and the other must be
    // mapped to 409 — never surface as an unhandled 500.
    const [a, b] = await Promise.all([
      request(app).post("/api/auth/register").send(racer),
      request(app).post("/api/auth/register").send(racer),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await prisma.user.count({ where: { email: racer.email } }),
    ).toBe(1);
  });
});
