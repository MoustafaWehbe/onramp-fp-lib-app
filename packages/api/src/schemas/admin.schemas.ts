import { z } from "zod";

export const updateUserSchema = z
  .object({
    role: z.enum(["user", "admin"]).optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.emailVerified !== undefined, {
    message: "Provide role and/or emailVerified",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
