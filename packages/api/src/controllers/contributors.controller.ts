import type { Request, Response, NextFunction } from "express";
import { sharesService } from "../services/shares.service";
import type { AddSharedBookInput } from "../schemas/shares.schemas";

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

  /** WRITE contributor: add one of their own books to a shared shelf. */
  async addBook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelf = await sharesService.addBookToSharedShelf(
        req.user!.userId,
        req.params.shelfId as string,
        (req.body as AddSharedBookInput).bookId,
      );
      res.json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  /** WRITE contributor: remove one of their own books from a shared shelf. */
  async removeBook(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await sharesService.removeBookFromSharedShelf(
        req.user!.userId,
        req.params.shelfId as string,
        req.params.bookId as string,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
