import { getPrisma } from "@starter-kit/shared";

const prisma = getPrisma();

export interface AnalyticsSummary {
  totalFinished: number;
  averageRating: number | null;
  genreBreakdown: { genre: string; count: number }[];
  // Books finished per calendar month (uses updated_at as the finish timestamp,
  // the closest signal available without a dedicated finishedAt column).
  velocity: { month: string; finished: number }[];
}

export const analyticsService = {
  async summary(userId: string): Promise<AnalyticsSummary> {
    const [totalFinished, ratingAgg, genreGroups, velocityRows] =
      await Promise.all([
        prisma.book.count({ where: { userId, status: "FINISHED" } }),
        prisma.journalEntry.aggregate({
          where: { userId, rating: { not: null } },
          _avg: { rating: true },
        }),
        prisma.book.groupBy({
          by: ["genre"],
          where: { userId },
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
      ]);

    const avg = ratingAgg._avg.rating;

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
    };
  },
};
