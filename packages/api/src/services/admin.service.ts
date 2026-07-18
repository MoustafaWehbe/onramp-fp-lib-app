import { getPrisma } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import type { UpdateUserInput } from "../schemas/admin.schemas";

const prisma = getPrisma();

/**
 * Account fields only — an admin manages accounts, never reading content.
 * No book titles, journals, ratings, or shelves ever leave this service
 * (design F18: "zero user content, anonymized aggregates only").
 */
const accountFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerified: true,
  createdAt: true,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export const adminService = {
  async listUsers() {
    return prisma.user.findMany({
      select: { ...accountFields, _count: { select: { books: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async getUser(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { ...accountFields, _count: { select: { books: true } } },
    });
    if (!user) throw createError("User not found", 404);
    return user;
  },

  async updateUser(actingAdminId: string, id: string, input: UpdateUserInput) {
    if (id === actingAdminId && input.role === "user") {
      throw createError("You can't demote your own account", 400);
    }
    await this.getUser(id);
    return prisma.user.update({
      where: { id },
      data: { role: input.role, emailVerified: input.emailVerified },
      select: accountFields,
    });
  },

  async deleteUser(actingAdminId: string, id: string) {
    if (id === actingAdminId) {
      throw createError("You can't delete your own account", 400);
    }
    await this.getUser(id);
    // Books, shelves, journals, sessions all cascade with the user.
    await prisma.user.delete({ where: { id } });
  },

  /** The F18 overview: real aggregates only, nothing invented. */
  async stats() {
    const now = Date.now();
    const since30d = new Date(now - 30 * DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);
    const since14d = new Date(now - 14 * DAY_MS);

    const [
      userCount,
      bookCount,
      reportCount,
      signups7d,
      activeSessions30d,
      recentReports,
      cohortRows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.book.count(),
      prisma.discoveryReport.count(),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      // Distinct users who opened a session in the last 30 days.
      prisma.session.findMany({
        where: { createdAt: { gte: since30d } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.discoveryReport.findMany({
        where: { createdAt: { gte: since14d } },
        select: { createdAt: true },
      }),
      // Anonymized cohorts: accounts grouped by signup month with avg books.
      prisma.$queryRaw<{ cohort: string; accounts: number; avg_books: number }[]>`
        SELECT to_char(date_trunc('month', u."created_at"), 'Mon YYYY') AS cohort,
               COUNT(DISTINCT u.id)::int                                AS accounts,
               ROUND(COUNT(b.id)::numeric / COUNT(DISTINCT u.id), 1)::float AS avg_books
        FROM "users" u
        LEFT JOIN "books" b ON b."user_id" = u.id
        GROUP BY date_trunc('month', u."created_at")
        ORDER BY date_trunc('month', u."created_at") DESC
        LIMIT 6
      `,
    ]);

    // Bucket the last 14 days of reports into per-day counts (UTC days).
    const reportsPerDay: { day: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
      reportsPerDay.push({ day, count: 0 });
    }
    const byDay = new Map(reportsPerDay.map((r) => [r.day, r]));
    for (const r of recentReports) {
      const day = r.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day);
      if (bucket) bucket.count += 1;
    }

    return {
      userCount,
      bookCount,
      reportCount,
      signups7d,
      activeUsers30d: activeSessions30d.length,
      reportsPerDay,
      cohorts: cohortRows.map((c) => ({
        cohort: c.cohort,
        accounts: c.accounts,
        avgBooks: c.avg_books,
      })),
    };
  },
};
