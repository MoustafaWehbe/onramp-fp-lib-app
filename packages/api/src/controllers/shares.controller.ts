import type { Request, Response, NextFunction } from "express";
import { sharesService } from "../services/shares.service";
import type { InviteShareInput } from "../schemas/shares.schemas";

// Mounted with mergeParams at /api/shelves/:shelfId/shares, so req.params.shelfId
// is available here.

export const sharesController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shares = await sharesService.listForShelf(
        req.user!.userId,
        req.params.shelfId as string,
      );
      res.json({ data: shares });
    } catch (err) {
      next(err);
    }
  },

  async invite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const share = await sharesService.invite(
        req.user!.userId,
        req.params.shelfId as string,
        req.body as InviteShareInput,
      );
      res.status(201).json({ data: share });
    } catch (err) {
      next(err);
    }
  },

  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const share = await sharesService.respond(
        req.user!.userId,
        req.params.shelfId as string,
        true,
      );
      res.json({ data: share });
    } catch (err) {
      next(err);
    }
  },

  async decline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const share = await sharesService.respond(
        req.user!.userId,
        req.params.shelfId as string,
        false,
      );
      res.json({ data: share });
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await sharesService.revoke(
        req.user!.userId,
        req.params.shelfId as string,
        req.params.userId as string,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
