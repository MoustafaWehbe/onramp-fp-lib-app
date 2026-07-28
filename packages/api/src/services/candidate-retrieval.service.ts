import {
  getPrisma,
  generateEmbedding,
  cosineSimilarity,
} from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import { fetchSubjectWorks, type OpenLibraryWork } from "../lib/open-library";

export type { OpenLibraryWork } from "../lib/open-library";

const prisma = getPrisma();

const MAX_SUBJECTS = 3;
const TOP_K = 5;

export interface Candidate {
  title: string;
  author: string;
  openLibraryId: string | null;
  coverUrl: string | null;
  firstPublishYear: number | null;
  similarity: number;
}

export interface RetrievalDeps {
  fetchSubjectWorks: (subject: string) => Promise<OpenLibraryWork[]>;
  embed: (text: string) => Promise<number[]>;
}

const defaultDeps: RetrievalDeps = {
  fetchSubjectWorks,
  embed: generateEmbedding,
};

interface ProfileRow {
  embedding: string | null;
  aggregated_data: { topGenres?: { genre: string; count: number }[] } | null;
}

interface OwnedBook {
  openLibraryId: string | null;
  title: string;
  author: string;
}

interface CandidateSource {
  title: string;
  author: string;
  openLibraryId: string | null;
  coverUrl: string | null;
  firstPublishYear: number | null;
  subjects: string[];
}

/**
 * Retrieve real book candidates for discovery: pull works from the Open Library
 * Subjects API for the reader's top genres, drop anything already in their
 * library, embed each candidate on the fly, and return the top 5 ranked by
 * cosine similarity to their TasteProfile embedding (blended toward the mood
 * modifier when present). Nothing is invented and nothing is persisted.
 *
 * Throws 422 when the taste profile has no embedding yet (mirrors the
 * missing-prerequisite handling in taste-profile refresh).
 */
export async function retrieveCandidates(
  userId: string,
  opts: { moodModifier?: string } = {},
  deps: RetrievalDeps = defaultDeps,
): Promise<Candidate[]> {
  const rows = await prisma.$queryRaw<ProfileRow[]>`
    SELECT embedding::text AS embedding, aggregated_data
    FROM taste_profiles
    WHERE user_id = ${userId}::uuid
  `;
  const profile = rows[0];
  if (!profile || !profile.embedding) {
    throw createError(
      "No taste profile yet — refresh the taste profile before discovering books.",
      422,
    );
  }
  const profileEmbedding = JSON.parse(profile.embedding) as number[];
  const topGenres = (profile.aggregated_data?.topGenres ?? []).map((g) => g.genre);
  const subjects = deriveSubjects(topGenres);

  // Fetch + dedup candidate works across subjects. A single failing subject is
  // tolerated, but a total Open Library outage surfaces rather than silently
  // returning an empty list.
  const worksById = new Map<string, OpenLibraryWork>();
  let fetchErrors = 0;
  for (const subject of subjects) {
    try {
      const works = await deps.fetchSubjectWorks(subject);
      for (const work of works) {
        const dedupKey =
          extractOpenLibraryId(work.key) ??
          `${work.title} ${firstAuthor(work)}`.toLowerCase();
        if (!worksById.has(dedupKey)) worksById.set(dedupKey, work);
      }
    } catch {
      fetchErrors++;
    }
  }
  if (worksById.size === 0) {
    if (fetchErrors > 0) {
      throw createError("Open Library is unavailable — try again later.", 502);
    }
    return [];
  }

  const owned = await loadOwnedBooks(userId);
  const candidates = [...worksById.values()]
    .map(toCandidateSource)
    .filter((c) => !isOwned(c, owned));

  if (candidates.length === 0) return [];

  // Ranking query vector: the taste centroid, nudged toward the mood if given.
  let queryVec = profileEmbedding;
  if (opts.moodModifier && opts.moodModifier.trim()) {
    const moodVec = await deps.embed(opts.moodModifier.trim());
    queryVec = blendVectors(profileEmbedding, moodVec);
  }

  const scored: Candidate[] = [];
  for (const c of candidates) {
    const vec = await deps.embed(candidateText(c));
    scored.push({
      title: c.title,
      author: c.author,
      openLibraryId: c.openLibraryId,
      coverUrl: c.coverUrl,
      firstPublishYear: c.firstPublishYear,
      similarity: cosineSimilarity(vec, queryVec),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, TOP_K);
}

function toCandidateSource(work: OpenLibraryWork): CandidateSource {
  return {
    title: work.title,
    author: firstAuthor(work),
    openLibraryId: extractOpenLibraryId(work.key),
    coverUrl:
      work.cover_id != null
        ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg`
        : null,
    firstPublishYear: work.first_publish_year ?? null,
    subjects: (work.subject ?? []).slice(0, 5),
  };
}

function candidateText(c: CandidateSource): string {
  return [c.title, c.author, c.subjects.join(", ")]
    .filter((s) => s && s.trim().length > 0)
    .join("\n");
}

function firstAuthor(work: OpenLibraryWork): string {
  return work.authors?.[0]?.name ?? "Unknown author";
}

function extractOpenLibraryId(key: string | undefined): string | null {
  const match = key?.match(/OL\w+/);
  return match ? match[0] : null;
}

/** Slugify the top genres into Open Library subject slugs; fall back to fiction. */
function deriveSubjects(genres: string[]): string[] {
  const slugs = genres
    .map((g) =>
      g.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    )
    .filter((s) => s.length > 0)
    .slice(0, MAX_SUBJECTS);
  return slugs.length > 0 ? slugs : ["fiction"];
}

async function loadOwnedBooks(userId: string): Promise<OwnedBook[]> {
  return prisma.book.findMany({
    where: { userId },
    select: { openLibraryId: true, title: true, author: true },
  });
}

// Dedup against the reader's library: match on openLibraryId first, then fall
// back to case-insensitive (title, author) — the project's confirmed rule.
function isOwned(c: CandidateSource, owned: OwnedBook[]): boolean {
  return owned.some((b) => {
    if (c.openLibraryId && b.openLibraryId && b.openLibraryId === c.openLibraryId) {
      return true;
    }
    return (
      b.title.toLowerCase() === c.title.toLowerCase() &&
      b.author.toLowerCase() === c.author.toLowerCase()
    );
  });
}

function blendVectors(a: number[], b: number[]): number[] {
  return a.map((x, i) => (x + (b[i] ?? 0)) / 2);
}
