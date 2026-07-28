import type { Request, Response, NextFunction } from "express";
import { shelvesService } from "../services/shelves.service";
import type {
  CreateShelfInput,
  UpdateShelfInput,
  AddBookInput,
} from "../schemas/shelves.schemas";

export const shelvesController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelves = await shelvesService.list(req.user!.userId);
      res.json({ data: shelves });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelf = await shelvesService.create(
        req.user!.userId,
        req.body as CreateShelfInput,
      );
      res.status(201).json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelf = await shelvesService.getOwned(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelf = await shelvesService.update(
        req.user!.userId,
        req.params.id as string,
        req.body as UpdateShelfInput,
      );
      res.json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await shelvesService.remove(req.user!.userId, req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async addBook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shelf = await shelvesService.addBook(
        req.user!.userId,
        req.params.id as string,
        (req.body as AddBookInput).bookId,
      );
      res.json({ data: shelf });
    } catch (err) {
      next(err);
    }
  },

  async removeBook(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await shelvesService.removeBook(
        req.user!.userId,
        req.params.id as string,
        req.params.bookId as string,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
