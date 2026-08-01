import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import { booksService } from "./books.service";

const prisma = getPrisma();

// NOTE: book_shares is queried with raw SQL rather than the typed client so
// this feature doesn't require a Prisma client regeneration to compile (the
// generated client is shared with any running dev server on Windows). The
// model + migration live in packages/shared/prisma as usual.

/**
 * Design E18: exactly what lands in the recipient's account — catalogue
 * metadata and the sender's name. The owner's rating, reflection, dates, and
 * lifecycle are never selected here, so no code path can widen the share.
 */
export interface SharedBookView {
  shareId: string;
  sharedAt: Date;
  sender: { id: string; name: string };
  book: {
    id: string;
    title: string;
    author: string;
    genre: string | null;
    coverImage: string | null;
    year: number | null;
    pageCount: number | null;
  };
}

export interface SentShareView {
  shareId: string;
  sharedAt: Date;
  recipient: { id: string; name: string; email: string };
  book: {
    id: string;
    title: string;
    author: string;
    coverImage: string | null;
  };
}

export const bookSharesService = {
  /**
   * Share one owned book with one named, existing reader. No link, no public
   * page: the recipient must already have an account, found by exact email.
   */
  async share(ownerId: string, bookId: string, email: string) {
    await booksService.getOwned(ownerId, bookId);

    const recipient = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true },
    });
    if (!recipient) {
      throw createError(
        "No reader with that address — they need a Folio account first.",
        404,
      );
    }
    if (recipient.id === ownerId) {
      throw createError("That's you — the book is already yours.", 400);
    }

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM book_shares
      WHERE book_id = ${bookId}::uuid AND recipient_id = ${recipient.id}::uuid
    `;
    if (existing.length > 0) {
      throw createError("You've already sent them this book.", 409);
    }

    const [row] = await prisma.$queryRaw<{ id: string; created_at: Date }[]>`
      INSERT INTO book_shares (book_id, sender_id, recipient_id)
      VALUES (${bookId}::uuid, ${ownerId}::uuid, ${recipient.id}::uuid)
      RETURNING id, created_at
    `;

    return {
      shareId: row!.id,
      sharedAt: row!.created_at,
      recipient,
    };
  },

  /** OWNER: who has this book (powers "who has it" + Take it back). */
  async listForBook(ownerId: string, bookId: string) {
    await booksService.getOwned(ownerId, bookId);
    const rows = await prisma.$queryRaw<
      { id: string; created_at: Date; rid: string; rname: string; remail: string }[]
    >`
      SELECT bs.id, bs.created_at, u.id AS rid, u.name AS rname, u.email AS remail
      FROM book_shares bs
      JOIN users u ON u.id = bs.recipient_id
      WHERE bs.book_id = ${bookId}::uuid AND bs.sender_id = ${ownerId}::uuid
      ORDER BY bs.created_at DESC
    `;
    return rows.map((r) => ({
      shareId: r.id,
      sharedAt: r.created_at,
      recipient: { id: r.rid, name: r.rname, email: r.remail },
    }));
  },

  /** OWNER: everything they've sent, newest first (the "Shared books" list). */
  async listSent(ownerId: string): Promise<SentShareView[]> {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        created_at: Date;
        rid: string;
        rname: string;
        remail: string;
        bid: string;
        title: string;
        author: string;
        cover_image: string | null;
      }[]
    >`
      SELECT bs.id, bs.created_at,
             u.id AS rid, u.name AS rname, u.email AS remail,
             b.id AS bid, b.title, b.author, b.cover_image
      FROM book_shares bs
      JOIN users u ON u.id = bs.recipient_id
      JOIN books b ON b.id = bs.book_id
      WHERE bs.sender_id = ${ownerId}::uuid
      ORDER BY bs.created_at DESC
    `;
    return rows.map((r) => ({
      shareId: r.id,
      sharedAt: r.created_at,
      recipient: { id: r.rid, name: r.rname, email: r.remail },
      book: {
        id: r.bid,
        title: r.title,
        author: r.author,
        coverImage: r.cover_image,
      },
    }));
  },

  /**
   * RECIPIENT: books shared with them — the metadata-only projection. The
   * SELECT list is the privacy boundary: no status, no journal join, ever.
   */
  async listReceived(userId: string): Promise<SharedBookView[]> {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        created_at: Date;
        sid: string;
        sname: string;
        bid: string;
        title: string;
        author: string;
        genre: string | null;
        cover_image: string | null;
        year: number | null;
        page_count: number | null;
      }[]
    >`
      SELECT bs.id, bs.created_at,
             u.id AS sid, u.name AS sname,
             b.id AS bid, b.title, b.author, b.genre, b.cover_image,
             b.year, b.page_count
      FROM book_shares bs
      JOIN users u ON u.id = bs.sender_id
      JOIN books b ON b.id = bs.book_id
      WHERE bs.recipient_id = ${userId}::uuid
      ORDER BY bs.created_at DESC
    `;
    return rows.map((r) => ({
      shareId: r.id,
      sharedAt: r.created_at,
      sender: { id: r.sid, name: r.sname },
      book: {
        id: r.bid,
        title: r.title,
        author: r.author,
        genre: r.genre,
        coverImage: r.cover_image,
        year: r.year,
        pageCount: r.page_count,
      },
    }));
  },

  /** SENDER: take it back. Deleting is silent for the recipient — by design. */
  async revoke(ownerId: string, shareId: string) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM book_shares
      WHERE id = ${shareId}::uuid AND sender_id = ${ownerId}::uuid
    `;
    if (deleted === 0) {
      throw createError("Share not found", 404);
    }
  },
};
