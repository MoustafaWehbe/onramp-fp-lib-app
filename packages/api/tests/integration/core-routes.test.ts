import request from "supertest";
import { signAccessToken } from "@starter-kit/shared";
import { app } from "../../app";

// Verifies the scaffolded routes are wired with the correct auth/role middleware.
// Handlers are stubs (501), so no database is needed — authenticate/authorize run
// purely on the JWT.

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

  it("an authenticated user reaches an owner-scoped stub (501)", async () => {
    // /api/ai/taste-profile stays a stub (the AI pipeline is a separate, gated
    // phase); Books, Analytics, and Contributors are now implemented.
    const res = await request(app)
      .get("/api/ai/taste-profile")
      .set("Cookie", cookie("user"));
    expect(res.status).toBe(501);
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
    expect(asAdmin.status).toBe(501); // authorized, reaches the stub
  });
});
