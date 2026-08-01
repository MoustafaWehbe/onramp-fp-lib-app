import type { Request, Response, NextFunction } from "express";
import { tasteProfileService } from "../services/taste-profile.service";
import {
  generateDiscoveryReport,
  listDiscoveryReports,
  getDiscoveryReport,
} from "../services/discovery-report.service";

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

  async getTasteProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const profile = await tasteProfileService.get(req.user!.userId);
      res.json({ data: profile });
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

  async listDiscoveryReports(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const reports = await listDiscoveryReports(req.user!.userId);
      res.json({ data: reports });
    } catch (err) {
      next(err);
    }
  },

  async getDiscoveryReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const report = await getDiscoveryReport(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: report });
    } catch (err) {
      next(err);
    }
  },
};
