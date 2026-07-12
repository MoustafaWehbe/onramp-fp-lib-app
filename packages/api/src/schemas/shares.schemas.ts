import { z } from "zod";

export const inviteShareSchema = z.object({
  email: z.string().trim().email(),
  accessLevel: z.enum(["VIEW", "WRITE"]).default("VIEW"),
});

export type InviteShareInput = z.infer<typeof inviteShareSchema>;
