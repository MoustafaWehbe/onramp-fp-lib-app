import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import type { InviteShareInput } from "../schemas/shares.schemas";

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

/** The invitee/user summary safe to expose in share responses. */
const userSummary = { select: { id: true, email: true, name: true } };

/** Throws 404 unless the shelf exists and belongs to the user. */
async function ensureShelfOwned(userId: string, shelfId: string) {
  const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
  if (!shelf || shelf.userId !== userId) {
    throw createError("Shelf not found", 404);
  }
  return shelf;
}

export const sharesService = {
  /** OWNER: every share on a shelf they own. */
  async listForShelf(ownerId: string, shelfId: string) {
    await ensureShelfOwned(ownerId, shelfId);
    return prisma.shelfShare.findMany({
      where: { shelfId },
      include: { user: userSummary },
      orderBy: { createdAt: "desc" },
    });
  },

  /** OWNER: invite an existing user (by email) to a shelf they own. */
  async invite(ownerId: string, shelfId: string, input: InviteShareInput) {
    await ensureShelfOwned(ownerId, shelfId);

    // Sharing is with existing accounts only (per ARCHITECTURE.md + review).
    const invitee = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!invitee) {
      throw createError("No user with that email address", 404);
    }
    if (invitee.id === ownerId) {
      throw createError("You can't share a shelf with yourself", 400);
    }

    try {
      return await prisma.shelfShare.create({
        data: {
          shelfId,
          userId: invitee.id,
          accessLevel: input.accessLevel,
          status: "PENDING",
        },
        include: { user: userSummary },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createError("That user is already invited to this shelf", 409);
      }
      throw err;
    }
  },

  /** OWNER: revoke a user's access to a shelf they own. */
  async revoke(ownerId: string, shelfId: string, targetUserId: string) {
    await ensureShelfOwned(ownerId, shelfId);
    const share = await prisma.shelfShare.findUnique({
      where: { shelfId_userId: { shelfId, userId: targetUserId } },
    });
    if (!share) {
      throw createError("Share not found", 404);
    }
    await prisma.shelfShare.delete({ where: { id: share.id } });
  },

  /** INVITEE: accept or decline their own pending invite for a shelf. */
  async respond(inviteeId: string, shelfId: string, accept: boolean) {
    const share = await prisma.shelfShare.findUnique({
      where: { shelfId_userId: { shelfId, userId: inviteeId } },
    });
    if (!share) {
      throw createError("Invite not found", 404);
    }
    if (share.status !== "PENDING") {
      throw createError("This invite has already been answered", 409);
    }
    return prisma.shelfShare.update({
      where: { id: share.id },
      data: { status: accept ? "ACCEPTED" : "DECLINED" },
    });
  },

  /**
   * OWNER (outgoing): the collaborators across the shelves this user owns —
   * "people I share shelves with" (ARCHITECTURE.md §2 Contributors).
   */
  async contributors(ownerId: string) {
    const shares = await prisma.shelfShare.findMany({
      where: { shelf: { userId: ownerId } },
      include: { user: userSummary, shelf: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return shares.map((s) => ({
      shelfId: s.shelfId,
      shelfName: s.shelf.name,
      accessLevel: s.accessLevel,
      status: s.status,
      user: s.user,
    }));
  },

  /**
   * INVITEE (incoming): shelves shared *with* this user that they've accepted.
   *
   * ISOLATION BOUNDARY: this returns the shelf and its books' metadata only.
   * A contributor must never see the owner's journal entries, ratings, or
   * reading metrics, so the book projection below is deliberately limited to
   * scalar catalogue fields — journalEntry is never loaded or returned.
   */
  async sharedWithMe(userId: string) {
    const shares = await prisma.shelfShare.findMany({
      where: { userId, status: "ACCEPTED" },
      include: {
        shelf: {
          include: {
            user: { select: { id: true, name: true } },
            books: { orderBy: { createdAt: "desc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return shares.map((s) => ({
      shelfId: s.shelfId,
      name: s.shelf.name,
      accessLevel: s.accessLevel,
      owner: { id: s.shelf.user.id, name: s.shelf.user.name },
      books: s.shelf.books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        genre: b.genre,
        coverImage: b.coverImage,
        status: b.status,
      })),
    }));
  },
};
