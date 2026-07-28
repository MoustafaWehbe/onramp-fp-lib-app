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
