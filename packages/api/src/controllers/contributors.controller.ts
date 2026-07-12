import type { Request, Response, NextFunction } from "express";
import { sharesService } from "../services/shares.service";

export const contributorsController = {
  /** People this user shares their shelves with (outgoing collaborators). */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contributors = await sharesService.contributors(req.user!.userId);
      res.json({ data: contributors });
    } catch (err) {
      next(err);
    }
  },

  /** Shelves shared with this user (incoming) — book metadata only. */
  async sharedWithMe(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const shelves = await sharesService.sharedWithMe(req.user!.userId);
      res.json({ data: shelves });
    } catch (err) {
      next(err);
    }
  },
};
