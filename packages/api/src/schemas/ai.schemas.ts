import { z } from "zod";

/** Design D16 — the mood is used for one build and never stored. */
export const moodShelfSchema = z.object({
  mood: z.string().trim().min(1).max(200),
  /** "Build one anyway" past the thin-taste warning. */
  force: z.boolean().optional(),
});

/** Design G19 — the search text is embedded, matched, and forgotten. */
export const memorySearchSchema = z.object({
  query: z.string().trim().min(1).max(300),
});

/** Validated ahead of the service so a malformed id is a 422, not a 500. */
export const bookIdParamSchema = z.object({ bookId: z.string().uuid() });

export type MoodShelfInput = z.infer<typeof moodShelfSchema>;
export type MemorySearchInput = z.infer<typeof memorySearchSchema>;
