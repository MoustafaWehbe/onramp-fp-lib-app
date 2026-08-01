import type { Request, Response, NextFunction } from "express";
import { bookSharesService } from "../services/book-shares.service";
import type { ShareBookInput } from "../schemas/shares.schemas";

export const bookSharesController = {
  async share(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as ShareBookInput;
      const share = await bookSharesService.share(
        req.user!.userId,
        req.params.id as string,
        email,
      );
      res.status(201).json({ data: share });
    } catch (err) {
      next(err);
    }
  },

  async listForBook(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const shares = await bookSharesService.listForBook(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: shares });
    } catch (err) {
      next(err);
    }
  },

  async listSent(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const shares = await bookSharesService.listSent(req.user!.userId);
      res.json({ data: shares });
    } catch (err) {
      next(err);
    }
  },

  async listReceived(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const shares = await bookSharesService.listReceived(req.user!.userId);
      res.json({ data: shares });
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await bookSharesService.revoke(
        req.user!.userId,
        req.params.shareId as string,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
