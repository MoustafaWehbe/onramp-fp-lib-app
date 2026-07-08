import type { Request, Response } from "express";

/**
 * Placeholder handler for endpoints that are scaffolded (correct route + auth
 * wiring) but whose business logic isn't implemented yet. Returns 501.
 */
export function notImplemented(_req: Request, res: Response): void {
  res.status(501).json({ error: "Not implemented" });
}
