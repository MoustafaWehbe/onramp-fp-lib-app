import type { Readable } from "node:stream";
import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import {
  saveBookFileStream,
  deleteBookFileFromDisk,
  bookFileAbsolutePath,
} from "../lib/book-file-storage";
import { booksService } from "./books.service";

const prisma = getPrisma();

export type BookFileKind = "PDF" | "EPUB" | "AUDIO";

const KINDS: readonly BookFileKind[] = ["PDF", "EPUB", "AUDIO"] as const;

export function parseKind(raw: string): BookFileKind {
  const kind = raw.toUpperCase();
  if ((KINDS as readonly string[]).includes(kind)) return kind as BookFileKind;
  throw createError("File not found", 404);
}

/** The metadata shape safe to put in any owner-facing response. */
const FILE_SELECT = {
  kind: true,
  sizeBytes: true,
  mimeType: true,
  originalName: true,
  createdAt: true,
} as const;

export const bookFilesService = {
  /**
   * Stream an upload to disk, then upsert the row for its sniffed kind. A
   * second upload of the same kind replaces the first — row and bytes both;
   * the old file is unlinked only after the new row is in place, so a crash
   * between the two leaves a stale file, never a dangling row.
   */
  async upload(userId: string, bookId: string, body: Readable, name: string) {
    await booksService.getOwned(userId, bookId);
    const stored = await saveBookFileStream(body);

    const existing = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind: stored.kind } },
      select: { storagePath: true },
    });

    const row = await prisma.bookFile.upsert({
      where: { bookId_kind: { bookId, kind: stored.kind } },
      create: {
        bookId,
        userId,
        kind: stored.kind,
        storagePath: stored.storagePath,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        originalName: name,
      },
      update: {
        storagePath: stored.storagePath,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        originalName: name,
      },
      select: FILE_SELECT,
    });

    if (existing) await deleteBookFileFromDisk(existing.storagePath);
    return row;
  },

  /**
   * Resolve a file for serving. Owner-only, and deliberately through
   * getOwned's 404 — the repo's boundary answers "not found", never "exists
   * but you can't": a 403 would confirm the file is there.
   */
  async resolveForServing(userId: string, bookId: string, kind: BookFileKind) {
    await booksService.getOwned(userId, bookId);
    const file = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind } },
    });
    if (!file) throw createError("File not found", 404);
    return {
      absolutePath: bookFileAbsolutePath(file.storagePath),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      originalName: file.originalName,
    };
  },

  async remove(userId: string, bookId: string, kind: BookFileKind) {
    await booksService.getOwned(userId, bookId);
    const file = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind } },
      select: { id: true, storagePath: true },
    });
    if (!file) throw createError("File not found", 404);
    await prisma.bookFile.delete({ where: { id: file.id } });
    await deleteBookFileFromDisk(file.storagePath);
  },

  // ── Reading progress — private to its owner, same 404 boundary. ─────────

  async getProgress(userId: string, bookId: string) {
    await booksService.getOwned(userId, bookId);
    return prisma.readingProgress.findUnique({
      where: { bookId_userId: { bookId, userId } },
      select: { position: true, percent: true, updatedAt: true },
    });
  },

  async putProgress(
    userId: string,
    bookId: string,
    input: { position: string; percent: number },
  ) {
    await booksService.getOwned(userId, bookId);
    return prisma.readingProgress.upsert({
      where: { bookId_userId: { bookId, userId } },
      create: { bookId, userId, ...input },
      update: input,
      select: { position: true, percent: true, updatedAt: true },
    });
  },
};
