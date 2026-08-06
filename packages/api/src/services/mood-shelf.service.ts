import {
  getPrisma,
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  chatCompletion,
  type ChatMessage,
} from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import { stripToJson } from "../lib/llm-json";

const prisma = getPrisma();

/** Design D16: mood shelves read ratings and reflections — below this they're thin. */
const MIN_EMBEDDED = 5;
/** How many ranked candidates the model chooses from, and how many it keeps. */
const CANDIDATE_POOL = 10;
const SHELF_SIZE = 5;
/** Cap on metadata-only books embedded on the fly (one batched call). */
const MAX_UNEMBEDDED = 60;

const SYSTEM_PROMPT = `You build a small themed shelf from a reader's OWN library. You are given:
- MOOD: what the reader is in the mood for, in their own words.
- CANDIDATES: a numbered list of books from their library (title, author, genre, lifecycle), ranked closest-to-mood first, some with a short excerpt of what the reader wrote.

Task: pick the ${SHELF_SIZE} candidates that best fit the mood, name the shelf, and write one short "why" line (under 15 words) per pick — concrete and quiet, grounded in the excerpt or metadata, never salesy.

Hard rules:
- Choose ONLY from CANDIDATES; copy each title VERBATIM. Pick exactly ${SHELF_SIZE} (or every candidate if fewer).
- The shelf name is 2-5 words, sentence case, echoing the mood (e.g. "For a rainy weekend").
- Output ONLY valid JSON, nothing else:
{"title":"<shelf name>","picks":[{"title":"<verbatim>","why":"<one line>"}]}`;

/** Injectable AI calls, so tests can run without an Ollama host. */
export interface MoodShelfDeps {
  embed: (text: string) => Promise<number[]>;
  embedMany: (texts: string[]) => Promise<number[][]>;
  generate: (messages: ChatMessage[]) => Promise<string>;
}

const defaultDeps: MoodShelfDeps = {
  embed: generateEmbedding,
  embedMany: generateEmbeddings,
  generate: (messages) => chatCompletion(messages),
};

/** One pick on a built (not yet kept) shelf, with its grounded why-line. */
export interface MoodShelfItem {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  status: string;
  similarity: number;
  why: string;
}

/**
 * "thin" = too few embedded books to read a taste from (the caller may
 * retry with force). "ok" = a named shelf of picks. Model misbehaviour
 * degrades to the retrieval ranking rather than an error; only an
 * unreachable Ollama host throws (503).
 */
export type MoodShelfResult =
  | { status: "thin"; embeddedCount: number; needed: number }
  | { status: "ok"; title: string; items: MoodShelfItem[] };

interface EmbeddedRow {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  cover_image: string | null;
  status: string;
  source_text: string;
  embedding: string;
}

interface CandidateBook {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  status: string;
  excerpt: string | null;
  similarity: number;
}

/**
 * Design D16 — a sentence in, a themed shelf out. Candidates come ONLY from
 * the reader's own library: embedded (finished + journaled) books are ranked by
 * their stored vectors, everything else by a single batched metadata embedding.
 * The mood text itself is never persisted — the shelf is returned, not saved,
 * until the reader chooses "Keep as a shelf" (which goes through the ordinary
 * shelves endpoints).
 */
export async function buildMoodShelf(
  userId: string,
  mood: string,
  opts: { force?: boolean } = {},
  deps: MoodShelfDeps = defaultDeps,
): Promise<MoodShelfResult> {
  const embeddedRows = await prisma.$queryRaw<EmbeddedRow[]>`
    SELECT b.id, b.title, b.author, b.genre, b.cover_image, b.status,
           be.source_text, be.embedding::text AS embedding
    FROM book_embeddings be
    JOIN books b ON b.id = be.book_id
    WHERE be.user_id = ${userId}::uuid AND be.embedding IS NOT NULL
  `;

  if (embeddedRows.length < MIN_EMBEDDED && !opts.force) {
    return {
      status: "thin",
      embeddedCount: embeddedRows.length,
      needed: MIN_EMBEDDED,
    };
  }

  let moodVec: number[];
  try {
    moodVec = await deps.embed(mood);
  } catch {
    throw createError("The shelf-builder is asleep — try again later.", 503);
  }

  const candidates: CandidateBook[] = embeddedRows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    genre: r.genre,
    coverImage: r.cover_image,
    status: r.status,
    excerpt: reflectionExcerpt(r.source_text),
    similarity: cosineSimilarity(JSON.parse(r.embedding) as number[], moodVec),
  }));

  // Books without an embedding (saved-but-never-started, abandoned, mid-read)
  // still belong on a mood shelf — the design's result mixes both. One batched
  // metadata embedding keeps this a single round trip; if it fails, the shelf
  // is built from the embedded books alone rather than failing outright.
  const embeddedIds = new Set(candidates.map((c) => c.id));
  const rest = (
    await prisma.book.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        author: true,
        genre: true,
        coverImage: true,
        status: true,
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_UNEMBEDDED + MIN_EMBEDDED,
    })
  ).filter((b) => !embeddedIds.has(b.id));
  try {
    const vectors = await deps.embedMany(
      rest.map((b) =>
        [b.title, b.author, b.genre].filter(Boolean).join("\n"),
      ),
    );
    rest.forEach((b, i) => {
      candidates.push({
        ...b,
        excerpt: null,
        similarity: cosineSimilarity(vectors[i]!, moodVec),
      });
    });
  } catch {
    // metadata batch failed — proceed with embedded books only
  }

  if (candidates.length === 0) {
    return { status: "thin", embeddedCount: 0, needed: MIN_EMBEDDED };
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  const pool = candidates.slice(0, CANDIDATE_POOL);

  const { title, picks } = await pickShelf(mood, pool, deps.generate);
  return { status: "ok", title, items: picks };
}

async function pickShelf(
  mood: string,
  pool: CandidateBook[],
  generate: MoodShelfDeps["generate"],
): Promise<{ title: string; picks: MoodShelfItem[] }> {
  const byTitle = new Map(pool.map((c) => [c.title.trim().toLowerCase(), c]));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `MOOD: ${mood}\n\nCANDIDATES:\n` +
        pool
          .map(
            (c, i) =>
              `${i + 1}. ${c.title} — ${c.author}` +
              (c.genre ? ` (${c.genre})` : "") +
              ` [${c.status}]` +
              (c.excerpt ? `\n   Reader excerpt: "${c.excerpt}"` : ""),
          )
          .join("\n"),
    },
  ];

  let raw: string;
  try {
    raw = await generate(messages);
  } catch {
    throw createError("The shelf-builder is asleep — try again later.", 503);
  }

  const parsed = parseShelf(raw);
  const picks = (parsed?.picks ?? [])
    .map((p) => byTitle.get((p.title ?? "").trim().toLowerCase()))
    .filter((c): c is CandidateBook => Boolean(c));

  // Verbatim check with graceful degrade: the retrieval ranking is already a
  // defensible shelf, so unmatched/malformed model output falls back to the
  // top of the pool rather than erroring the whole build.
  const seen = new Set(picks.map((c) => c.id));
  for (const c of pool) {
    if (picks.length >= SHELF_SIZE) break;
    if (!seen.has(c.id)) picks.push(c);
  }

  const whyByTitle = new Map(
    (parsed?.picks ?? [])
      .filter((p) => p.title && p.why?.trim())
      .map((p) => [p.title!.trim().toLowerCase(), p.why!.trim()]),
  );

  return {
    title: parsed?.title?.trim() || `For ${mood.trim()}`,
    picks: picks.slice(0, SHELF_SIZE).map((c) => ({
      id: c.id,
      title: c.title,
      author: c.author,
      genre: c.genre,
      coverImage: c.coverImage,
      status: c.status,
      similarity: c.similarity,
      why:
        whyByTitle.get(c.title.trim().toLowerCase()) ??
        "Close to the mood in what you've read and written.",
    })),
  };
}

function parseShelf(
  raw: string,
): { title?: string; picks?: { title?: string; why?: string }[] } | null {
  try {
    return JSON.parse(stripToJson(raw)) as {
      title?: string;
      picks?: { title?: string; why?: string }[];
    };
  } catch {
    return null;
  }
}

/** The reflection part of the embedded source text, trimmed hard. */
function reflectionExcerpt(sourceText: string): string | null {
  const lines = sourceText.split("\n").filter((l) => l.trim().length > 0);
  const reflection = lines.slice(2).join(" ");
  if (!reflection) return null;
  return reflection.length > 160 ? `${reflection.slice(0, 160)}…` : reflection;
}
