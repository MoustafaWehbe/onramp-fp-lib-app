import {
  getPrisma,
  generateEmbedding,
  chatCompletion,
  type ChatMessage,
} from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import { stripToJson } from "../lib/llm-json";
import { booksService } from "./books.service";

const prisma = getPrisma();

/** Design B7a: "Folio needs about five finished books before it can find echoes." */
const MIN_EMBEDDED = 5;
const TOP_K = 3;

const SYSTEM_PROMPT = `You are Folio's "books like this one" writer. You are given:
- TARGET: a book from the reader's own library (title, author, genre).
- MATCHES: up to ${TOP_K} other books from the SAME reader's library, each with a short excerpt of what the reader wrote about it.

Task: for each match, write ONE short sentence (under 20 words) on why it echoes the target — grounded in the reader's own excerpt, concrete and quiet, never salesy.

Output ONLY valid JSON, nothing else:
{"whys":[{"title":"<verbatim match title>","why":"<one sentence>"}]}`;

/** Injectable AI calls, so tests can run without an Ollama host. */
export interface SimilarBooksDeps {
  embed: (text: string) => Promise<number[]>;
  generate: (messages: ChatMessage[]) => Promise<string>;
}

const defaultDeps: SimilarBooksDeps = {
  embed: generateEmbedding,
  generate: (messages) => chatCompletion(messages),
};

/** One neighbour card: a book the reader owns, with a one-line "why". */
export interface SimilarBookItem {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  similarity: number;
  why: string;
}

/**
 * "ok" carries up to three neighbours; "thin" means fewer than `needed`
 * embedded books exist and the section should show the build-your-library
 * nudge instead. Engine-down is not a status — it surfaces as a 503.
 */
export interface SimilarBooksResult {
  status: "ok" | "thin";
  /** How many of the reader's books are embedded (finished + journaled). */
  embeddedCount: number;
  needed: number;
  items: SimilarBookItem[];
}

interface SimilarRow {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  cover_image: string | null;
  source_text: string;
  similarity: number;
}

/**
 * "Books like this one" (design B7a): nearest neighbours to a book, drawn ONLY
 * from the reader's own embedded library — nothing external, nothing invented.
 *
 * The query vector is the book's own stored embedding when it has one (finished
 * + journaled); otherwise the book's metadata is embedded on the fly, so the
 * section also works for a book the reader is still in the middle of.
 */
export async function findSimilarBooks(
  userId: string,
  bookId: string,
  deps: SimilarBooksDeps = defaultDeps,
): Promise<SimilarBooksResult> {
  const book = await booksService.getOwned(userId, bookId);

  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT count(*)::bigint AS count
    FROM book_embeddings
    WHERE user_id = ${userId}::uuid AND embedding IS NOT NULL
  `;
  const embeddedCount = Number(count);
  if (embeddedCount < MIN_EMBEDDED) {
    return { status: "thin", embeddedCount, needed: MIN_EMBEDDED, items: [] };
  }

  const queryVector = await resolveQueryVector(book, deps);
  const vectorLiteral = `[${queryVector.join(",")}]`;

  const rows = await prisma.$queryRaw<SimilarRow[]>`
    SELECT b.id, b.title, b.author, b.genre, b.cover_image, be.source_text,
           1 - (be.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM book_embeddings be
    JOIN books b ON b.id = be.book_id
    WHERE be.user_id = ${userId}::uuid
      AND be.book_id <> ${bookId}::uuid
      AND be.embedding IS NOT NULL
    ORDER BY be.embedding <=> ${vectorLiteral}::vector
    LIMIT ${TOP_K}
  `;

  const whys = await generateWhys(book, rows, deps.generate);

  return {
    status: "ok",
    embeddedCount,
    needed: MIN_EMBEDDED,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      genre: r.genre,
      coverImage: r.cover_image,
      similarity: r.similarity,
      why: whys.get(r.title.toLowerCase()) ?? fallbackWhy(book.genre, r.genre),
    })),
  };
}

interface TargetBook {
  title: string;
  author: string;
  genre: string | null;
}

async function resolveQueryVector(
  book: TargetBook & { id: string },
  deps: SimilarBooksDeps,
): Promise<number[]> {
  const rows = await prisma.$queryRaw<[{ embedding: string | null }] | []>`
    SELECT embedding::text AS embedding
    FROM book_embeddings
    WHERE book_id = ${book.id}::uuid
  `;
  const stored = rows[0]?.embedding;
  if (stored) return JSON.parse(stored) as number[];

  try {
    return await deps.embed(
      [book.title, book.author, book.genre]
        .filter((s): s is string => Boolean(s && s.trim()))
        .join("\n"),
    );
  } catch {
    // The embedding host is down — the design's "suggestion engine is offline".
    throw createError(
      "The suggestion engine is offline — try again later.",
      503,
    );
  }
}

/**
 * One generation call for all whys. Best-effort by design: if the model is slow,
 * offline, or returns junk, the section still renders with a quiet fallback
 * line — retrieval, not prose, is the load-bearing part of B7a.
 */
async function generateWhys(
  target: TargetBook,
  rows: SimilarRow[],
  generate: SimilarBooksDeps["generate"],
): Promise<Map<string, string>> {
  const whys = new Map<string, string>();
  if (rows.length === 0) return whys;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `TARGET: ${target.title} — ${target.author}` +
        (target.genre ? ` (${target.genre})` : "") +
        "\n\nMATCHES:\n" +
        rows
          .map(
            (r, i) =>
              `${i + 1}. ${r.title} — ${r.author}\n   Reader excerpt: "${excerpt(r.source_text)}"`,
          )
          .join("\n"),
    },
  ];

  try {
    const raw = await generate(messages);
    const parsed = JSON.parse(stripToJson(raw)) as {
      whys?: { title?: string; why?: string }[];
    };
    for (const w of parsed.whys ?? []) {
      if (w.title && w.why?.trim()) {
        whys.set(w.title.trim().toLowerCase(), w.why.trim());
      }
    }
  } catch {
    // fall through to fallbackWhy per item
  }
  return whys;
}

/** The last part of the embedded source text is the reflection — trim it hard. */
function excerpt(sourceText: string): string {
  const lines = sourceText.split("\n").filter((l) => l.trim().length > 0);
  const reflection = lines.slice(2).join(" ") || lines.join(" ");
  return reflection.length > 220 ? `${reflection.slice(0, 220)}…` : reflection;
}

function fallbackWhy(
  targetGenre: string | null,
  matchGenre: string | null,
): string {
  if (
    targetGenre &&
    matchGenre &&
    targetGenre.toLowerCase() === matchGenre.toLowerCase()
  ) {
    return `Close to this one in what you've written, and shelved under ${matchGenre} too.`;
  }
  return "Sits closest to this one in what you've read and written.";
}
