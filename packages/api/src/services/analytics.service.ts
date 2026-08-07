import { getPrisma } from "@starter-kit/shared";

const prisma = getPrisma();

export interface AnalyticsSummary {
  totalFinished: number;
  averageRating: number | null;
  genreBreakdown: { genre: string; count: number }[];
  // Books finished per calendar month (uses updated_at as the finish timestamp,
  // the closest signal available without a dedicated finishedAt column).
  velocity: { month: string; finished: number }[];
  // Editorial sublines for the C12 stat tiles.
  pagesFinished: number;
  // Highest average rating by genre — only claimed with two or more rated
  // books in the genre, so a single five-star can't crown a favourite.
  topRatedGenre: { genre: string; average: number } | null;
  // The READING book that's been in progress longest (weeks since it was
  // added — the closest signal without a startedAt column).
  longestInProgress: { title: string; weeks: number } | null;
}

export const analyticsService = {
  async summary(userId: string): Promise<AnalyticsSummary> {
    const [
      totalFinished,
      ratingAgg,
      genreGroups,
      velocityRows,
      pagesAgg,
      ratedEntries,
      oldestReading,
    ] = await Promise.all([
        prisma.book.count({ where: { userId, status: "FINISHED" } }),
        prisma.journalEntry.aggregate({
          where: { userId, rating: { not: null } },
          _avg: { rating: true },
        }),
        // Finished books only: the dashboard is "a year of reading", and the
        // donut labels itself "share of finished books by genre". Counting
        // want-to-read and in-progress books made the label lie.
        prisma.book.groupBy({
          by: ["genre"],
          where: { userId, status: "FINISHED" },
          _count: { _all: true },
        }),
        prisma.$queryRaw<{ month: Date; finished: number }[]>`
          SELECT date_trunc('month', "updated_at") AS month,
                 COUNT(*)::int AS finished
          FROM "books"
          WHERE "user_id" = ${userId}::uuid AND "status" = 'FINISHED'
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        prisma.book.aggregate({
          where: { userId, status: "FINISHED" },
          _sum: { pageCount: true },
        }),
        prisma.journalEntry.findMany({
          where: { userId, rating: { not: null } },
          select: { rating: true, book: { select: { genre: true } } },
        }),
        prisma.book.findFirst({
          where: { userId, status: "READING" },
          orderBy: { createdAt: "asc" },
          select: { title: true, createdAt: true },
        }),
      ]);

    const avg = ratingAgg._avg.rating;

    // Highest average rating by genre, claimed only on 2+ rated books.
    const byGenre = new Map<string, number[]>();
    for (const e of ratedEntries) {
      const genre = e.book.genre;
      if (!genre || e.rating == null) continue;
      byGenre.set(genre, [...(byGenre.get(genre) ?? []), e.rating]);
    }
    let topRatedGenre: AnalyticsSummary["topRatedGenre"] = null;
    for (const [genre, ratings] of byGenre) {
      if (ratings.length < 2) continue;
      const average =
        Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) /
        10;
      if (
        !topRatedGenre ||
        average > topRatedGenre.average ||
        (average === topRatedGenre.average && genre < topRatedGenre.genre)
      ) {
        topRatedGenre = { genre, average };
      }
    }

    const longestInProgress = oldestReading
      ? {
          title: oldestReading.title,
          weeks: Math.floor(
            (Date.now() - oldestReading.createdAt.getTime()) /
              (7 * 24 * 60 * 60 * 1_000),
          ),
        }
      : null;

    return {
      totalFinished,
      averageRating: avg == null ? null : Math.round(avg * 100) / 100,
      genreBreakdown: genreGroups
        .map((g) => ({ genre: g.genre ?? "Unknown", count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      velocity: velocityRows.map((r) => ({
        month: r.month.toISOString().slice(0, 7), // YYYY-MM
        finished: r.finished,
      })),
      pagesFinished: pagesAgg._sum.pageCount ?? 0,
      topRatedGenre,
      longestInProgress,
    };
  },
};
