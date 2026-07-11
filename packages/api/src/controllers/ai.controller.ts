import type { Request, Response, NextFunction } from "express";
import { tasteProfileService } from "../services/taste-profile.service";
import { generateDiscoveryReport } from "../services/discovery-report.service";

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

  async discoveryReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const moodModifier =
        typeof req.body?.moodModifier === "string"
          ? req.body.moodModifier
          : undefined;
      const report = await generateDiscoveryReport(req.user!.userId, {
        moodModifier,
      });
      res.status(201).json({ data: report });
    } catch (err) {
      next(err);
    }
  },
};
