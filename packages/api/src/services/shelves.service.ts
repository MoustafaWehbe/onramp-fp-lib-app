import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import type {
  CreateShelfInput,
  UpdateShelfInput,
} from "../schemas/shelves.schemas";

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

/** Shelf membership rows joined to their book + who put it there. */
const membership = {
  include: { book: true, addedBy: { select: { id: true, name: true } } },
  orderBy: { addedAt: "desc" },
} as const;

/** Flatten BookOnShelf rows back to books, carrying the attribution along. */
function flattenBooks(
  rows: {
    addedAt: Date;
    addedBy: { id: string; name: string };
    book: Record<string, unknown>;
  }[],
) {
  return rows.map((row) => ({
    ...row.book,
    addedBy: row.addedBy,
    addedAt: row.addedAt,
  }));
}

export const shelvesService = {
  async list(userId: string) {
    // _count powers the shelf list's "5 books · 1 shared" line (design C9)
    // without shipping every book on every shelf.
    return prisma.shelf.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { books: true, shares: true } } },
    });
  },

  async create(userId: string, input: CreateShelfInput) {
    try {
      return await prisma.shelf.create({
        data: { userId, name: input.name, description: input.description },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createError("You already have a shelf with that name", 409);
      }
      throw err;
    }
  },

  /** A shelf the user owns, with its books. 404 if missing or not theirs. */
  async getOwned(userId: string, id: string) {
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      include: { books: membership },
    });
    if (!shelf || shelf.userId !== userId) {
      throw createError("Shelf not found", 404);
    }
    const { books, ...rest } = shelf;
    return { ...rest, books: flattenBooks(books) };
  },

  async update(userId: string, id: string, input: UpdateShelfInput) {
    await this.ensureOwned(userId, id);
    try {
      return await prisma.shelf.update({
        where: { id },
        data: { name: input.name, description: input.description },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createError("You already have a shelf with that name", 409);
      }
      throw err;
    }
  },

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await prisma.shelf.delete({ where: { id } });
  },

  async addBook(userId: string, shelfId: string, bookId: string) {
    await this.ensureOwned(userId, shelfId);
    // The book must belong to the same user — you can't shelve someone else's book.
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.userId !== userId) {
      throw createError("Book not found", 404);
    }
    // Idempotent: re-adding a book already on the shelf is a no-op.
    await prisma.bookOnShelf.upsert({
      where: { shelfId_bookId: { shelfId, bookId } },
      create: { shelfId, bookId, addedById: userId },
      update: {},
    });
    return this.getOwned(userId, shelfId);
  },

  async removeBook(userId: string, shelfId: string, bookId: string) {
    await this.ensureOwned(userId, shelfId);
    // Idempotent: removing a book that isn't on the shelf is a no-op.
    await prisma.bookOnShelf.deleteMany({ where: { shelfId, bookId } });
  },

  /** Throws 404 unless the shelf exists and belongs to the user. */
  async ensureOwned(userId: string, id: string) {
    const shelf = await prisma.shelf.findUnique({ where: { id } });
    if (!shelf || shelf.userId !== userId) {
      throw createError("Shelf not found", 404);
    }
  },
};
