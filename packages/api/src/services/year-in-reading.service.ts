import {
  getPrisma,
  chatCompletion,
  type ChatMessage,
} from "@starter-kit/shared";
import { stripToJson } from "../lib/llm-json";

const prisma = getPrisma();

/** Design G20: "in December, or around ten finished books — whichever comes first." */
const MIN_FINISHED = 10;
const STANDOUT_COUNT = 4;

const SYSTEM_PROMPT = `You write a private year-in-reading retrospective for one reader, from their own library and journal. You are given the year's stats, the finished books (title, author, genre, rating, finished month), and short excerpts of what the reader wrote.

Voice: second person, quiet, concrete, descriptive — "a description of a year, not a judgement about you". Never congratulate, never coach, never mention data or AI.

Output ONLY valid JSON, nothing else:
{
 "shape": ["<paragraph 1: the overall arc of the year>", "<paragraph 2: something that changed, citing a specific book>"],
 "arcs": [{"label":"<Month range · short name>","note":"<one sentence>"}, {...}, {...}],
 "headline": "<card headline, under 9 words, e.g. '31 books, and a turn toward poetry'>"
}`;

/** Injectable generation call, so tests can run without an Ollama host. */
export interface YearInReadingDeps {
  generate: (messages: ChatMessage[]) => Promise<string>;
}

const defaultDeps: YearInReadingDeps = {
  generate: (messages) => chatCompletion(messages),
};

/** Everything read straight off the shelves — available with no model. */
export interface YearStats {
  year: number;
  finishedCount: number;
  pages: number;
  wordsWritten: number;
  abandonedCount: number;
  velocity: { month: string; finished: number }[];
  genreShifts: { genre: string; before: number; after: number }[];
  standouts: {
    id: string;
    title: string;
    author: string;
    coverImage: string | null;
    note: string | null;
  }[];
  bookOfTheYear: { title: string; author: string } | null;
}

/** The model-written part: shape paragraphs, three arcs, card headline. */
export interface YearNarrative {
  shape: string[];
  arcs: { label: string; note: string }[];
  headline: string;
}

/**
 * "tooEarly" gates thin years (fewer than `needed` finished before
 * December). "ok" always carries the stats; `narrative` is null when the
 * model didn't answer or returned junk — the page degrades, never blocks.
 */
export type YearInReadingResult =
  | { status: "tooEarly"; year: number; finishedCount: number; needed: number }
  | {
      status: "ok";
      stats: YearStats;
      /** null when the generation model didn't answer — counts stay available. */
      narrative: YearNarrative | null;
    };

interface FinishedBook {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  pageCount: number | null;
  updatedAt: Date;
  journalEntry: {
    rating: number | null;
    reflectionText: string;
    updatedAt: Date;
  } | null;
}

/**
 * Design G20 — a written retrospective of one year. The counts are read
 * straight off the shelves (always available); only the narrative needs the
 * model, and its absence degrades the page, never blocks it. Follows the
 * analytics convention: updated_at on a FINISHED book is the finish signal.
 */
export async function yearInReading(
  userId: string,
  year: number,
  deps: YearInReadingDeps = defaultDeps,
): Promise<YearInReadingResult> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const finished: FinishedBook[] = await prisma.book.findMany({
    where: {
      userId,
      status: "FINISHED",
      updatedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      title: true,
      author: true,
      genre: true,
      coverImage: true,
      pageCount: true,
      updatedAt: true,
      journalEntry: {
        select: { rating: true, reflectionText: true, updatedAt: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const now = new Date();
  const decemberOfYear =
    now.getUTCFullYear() > year || now.getUTCMonth() === 11;
  if (finished.length < MIN_FINISHED && !decemberOfYear) {
    return {
      status: "tooEarly",
      year,
      finishedCount: finished.length,
      needed: MIN_FINISHED,
    };
  }

  const stats = await buildStats(userId, year, finished, start, end);
  const narrative = await buildNarrative(stats, finished, deps.generate);
  return { status: "ok", stats, narrative };
}

async function buildStats(
  userId: string,
  year: number,
  finished: FinishedBook[],
  start: Date,
  end: Date,
): Promise<YearStats> {
  const [abandonedCount, entries, thisYearGenres, lastYearGenres] =
    await Promise.all([
      prisma.book.count({
        where: {
          userId,
          status: "ABANDONED",
          updatedAt: { gte: start, lt: end },
        },
      }),
      prisma.journalEntry.findMany({
        where: { userId, updatedAt: { gte: start, lt: end } },
        select: { reflectionText: true },
      }),
      genreCounts(userId, year),
      genreCounts(userId, year - 1),
    ]);

  // Every date in this service is bucketed in UTC (getUTCMonth, Date.UTC
  // boundaries) — so the labels must be formatted in UTC too, or a server
  // west of Greenwich prints "Dec" over the January bucket.
  const velocity = Array.from({ length: 12 }, (_, m) => ({
    month: new Date(Date.UTC(year, m, 1)).toLocaleString("en", {
      month: "short",
      timeZone: "UTC",
    }),
    finished: finished.filter((b) => b.updatedAt.getUTCMonth() === m).length,
  }));

  // Genres that moved the most between the two years, biggest swing first.
  const genres = new Set([...thisYearGenres.keys(), ...lastYearGenres.keys()]);
  const genreShifts = [...genres]
    .map((g) => ({
      genre: g,
      before: lastYearGenres.get(g) ?? 0,
      after: thisYearGenres.get(g) ?? 0,
    }))
    .filter((s) => s.before !== s.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
    .slice(0, 4);

  const rated = finished
    .filter((b) => b.journalEntry?.rating != null)
    .sort((a, b) => {
      const byRating =
        (b.journalEntry!.rating ?? 0) - (a.journalEntry!.rating ?? 0);
      if (byRating !== 0) return byRating;
      return (
        (b.journalEntry!.reflectionText.length ?? 0) -
        (a.journalEntry!.reflectionText.length ?? 0)
      );
    });

  const standouts = rated.slice(0, STANDOUT_COUNT).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    coverImage: b.coverImage,
    note: excerpt(b.journalEntry?.reflectionText),
  }));

  return {
    year,
    finishedCount: finished.length,
    pages: finished.reduce((sum, b) => sum + (b.pageCount ?? 0), 0),
    wordsWritten: entries.reduce(
      (sum, e) =>
        sum +
        (e.reflectionText.trim()
          ? e.reflectionText.trim().split(/\s+/).length
          : 0),
      0,
    ),
    abandonedCount,
    velocity,
    genreShifts,
    standouts,
    bookOfTheYear: rated[0]
      ? { title: rated[0].title, author: rated[0].author }
      : null,
  };
}

async function genreCounts(
  userId: string,
  year: number,
): Promise<Map<string, number>> {
  const rows = await prisma.book.groupBy({
    by: ["genre"],
    where: {
      userId,
      status: "FINISHED",
      updatedAt: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    _count: { _all: true },
  });
  return new Map(
    rows.filter((r) => r.genre).map((r) => [r.genre as string, r._count._all]),
  );
}

async function buildNarrative(
  stats: YearStats,
  finished: FinishedBook[],
  generate: YearInReadingDeps["generate"],
): Promise<YearNarrative | null> {
  const bookLines = finished
    .map((b) => {
      // Same clock as the stats buckets — UTC, never server-local.
      const month = b.updatedAt.toLocaleString("en", {
        month: "long",
        timeZone: "UTC",
      });
      const rating = b.journalEntry?.rating;
      return (
        `- ${b.title} — ${b.author}` +
        (b.genre ? ` (${b.genre})` : "") +
        `, finished ${month}` +
        (rating != null ? `, rated ${rating}/5` : "") +
        (b.pageCount ? `, ${b.pageCount} pages` : "")
      );
    })
    .join("\n");

  const excerpts = finished
    .map((b) => ({
      title: b.title,
      text: excerpt(b.journalEntry?.reflectionText),
    }))
    .filter((e) => e.text)
    .slice(0, 6)
    .map((e) => `- On ${e.title}: "${e.text}"`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `YEAR: ${stats.year}\n` +
        `STATS: ${stats.finishedCount} finished, ${stats.pages} pages, ` +
        `${stats.wordsWritten} words written in the journal, ${stats.abandonedCount} set down unfinished.\n` +
        `MONTHLY FINISHES: ${stats.velocity.map((v) => `${v.month} ${v.finished}`).join(", ")}\n\n` +
        `FINISHED BOOKS:\n${bookLines}\n\n` +
        `READER EXCERPTS:\n${excerpts || "- (none)"}`,
    },
  ];

  try {
    const raw = await generate(messages);
    const parsed = JSON.parse(stripToJson(raw)) as Partial<YearNarrative>;
    const shape = (parsed.shape ?? []).filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0,
    );
    const arcs = (parsed.arcs ?? []).filter(
      (a): a is { label: string; note: string } =>
        Boolean(a && typeof a.label === "string" && typeof a.note === "string"),
    );
    if (shape.length === 0) return null;
    return {
      shape,
      arcs: arcs.slice(0, 3),
      headline:
        typeof parsed.headline === "string" && parsed.headline.trim()
          ? parsed.headline.trim()
          : `${stats.finishedCount} books in ${stats.year}`,
    };
  } catch {
    return null;
  }
}

function excerpt(text: string | undefined): string | null {
  if (!text?.trim()) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}…` : clean;
}
