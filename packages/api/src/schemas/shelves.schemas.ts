import { z } from "zod";

export const createShelfSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateShelfSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const addBookSchema = z.object({
  bookId: z.string().uuid(),
});

export type CreateShelfInput = z.infer<typeof createShelfSchema>;
export type UpdateShelfInput = z.infer<typeof updateShelfSchema>;
export type AddBookInput = z.infer<typeof addBookSchema>;
