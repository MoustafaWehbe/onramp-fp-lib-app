import request from "supertest";
import { signAccessToken } from "@starter-kit/shared";
import { app } from "../../app";

// Verifies the routes are wired with the correct auth/role middleware. Every
// handler is implemented now, so these assertions check that auth passes
// through to the real handler rather than short-circuiting at 401/403.

function cookie(role: "user" | "admin"): string {
  const token = signAccessToken({
    userId: "00000000-0000-0000-0000-000000000009",
    email: "wiring@example.com",
    role,
    sessionId: "00000000-0000-0000-0000-00000000000a",
  });
  return `accessToken=${token}`;
}

// BullMQ/Redis handles opened via the app barrel are closed centrally in
// tests/teardown.ts (setupFilesAfterEnv).

describe("core route scaffolding — auth/role wiring", () => {
  const ownerRoutes = [
    "/api/books",
    "/api/shelves",
    "/api/analytics",
    "/api/ai/taste-profile",
    "/api/contributors",
  ];

  it("owner-scoped routes require authentication (401 without a token)", async () => {
    for (const path of ownerRoutes) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it("an authenticated user passes the auth gate and reaches the handler", async () => {
    // There's no owner-scoped 501 stub left to probe — the AI GETs were the last
    // ones. What still matters is that authenticate lets a valid token through
    // to the handler: this token's user has no taste profile, so the handler
    // itself answers 404 rather than authenticate short-circuiting on 401/403.
    const res = await request(app)
      .get("/api/ai/taste-profile")
      .set("Cookie", cookie("user"));
    expect(res.status).toBe(404);
  });

  it("admin routes require authentication, then the admin role", async () => {
    const noAuth = await request(app).get("/api/admin/users");
    expect(noAuth.status).toBe(401);

    const asUser = await request(app)
      .get("/api/admin/users")
      .set("Cookie", cookie("user"));
    expect(asUser.status).toBe(403); // authenticated but not admin

    const asAdmin = await request(app)
      .get("/api/admin/users")
      .set("Cookie", cookie("admin"));
    expect(asAdmin.status).toBe(200); // authorized, reaches the real handler
  });
});
