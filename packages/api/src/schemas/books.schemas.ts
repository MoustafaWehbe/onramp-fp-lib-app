import { z } from "zod";

// Mirrors the Prisma ReadingStatus enum.
export const READING_STATUSES = [
  "WANT_TO_READ",
  "READING",
  "FINISHED",
  "ABANDONED",
] as const;

const statusEnum = z.enum(READING_STATUSES);

// Mirrors the Prisma BookFormat enum. Design B6a: "Just a label, for your own
// filtering. Folio doesn't store or open book files."
export const BOOK_FORMATS = ["PHYSICAL", "EBOOK", "AUDIOBOOK"] as const;

const formatEnum = z.enum(BOOK_FORMATS);

// A cover is either an external URL (Open Library) or a site-relative path
// from the B6a upload endpoint — nothing else.
const coverImage = z
  .string()
  .max(2000)
  .refine(
    (v) => /^https?:\/\//.test(v) || v.startsWith("/api/uploads/covers/"),
    "coverImage must be an http(s) URL or an uploaded cover path",
  );

export const createBookSchema = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(300),
  genre: z.string().trim().max(120).optional(),
  coverImage: coverImage.optional(),
  year: z.number().int().min(0).max(2100).optional(),
  pageCount: z.number().int().min(1).max(50_000).optional(),
  format: formatEnum.optional(),
  status: statusEnum.optional(),
  openLibraryId: z.string().trim().max(120).optional(),
});

export const updateBookSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  author: z.string().trim().min(1).max(300).optional(),
  genre: z.string().trim().max(120).optional(),
  coverImage: coverImage.optional(),
  year: z.number().int().min(0).max(2100).optional(),
  pageCount: z.number().int().min(1).max(50_000).optional(),
  format: formatEnum.optional(),
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

/** For routes whose :id feeds a raw-SQL `::uuid` cast (see shares). */
export const bookIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
