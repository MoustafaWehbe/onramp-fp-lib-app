import type { Request, Response, NextFunction } from "express";
import { booksService } from "../services/books.service";
import type {
  CreateBookInput,
  UpdateBookInput,
  ListBooksQuery,
  JournalEntryInput,
} from "../schemas/books.schemas";

export const booksController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const books = await booksService.list(
        req.user!.userId,
        req.query as unknown as ListBooksQuery,
      );
      res.json({ data: books });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const book = await booksService.create(
        req.user!.userId,
        req.body as CreateBookInput,
      );
      res.status(201).json({ data: book });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const book = await booksService.getOwned(req.user!.userId, (req.params.id as string));
      res.json({ data: book });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const book = await booksService.update(
        req.user!.userId,
        (req.params.id as string),
        req.body as UpdateBookInput,
      );
      res.json({ data: book });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await booksService.remove(req.user!.userId, (req.params.id as string));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async getJournal(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const entry = await booksService.getJournal(
        req.user!.userId,
        (req.params.id as string),
      );
      res.json({ data: entry });
    } catch (err) {
      next(err);
    }
  },

  async putJournal(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const entry = await booksService.upsertJournal(
        req.user!.userId,
        (req.params.id as string),
        req.body as JournalEntryInput,
      );
      res.json({ data: entry });
    } catch (err) {
      next(err);
    }
  },
};
