import type { Request, Response, NextFunction } from "express";
import { booksService } from "../services/books.service";
import { findSimilarBooks } from "../services/similar-books.service";
import { searchCatalog } from "../lib/open-library";
import { saveCover } from "../lib/cover-storage";
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
      const book = await booksService.getOwnedWithFiles(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: book });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const book = await booksService.update(
        req.user!.userId,
        req.params.id as string,
        req.body as UpdateBookInput,
      );
      res.json({ data: book });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await booksService.remove(req.user!.userId, req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async catalogSearch(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const results = await searchCatalog(String(req.query.q ?? "").trim());
      res.json({ data: results });
    } catch (err) {
      next(err);
    }
  },

  async uploadCover(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const body = req.body as unknown;
      const result = await saveCover(
        Buffer.isBuffer(body) ? body : Buffer.alloc(0),
      );
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async similar(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await findSimilarBooks(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: result });
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
        req.params.id as string,
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
        req.params.id as string,
        req.body as JournalEntryInput,
      );
      res.json({ data: entry });
    } catch (err) {
      next(err);
    }
  },
};
