import { z } from "zod";

export const inviteShareSchema = z.object({
  email: z.string().trim().email(),
  accessLevel: z.enum(["VIEW", "WRITE"]).default("VIEW"),
});

export type InviteShareInput = z.infer<typeof inviteShareSchema>;

export const addSharedBookSchema = z.object({
  bookId: z.string().uuid(),
});

export type AddSharedBookInput = z.infer<typeof addSharedBookSchema>;

/** Design E18 — share one book with one named person, by exact address. */
export const shareBookSchema = z.object({
  email: z.string().trim().email(),
});

export type ShareBookInput = z.infer<typeof shareBookSchema>;

/** Route params feeding `::uuid` casts must be validated first, or a
 *  malformed id becomes a Postgres cast error surfacing as a 500. */
export const shareIdParamSchema = z.object({ shareId: z.string().uuid() });
