import request from "supertest";
import { app } from "../../app";
import { getPrisma, verifyPassword } from "@starter-kit/shared";
import { authService } from "../../src/services/auth.service";

// The password-reset flow, against the real (test) Postgres. The headline
// assertions: the forgot endpoint never reveals whether an address has an
// account, a token works exactly once inside its hour, and a successful reset
// signs the account out everywhere. The raw token comes from the service
// return (documented there) — only its sha256 hash ever touches the database.

const prisma = getPrisma();

const EMAIL = "reset.me@example.com";
const OLD_PASSWORD = "OldSecret1";
const NEW_PASSWORD = "NewSecret2";

async function resetDb() {
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  await resetDb();
  await request(app)
    .post("/api/auth/register")
    .send({ email: EMAIL, password: OLD_PASSWORD, name: "Reset Me" });
});

afterAll(async () => {
  await resetDb();
});

describe("POST /api/auth/forgot-password", () => {
  it("answers identically for known and unknown addresses", async () => {
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: EMAIL });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("stores only a hash, and a new request retires the old link", async () => {
    const first = await authService.requestPasswordReset(EMAIL);
    const second = await authService.requestPasswordReset(EMAIL);
    expect(first).toMatch(/^[0-9a-f]{64}$/);

    const rows = await prisma.passwordResetToken.findMany({
      where: { user: { email: EMAIL } },
      orderBy: { createdAt: "asc" },
    });
    // No raw token in the table…
    expect(rows.map((r) => r.tokenHash)).not.toContain(first);
    expect(rows.map((r) => r.tokenHash)).not.toContain(second);
    // …and exactly one live token: the newest.
    expect(rows.filter((r) => r.usedAt === null)).toHaveLength(1);
  });
});

// NOTE: the auth rate limiter allows 10 requests per process — this file
// budgets its HTTP calls (exactly 10) and asserts the rest at service level.
describe("POST /api/auth/reset-password", () => {
  it("rejects an unknown token as a client error", async () => {
    const unknown = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
  });

  it("keeps registration's password rules", async () => {
    const token = (await authService.requestPasswordReset(EMAIL)) as string;
    const weak = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "short" });
    expect(weak.status).toBe(422);
  });

  it("changes the password once, signs out everywhere, and burns the token", async () => {
    // A live session that must not survive the reset.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: OLD_PASSWORD });
    expect(login.status).toBe(200);

    const token = (await authService.requestPasswordReset(EMAIL)) as string;
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Old password out, new password in (hash checked directly — the login
    // endpoint stays inside this file's rate-limit budget).
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: OLD_PASSWORD });
    expect(oldLogin.status).toBe(401);
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(await verifyPassword(NEW_PASSWORD, user!.passwordHash)).toBe(true);

    // Signed out everywhere: no sessions, no live refresh tokens.
    const sessions = await prisma.session.findMany({
      where: { user: { email: EMAIL } },
    });
    expect(sessions).toHaveLength(0);
    const liveTokens = await prisma.refreshToken.findMany({
      where: { user: { email: EMAIL }, revokedAt: null },
    });
    expect(liveTokens).toHaveLength(0);

    // Single use: the same link never works twice.
    const replay = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "ThirdTry3" });
    expect(replay.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const token = (await authService.requestPasswordReset(EMAIL)) as string;
    const crypto = await import("crypto");
    await prisma.passwordResetToken.updateMany({
      where: {
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
  });
});
