import type { Request, Response, NextFunction } from "express";
import { tasteProfileService } from "../services/taste-profile.service";

export const aiController = {
  async refreshTasteProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const summary = await tasteProfileService.refresh(req.user!.userId);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  },
};
