import crypto from "crypto";
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  verifyRefreshToken,
  getPrisma,
  Prisma,
  type UserRole,
} from "@starter-kit/shared";
import { emailQueue } from "../lib/queue";
import { createError } from "../middleware/error-handler";

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
/** A reset link is good for an hour — long enough for email, short enough to leak safely. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1_000;

const prisma = getPrisma();

/** A refresh token is usable only if it hasn't expired and hasn't been revoked. */
function isRefreshTokenValid(token: {
  expiresAt: Date;
  revokedAt: Date | null;
}): boolean {
  const notExpired = new Date() <= token.expiresAt;
  const notRevoked = token.revokedAt == null;
  return notExpired && notRevoked;
}

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw createError("Email already in use", 409);
    }

    const passwordHash = await hashPassword(input.password);
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
      };
    } catch (err) {
      // A concurrent registration can win the race between the check above and
      // this create, surfacing as a unique-constraint violation (P2002). Map it
      // to the same 409 as the pre-check instead of a 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw createError("Email already in use", 409);
      }
      throw err;
    }
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw createError("Invalid credentials", 401);
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw createError("Invalid credentials", 401);
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      },
    });

    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    const tokenHash = crypto
      .createHash("sha256")
      .update(tokens.refreshToken)
      .digest("hex");

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash,
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
      },
      ...tokens,
    };
  }

  async refresh(rawToken: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || !isRefreshTokenValid(stored)) {
      throw createError("Invalid or expired refresh token", 401);
    }

    const payload = verifyRefreshToken(rawToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) throw createError("User not found", 404);

    // Validate the session BEFORE revoking anything, so a missing session never
    // burns a still-valid token.
    const session = await prisma.session.findUnique({
      where: { id: stored.sessionId },
    });
    if (!session) throw createError("Session not found", 401);

    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    const newHash = crypto
      .createHash("sha256")
      .update(tokens.refreshToken)
      .digest("hex");

    // Rotate atomically: revoke the old token and create the replacement in one
    // transaction so a mid-rotation failure can't leave the user with no valid
    // refresh token.
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          sessionId: session.id,
          tokenHash: newHash,
          expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
        },
      }),
    ]);

    return tokens;
  }

  async logout(sessionId: string) {
    await prisma.refreshToken.updateMany({
      where: { sessionId },
      data: { revokedAt: new Date() },
    });
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /**
   * Start a password reset. Deliberately quiet about whether the email has an
   * account — the endpoint answers the same either way, so it can't be used to
   * enumerate readers. When the user exists: any outstanding tokens are
   * retired, a fresh single-use token is stored as a sha256 hash (mirroring
   * refresh tokens), and the raw token goes out once, in the emailed link.
   *
   * Returns the raw token so tests (and a worker-less dev setup, where the
   * email job just sits in Redis) can complete the flow; the controller never
   * puts it in a response.
   */
  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await prisma.$transaction([
      // One live link at a time: a new request retires older, unused ones.
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);

    // Best-effort, like every enqueue here: the request must not 500 because
    // Redis blinked. The reader can simply ask again.
    const appOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
    try {
      await emailQueue.add("password-reset", {
        to: user.email,
        subject: "Reset your Folio password",
        template: "password-reset",
        variables: {
          name: user.name,
          resetUrl: `${appOrigin}/reset-password?token=${rawToken}`,
        },
      });
    } catch (err) {
      console.error(
        "[auth] failed to enqueue password-reset email",
        err instanceof Error ? err.message : err,
      );
    }

    return rawToken;
  }

  /**
   * Finish a password reset. The token must exist, be unused, and be inside
   * its hour — anything else is one flat 400, with no hint of which check
   * failed. Success consumes the token, sets the new password, and signs the
   * account out everywhere (all sessions dropped, all refresh tokens revoked):
   * whoever holds the new password is the only one still in.
   */
  async resetPassword(rawToken: string, password: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.usedAt !== null || new Date() > stored.expiresAt) {
      throw createError("That reset link is invalid or has expired.", 400);
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId: stored.userId } }),
    ]);
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    if (!user) throw createError("User not found", 404);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();
