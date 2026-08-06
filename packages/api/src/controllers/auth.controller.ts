import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";

const isProduction = process.env.NODE_ENV === "production";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api",
    maxAge: ACCESS_MAX_AGE,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth/refresh",
    maxAge: REFRESH_MAX_AGE,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/api" });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth/refresh" });
}

export const authController = {
  async register(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = await authService.register(req.body);
      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // The raw token is deliberately not part of the response — it travels
      // only in the emailed link. The answer is identical whether or not the
      // address has an account.
      await authService.requestPasswordReset(
        (req.body as { email: string }).email,
      );
      res.json({
        data: {
          message:
            "If that address has a Folio account, a reset link is on its way.",
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { token, password } = req.body as {
        token: string;
        password: string;
      };
      await authService.resetPassword(token, password);
      // The reset revoked every session server-side; drop this browser's
      // cookies too so its state matches.
      clearAuthCookies(res);
      res.json({ data: { message: "Password changed — log in with it." } });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, accessToken, refreshToken } = await authService.login({
        ...req.body,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      setAuthCookies(res, accessToken, refreshToken);
      res.json({ data: { user } });
    } catch (err) {
      next(err);
    }
  },

  async refresh(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!refreshToken) {
        res.status(401).json({ error: "Missing refresh token" });
        return;
      }
      const tokens = await authService.refresh(refreshToken);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      res.json({ data: { message: "Token refreshed" } });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.sessionId) {
        await authService.logout(req.user.sessionId);
      }
      clearAuthCookies(res);
      res.json({ data: { message: "Logged out successfully" } });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getProfile(req.user!.userId);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },
};
