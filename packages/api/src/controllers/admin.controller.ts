import type { Request, Response, NextFunction } from "express";
import { adminService } from "../services/admin.service";
import type { UpdateUserInput } from "../schemas/admin.schemas";

export const adminController = {
  async listUsers(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const users = await adminService.listUsers();
      res.json({ data: users });
    } catch (err) {
      next(err);
    }
  },

  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await adminService.getUser(req.params.id as string);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async updateUser(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = await adminService.updateUser(
        req.user!.userId,
        req.params.id as string,
        req.body as UpdateUserInput,
      );
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await adminService.deleteUser(req.user!.userId, req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async auditLog(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const entries = await adminService.auditLog();
      res.json({ data: entries });
    } catch (err) {
      next(err);
    }
  },

  async stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await adminService.stats();
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  },
};
