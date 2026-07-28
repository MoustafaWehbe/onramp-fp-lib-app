import type { Request, Response, NextFunction } from "express";
import { analyticsService } from "../services/analytics.service";

export const analyticsController = {
  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await analyticsService.summary(req.user!.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
};
