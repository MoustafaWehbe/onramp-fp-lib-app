import { z } from "zod";

// Mirrors the Prisma ReadingStatus enum.
export const READING_STATUSES = [
  "WANT_TO_READ",
  "READING",
  "FINISHED",
  "ABANDONED",
] as const;

const statusEnum = z.enum(READING_STATUSES);

export const createBookSchema = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(300),
  genre: z.string().trim().max(120).optional(),
  coverImage: z.string().url().max(2000).optional(),
  status: statusEnum.optional(),
  openLibraryId: z.string().trim().max(120).optional(),
});

export const updateBookSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  author: z.string().trim().min(1).max(300).optional(),
  genre: z.string().trim().max(120).optional(),
  coverImage: z.string().url().max(2000).optional(),
  status: statusEnum.optional(),
});

export const listBooksQuerySchema = z.object({
  status: statusEnum.optional(),
  genre: z.string().trim().optional(),
  author: z.string().trim().optional(),
  q: z.string().trim().optional(),
  sort: z
    .enum([
      "createdAt",
      "-createdAt",
      "title",
      "-title",
      "updatedAt",
      "-updatedAt",
    ])
    .optional(),
});

export const journalEntrySchema = z.object({
  reflectionText: z.string().trim().min(1).max(10_000),
  favoriteQuotes: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
