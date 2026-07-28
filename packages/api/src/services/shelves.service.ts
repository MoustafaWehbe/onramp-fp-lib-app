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

export const shelvesService = {
  async list(userId: string) {
    return prisma.shelf.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(userId: string, input: CreateShelfInput) {
    try {
      return await prisma.shelf.create({
        data: { userId, name: input.name },
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
      include: { books: { orderBy: { createdAt: "desc" } } },
    });
    if (!shelf || shelf.userId !== userId) {
      throw createError("Shelf not found", 404);
    }
    return shelf;
  },

  async update(userId: string, id: string, input: UpdateShelfInput) {
    await this.ensureOwned(userId, id);
    try {
      return await prisma.shelf.update({
        where: { id },
        data: { name: input.name },
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
    await prisma.shelf.update({
      where: { id: shelfId },
      data: { books: { connect: { id: bookId } } },
    });
    return this.getOwned(userId, shelfId);
  },

  async removeBook(userId: string, shelfId: string, bookId: string) {
    await this.ensureOwned(userId, shelfId);
    // Idempotent: disconnecting a book that isn't on the shelf is a no-op.
    await prisma.shelf.update({
      where: { id: shelfId },
      data: { books: { disconnect: { id: bookId } } },
    });
  },

  /** Throws 404 unless the shelf exists and belongs to the user. */
  async ensureOwned(userId: string, id: string) {
    const shelf = await prisma.shelf.findUnique({ where: { id } });
    if (!shelf || shelf.userId !== userId) {
      throw createError("Shelf not found", 404);
    }
  },
};
