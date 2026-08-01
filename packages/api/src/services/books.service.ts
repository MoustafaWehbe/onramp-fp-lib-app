import { getPrisma, embeddingsQueue } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import type {
  CreateBookInput,
  UpdateBookInput,
  ListBooksQuery,
  JournalEntryInput,
} from "../schemas/books.schemas";

const prisma = getPrisma();

/**
 * Queue a re-embed of a finished, journaled book (the worker re-checks both
 * conditions before writing). Enqueueing is best-effort: the reader's write
 * must not fail because Redis is briefly unreachable — the embedding can be
 * rebuilt on the next journal save or taste-profile refresh.
 */
async function enqueueBookEmbedding(bookId: string): Promise<void> {
  try {
    await embeddingsQueue.add("embed-book", {
      entityType: "book",
      entityId: bookId,
    });
  } catch (err) {
    console.error(
      `[books] failed to enqueue embedding for book:${bookId}`,
      err instanceof Error ? err.message : err,
    );
  }
}

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
    const before = await this.getOwned(userId, id);
    try {
      const book = await prisma.book.update({
        where: { id },
        data: input,
        include: { journalEntry: { select: { id: true } } },
      });
      // Re-finish path: a book moved back to FINISHED that already has a
      // journal entry should refresh its embedding (title/genre may also have
      // changed, and those feed the embedded text).
      if (
        book.status === "FINISHED" &&
        before.status !== "FINISHED" &&
        book.journalEntry
      ) {
        await enqueueBookEmbedding(book.id);
      }
      const { journalEntry: _journalEntry, ...rest } = book;
      return rest;
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
    const entry = await prisma.journalEntry.upsert({
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

    // The reflection is the heart of the embedded text, so every journal save
    // (re)queues the book's embedding. This is THE trigger that feeds the AI
    // pipeline: finished + journaled -> BookEmbedding -> taste profile.
    await enqueueBookEmbedding(bookId);

    return entry;
  },
};
