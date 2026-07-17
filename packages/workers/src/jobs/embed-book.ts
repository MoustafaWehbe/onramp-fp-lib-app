import { getPrisma } from "@starter-kit/shared";
import { generateEmbedding } from "../lib/ai";

export interface EmbedBookResult {
  bookId: string;
  dimensions: number;
  /** Set (with a reason) when no embedding was written. */
  skipped?: string;
}

/**
 * Embed a finished book's content and upsert its `BookEmbedding` row.
 *
 * A book is embedded only when it is FINISHED and has a saved journal entry —
 * that's the signal the reader has reflected enough for the book to represent
 * their taste. The `embed` function is injectable so tests can supply a
 * deterministic vector; production uses nomic-embed-text via Ollama.
 *
 * The pgvector column is written with raw SQL because Prisma models it as an
 * `Unsupported` type, which the typed client cannot write.
 */
export async function embedBook(
  bookId: string,
  embed: (text: string) => Promise<number[]> = generateEmbedding,
): Promise<EmbedBookResult> {
  const prisma = getPrisma();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { journalEntry: true },
  });

  if (!book) return { bookId, dimensions: 0, skipped: "book not found" };
  if (book.status !== "FINISHED") {
    return { bookId, dimensions: 0, skipped: `status is ${book.status}, not FINISHED` };
  }
  if (!book.journalEntry) {
    return { bookId, dimensions: 0, skipped: "no journal entry" };
  }

  const sourceText = buildSourceText({
    genre: book.genre,
    author: book.author,
    reflectionText: book.journalEntry.reflectionText,
    favoriteQuotes: book.journalEntry.favoriteQuotes,
  });

  const embedding = await embed(sourceText);
  const vectorLiteral = `[${embedding.join(",")}]`;

  await prisma.$executeRaw`
    INSERT INTO book_embeddings (book_id, user_id, source_text, embedding, created_at, updated_at)
    VALUES (${bookId}::uuid, ${book.userId}::uuid, ${sourceText}, ${vectorLiteral}::vector, now(), now())
    ON CONFLICT (book_id) DO UPDATE
      SET source_text = EXCLUDED.source_text,
          embedding   = EXCLUDED.embedding,
          updated_at  = now();
  `;

  return { bookId, dimensions: embedding.length };
}

/** genre + author + reflection + favorite quotes, one per line, blanks dropped. */
function buildSourceText(input: {
  genre: string | null;
  author: string;
  reflectionText: string;
  favoriteQuotes: string[];
}): string {
  return [input.genre, input.author, input.reflectionText, ...input.favoriteQuotes]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join("\n");
}
