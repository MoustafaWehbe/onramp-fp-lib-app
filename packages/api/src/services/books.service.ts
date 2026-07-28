import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import type {
  CreateBookInput,
  UpdateBookInput,
  ListBooksQuery,
  JournalEntryInput,
} from "../schemas/books.schemas";

const prisma = getPrisma();

/** True for a Prisma unique-constraint violation (duplicate row). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function orderByFor(sort: ListBooksQuery["sort"]) {
  switch (sort) {
    case "title":
      return { title: "asc" as const };
    case "-title":
      return { title: "desc" as const };
    case "updatedAt":
      return { updatedAt: "asc" as const };
    case "-updatedAt":
      return { updatedAt: "desc" as const };
    case "createdAt":
      return { createdAt: "asc" as const };
    default:
      // default (and "-createdAt"): newest first
      return { createdAt: "desc" as const };
  }
}

export const booksService = {
  async list(userId: string, q: ListBooksQuery) {
    return prisma.book.findMany({
      where: {
        userId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.genre
          ? { genre: { equals: q.genre, mode: "insensitive" as const } }
          : {}),
        ...(q.author
          ? { author: { contains: q.author, mode: "insensitive" as const } }
          : {}),
        ...(q.q
          ? {
              OR: [
                { title: { contains: q.q, mode: "insensitive" as const } },
                { author: { contains: q.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: orderByFor(q.sort),
    });
  },

  async create(userId: string, input: CreateBookInput) {
    try {
      return await prisma.book.create({ data: { ...input, userId } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createError("This book is already in your library", 409);
      }
      throw err;
    }
  },

  /** Fetch a book the user owns, or throw 404 (never leak another user's book). */
  async getOwned(userId: string, id: string) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book || book.userId !== userId) {
      throw createError("Book not found", 404);
    }
    return book;
  },

  async update(userId: string, id: string, input: UpdateBookInput) {
    await this.getOwned(userId, id);
    try {
      return await prisma.book.update({ where: { id }, data: input });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createError("This book is already in your library", 409);
      }
      throw err;
    }
  },

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await prisma.book.delete({ where: { id } });
  },

  async getJournal(userId: string, bookId: string) {
    await this.getOwned(userId, bookId);
    return prisma.journalEntry.findUnique({ where: { bookId } });
  },

  async upsertJournal(userId: string, bookId: string, input: JournalEntryInput) {
    const book = await this.getOwned(userId, bookId);
    if (book.status !== "FINISHED") {
      throw createError(
        "A journal entry can only be saved once the book is marked FINISHED",
        409,
      );
    }

    const quotes = input.favoriteQuotes ?? [];
    return prisma.journalEntry.upsert({
      where: { bookId },
      create: {
        bookId,
        userId,
        reflectionText: input.reflectionText,
        favoriteQuotes: quotes,
        rating: input.rating ?? null,
      },
      update: {
        reflectionText: input.reflectionText,
        favoriteQuotes: { set: quotes },
        rating: input.rating ?? null,
      },
    });
  },
};
