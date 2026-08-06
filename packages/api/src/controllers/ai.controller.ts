import type { Request, Response, NextFunction } from "express";
import { tasteProfileService } from "../services/taste-profile.service";
import {
  generateDiscoveryReport,
  listDiscoveryReports,
  getDiscoveryReport,
} from "../services/discovery-report.service";
import { generateJournalPrompts } from "../services/journal-prompts.service";
import { buildMoodShelf } from "../services/mood-shelf.service";
import {
  memoryOverview,
  searchMemory,
} from "../services/memory-search.service";
import { yearInReading } from "../services/year-in-reading.service";
import type { MoodShelfInput, MemorySearchInput } from "../schemas/ai.schemas";

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

  async journalPrompts(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const prompts = await generateJournalPrompts(
        req.user!.userId,
        req.params.bookId as string,
      );
      res.json({ data: { prompts } });
    } catch (err) {
      next(err);
    }
  },

  async moodShelf(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { mood, force } = req.body as MoodShelfInput;
      const shelf = await buildMoodShelf(req.user!.userId, mood, { force });
      res.json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  async memoryOverview(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const overview = await memoryOverview(req.user!.userId);
      res.json({ data: overview });
    } catch (err) {
      next(err);
    }
  },

  async memorySearch(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { query } = req.body as MemorySearchInput;
      const result = await searchMemory(req.user!.userId, query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async yearInReading(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const currentYear = new Date().getUTCFullYear();
      const parsed = Number.parseInt(String(req.query.year ?? ""), 10);
      // Clamp instead of erroring: an out-of-range year has an obvious intent.
      const year = Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, 1900), currentYear)
        : currentYear;
      const result = await yearInReading(req.user!.userId, year);
      res.json({ data: result });
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
