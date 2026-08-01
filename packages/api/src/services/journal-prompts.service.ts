import { chatCompletion, type ChatMessage } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import { stripToJson } from "../lib/llm-json";
import { booksService } from "./books.service";

const PROMPT_COUNT = 3;

const SYSTEM_PROMPT = `You write opening prompts for a private reading journal. You are given one book (title, author, genre) the reader has just finished.

Task: write EXACTLY ${PROMPT_COUNT} short prompts (each under 14 words) that could open a personal reflection on this book. Quiet, specific, second person. Vary the angle: one about what lingers, one about the book itself, one about who it's for. Never generic ("What did you think?"), never spoil a plot you can't know.

Output ONLY valid JSON, nothing else:
{"prompts":["...","...","..."]}`;

export interface JournalPromptsDeps {
  generate: (messages: ChatMessage[]) => Promise<string>;
}

const defaultDeps: JournalPromptsDeps = {
  generate: (messages) => chatCompletion(messages),
};

/**
 * Design B8a — AI opening prompts for a blank reflection. Nothing is persisted
 * and nothing about the reader's journal is sent: the model sees only the
 * book's own metadata. Dismissal is remembered client-side, so the server keeps
 * no record of it ("Nothing is logged about why").
 */
export async function generateJournalPrompts(
  userId: string,
  bookId: string,
  deps: JournalPromptsDeps = defaultDeps,
): Promise<string[]> {
  const book = await booksService.getOwned(userId, bookId);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `BOOK: ${book.title} — ${book.author}` +
        (book.genre ? `\nGENRE: ${book.genre}` : ""),
    },
  ];

  let raw: string;
  try {
    raw = await deps.generate(messages);
  } catch {
    throw createError("Prompts aren't available right now.", 503);
  }

  const prompts = parsePrompts(raw);
  if (prompts.length === 0) {
    throw createError("Prompts aren't available right now.", 502);
  }
  return prompts.slice(0, PROMPT_COUNT);
}

function parsePrompts(raw: string): string[] {
  try {
    const parsed = JSON.parse(stripToJson(raw)) as { prompts?: unknown };
    if (!Array.isArray(parsed.prompts)) return [];
    return parsed.prompts
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim());
  } catch {
    return [];
  }
}
