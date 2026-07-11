import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";

const prisma = getPrisma();

// A finished book without an explicit rating still reflects the reader's taste,
// so it contributes at a neutral weight (the middle of the 1..5 scale) rather
// than being dropped from the average.
const NEUTRAL_WEIGHT = 3;
const TOP_N = 5;

interface EmbeddingRow {
  book_id: string;
  embedding: string; // pgvector text form: "[0.1,0.2,...]"
  genre: string | null;
  author: string;
  rating: number | null;
}

export interface TasteProfileSummary {
  booksAggregated: number;
  dimensions: number;
  refreshedAt: Date;
  aggregatedData: {
    topGenres: { genre: string; count: number }[];
    topAuthors: { author: string; count: number }[];
    avgRating: number | null;
  };
}

export class TasteProfileService {
  /**
   * Recompute the user's taste profile: a rating-weighted average of their
   * BookEmbedding vectors, plus a structured summary (top genres/authors, avg
   * rating). Upserts TasteProfile. The pgvector columns are read/written with
   * raw SQL because Prisma models them as `Unsupported`.
   */
  async refresh(userId: string): Promise<TasteProfileSummary> {
    const rows = await prisma.$queryRaw<EmbeddingRow[]>`
      SELECT be.book_id,
             be.embedding::text AS embedding,
             b.genre,
             b.author,
             j.rating
      FROM book_embeddings be
      JOIN books b ON b.id = be.book_id
      LEFT JOIN journal_entries j ON j.book_id = be.book_id
      WHERE be.user_id = ${userId}::uuid
    `;

    if (rows.length === 0) {
      throw createError(
        "No book embeddings to aggregate yet — finish a book and add a journal entry first.",
        422,
      );
    }

    const embedding = ratingWeightedAverage(rows);
    const aggregatedData = summarize(rows);

    const vectorLiteral = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      INSERT INTO taste_profiles (user_id, aggregated_data, embedding, refreshed_at, created_at, updated_at)
      VALUES (${userId}::uuid, ${JSON.stringify(aggregatedData)}::jsonb, ${vectorLiteral}::vector, now(), now(), now())
      ON CONFLICT (user_id) DO UPDATE
        SET aggregated_data = EXCLUDED.aggregated_data,
            embedding       = EXCLUDED.embedding,
            refreshed_at    = now(),
            updated_at      = now();
    `;

    return {
      booksAggregated: rows.length,
      dimensions: embedding.length,
      refreshedAt: new Date(),
      aggregatedData,
    };
  }
}

/** Σ(weight · vector) / Σ(weight), element-wise, weighted by the book's rating. */
function ratingWeightedAverage(rows: EmbeddingRow[]): number[] {
  const vectors = rows.map((r) => JSON.parse(r.embedding) as number[]);
  const dims = vectors[0]!.length;

  const sum = new Array<number>(dims).fill(0);
  let totalWeight = 0;

  rows.forEach((row, idx) => {
    const vec = vectors[idx]!;
    if (vec.length !== dims) {
      throw createError("Inconsistent embedding dimensions for user", 500);
    }
    const weight = row.rating ?? NEUTRAL_WEIGHT;
    for (let i = 0; i < dims; i++) sum[i]! += weight * vec[i]!;
    totalWeight += weight;
  });

  return sum.map((s) => s / totalWeight);
}

function summarize(rows: EmbeddingRow[]): TasteProfileSummary["aggregatedData"] {
  const genreCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const ratings: number[] = [];

  for (const row of rows) {
    if (row.genre) genreCounts.set(row.genre, (genreCounts.get(row.genre) ?? 0) + 1);
    authorCounts.set(row.author, (authorCounts.get(row.author) ?? 0) + 1);
    if (row.rating != null) ratings.push(row.rating);
  }

  const topByCount = (counts: Map<string, number>) =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_N);

  const avgRating =
    ratings.length > 0
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
      : null;

  return {
    topGenres: topByCount(genreCounts).map(([genre, count]) => ({ genre, count })),
    topAuthors: topByCount(authorCounts).map(([author, count]) => ({ author, count })),
    avgRating,
  };
}

export const tasteProfileService = new TasteProfileService();
