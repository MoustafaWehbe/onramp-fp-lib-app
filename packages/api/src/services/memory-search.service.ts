import { getPrisma, generateEmbedding } from "@starter-kit/shared";

const prisma = getPrisma();

/** Below this cosine similarity a semantic hit is noise, not a memory. */
const MIN_SIMILARITY = 0.45;
const MAX_HITS = 5;
/** Characters of context on either side of a highlighted hit. */
const SNIPPET_RADIUS = 130;

/** The G19 hero counts: entries with text, and their total word count. */
export interface MemoryOverview {
  entryCount: number;
  wordCount: number;
}

/** One matched reflection, with a snippet split around the highlight span. */
export interface MemoryHit {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  coverImage: string | null;
  entryDate: Date;
  /** Snippet parts: `hit` is the highlighted span ("" when nothing lexical matched). */
  pre: string;
  hit: string;
  post: string;
  similarity: number | null;
}

/**
 * The search answer plus which capability produced it: "semantic" when the
 * embedding host answered, "exact" when it degraded to plain word matching —
 * the page renders the offline banner from this flag, never an error state.
 */
export interface MemorySearchResult {
  /** "semantic" when the embedding host answered; "exact" is the degraded mode. */
  mode: "semantic" | "exact";
  entryCount: number;
  hits: MemoryHit[];
}

/** Injectable embedding call, so tests can run without an Ollama host. */
export interface MemorySearchDeps {
  embed: (text: string) => Promise<number[]>;
}

const defaultDeps: MemorySearchDeps = { embed: generateEmbedding };

/** Design G19 hero: "34 entries, 21,400 words, none of it seen by anyone but you." */
export async function memoryOverview(userId: string): Promise<MemoryOverview> {
  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    select: { reflectionText: true },
  });
  const withText = entries.filter((e) => e.reflectionText.trim().length > 0);
  const wordCount = withText.reduce(
    (sum, e) => sum + e.reflectionText.trim().split(/\s+/).length,
    0,
  );
  return { entryCount: withText.length, wordCount };
}

interface EntryRow {
  bookId: string;
  reflectionText: string;
  updatedAt: Date;
  book: {
    title: string;
    author: string;
    coverImage: string | null;
  };
}

/**
 * Design G19 — Reading Memory: search the reader's own reflections, in their
 * own words. Matching is by meaning (query embedding vs the stored book
 * embeddings, whose source text is dominated by the reflection); when the
 * embedding host is down it degrades to plain word search over the same
 * entries rather than taking the page with it. Searches are not kept.
 */
export async function searchMemory(
  userId: string,
  query: string,
  deps: MemorySearchDeps = defaultDeps,
): Promise<MemorySearchResult> {
  const entries: EntryRow[] = await prisma.journalEntry.findMany({
    where: { userId, NOT: { reflectionText: "" } },
    select: {
      bookId: true,
      reflectionText: true,
      updatedAt: true,
      book: { select: { title: true, author: true, coverImage: true } },
    },
  });
  const entryByBook = new Map(entries.map((e) => [e.bookId, e]));

  if (entries.length === 0) {
    return { mode: "semantic", entryCount: 0, hits: [] };
  }

  let queryVec: number[] | null = null;
  try {
    queryVec = await deps.embed(query);
  } catch {
    // Meaning-search is offline — fall through to exact matching below.
  }

  if (queryVec) {
    const vectorLiteral = `[${queryVec.join(",")}]`;
    // Restrict the vector scan to books that actually have a journal entry
    // BEFORE the LIMIT — otherwise embedded-but-unreflected books consume
    // result slots and real matches past the cutoff are silently lost.
    const bookIds = entries.map((e) => e.bookId);
    const rows = await prisma.$queryRaw<
      { book_id: string; similarity: number }[]
    >`
      SELECT book_id, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM book_embeddings
      WHERE user_id = ${userId}::uuid AND embedding IS NOT NULL
        AND book_id = ANY(${bookIds}::uuid[])
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${MAX_HITS}
    `;

    const hits = rows
      .filter((r) => r.similarity >= MIN_SIMILARITY)
      .map((r) => {
        const entry = entryByBook.get(r.book_id);
        if (!entry) return null;
        return toHit(entry, query, r.similarity);
      })
      .filter((h): h is MemoryHit => h !== null);

    return { mode: "semantic", entryCount: entries.length, hits };
  }

  // Degraded mode: literal word matching, oldest wound still searchable.
  const terms = queryTerms(query);
  const hits = entries
    .filter((e) =>
      terms.some((t) => e.reflectionText.toLowerCase().includes(t)),
    )
    .slice(0, MAX_HITS)
    .map((e) => toHit(e, query, null));

  return { mode: "exact", entryCount: entries.length, hits };
}

/** Meaningful lowercase terms from the query (stop-short words dropped). */
function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 3);
}

/**
 * Build the snippet. Best case a query term appears verbatim and gets the
 * highlight; otherwise the sentence sharing the most words with the query
 * stands in, un-highlighted — the design's "matching is by meaning" case.
 */
function toHit(
  entry: EntryRow,
  query: string,
  similarity: number | null,
): MemoryHit {
  const text = entry.reflectionText.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const base = {
    bookId: entry.bookId,
    bookTitle: entry.book.title,
    bookAuthor: entry.book.author,
    coverImage: entry.book.coverImage,
    entryDate: entry.updatedAt,
    similarity,
  };

  for (const term of queryTerms(query)) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      const start = Math.max(0, idx - SNIPPET_RADIUS);
      const end = Math.min(text.length, idx + term.length + SNIPPET_RADIUS);
      return {
        ...base,
        pre: (start > 0 ? "…" : "") + text.slice(start, idx),
        hit: text.slice(idx, idx + term.length),
        post: text.slice(idx + term.length, end) + (end < text.length ? "…" : ""),
      };
    }
  }

  return { ...base, pre: bestSentence(text, query), hit: "", post: "" };
}

function bestSentence(text: string, query: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const qWords = new Set(queryTerms(query));
  let best = sentences[0] ?? text;
  let bestScore = -1;
  for (const s of sentences) {
    const words = s.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const score = words.filter((w) => qWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best.length > 2 * SNIPPET_RADIUS
    ? `${best.slice(0, 2 * SNIPPET_RADIUS)}…`
    : best;
}
