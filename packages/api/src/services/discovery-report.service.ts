import { getPrisma, chatCompletion, type ChatMessage } from "@starter-kit/shared";
import { createError } from "../middleware/error-handler";
import {
  retrieveCandidates,
  type Candidate,
} from "./candidate-retrieval.service";

const prisma = getPrisma();

const MAX_EXCERPTS = 3;
const REQUIRED_PICKS = 3;

const SYSTEM_PROMPT = `You are Folio's book-recommendation writer. You are given:
- READER PROFILE: top genres, top authors, average rating.
- READER EXCERPTS: short quotes from the reader's own journal reflections on books they finished.
- CANDIDATES: a numbered list of exactly 5 real books (title + author) retrieved for this reader.
- MOOD MODIFIER (optional): what the reader is in the mood for right now.

Task: choose EXACTLY 3 of the 5 candidates that best fit this reader; for each, write a 1-2 sentence "why" tying the pick to the reader's specific excerpts/tastes.

Hard rules:
- Choose ONLY from CANDIDATES. Never invent, rename, or alter a title or author - copy both VERBATIM.
- Pick exactly 3, ranked best first.
- Each "why" must reference something concrete from the READER EXCERPTS or PROFILE (a theme, author, or feeling they expressed) - not generic praise.
- If a MOOD MODIFIER is present, it takes priority: pick and justify for that mood, even if that means different picks than the standing profile alone would suggest.
- Output ONLY valid JSON, nothing else (no preamble, no trailing text):
{"picks":[{"rank":1,"title":"<verbatim>","author":"<verbatim>","why":"<grounded 1-2 sentences>"},{"rank":2,...},{"rank":3,...}]}`;

export interface DiscoveryDeps {
  retrieve: (
    userId: string,
    opts: { moodModifier?: string },
  ) => Promise<Candidate[]>;
  generate: (messages: ChatMessage[]) => Promise<string>;
}

const defaultDeps: DiscoveryDeps = {
  retrieve: (userId, opts) => retrieveCandidates(userId, opts),
  generate: (messages) => chatCompletion(messages),
};

export interface DiscoveryReportResult {
  id: string;
  moodModifier: string | null;
  createdAt: Date;
  items: {
    rank: number;
    title: string;
    author: string;
    rationale: string;
    similarity: number | null;
  }[];
}

interface RawPick {
  rank?: number;
  title?: string;
  author?: string;
  why?: string;
}

interface ResolvedPick {
  candidate: Candidate;
  rationale: string;
}

/**
 * Build a discovery report: retrieve real candidates, have the generation model
 * pick exactly 3 (verbatim) with grounded rationales, verify that server-side
 * (retrying once with a correction that names what was wrong), and persist the
 * DiscoveryReport + 3 RecommendationItem rows.
 */
export async function generateDiscoveryReport(
  userId: string,
  opts: { moodModifier?: string } = {},
  deps: DiscoveryDeps = defaultDeps,
): Promise<DiscoveryReportResult> {
  const candidates = await deps.retrieve(userId, { moodModifier: opts.moodModifier });
  if (candidates.length < REQUIRED_PICKS) {
    throw createError(
      "Not enough candidates to build a discovery report — add more finished books first.",
      422,
    );
  }

  const [profileSummary, excerpts] = await Promise.all([
    loadProfileSummary(userId),
    loadExcerpts(userId),
  ]);

  const picks = await generateVerifiedPicks(
    candidates,
    profileSummary,
    excerpts,
    opts.moodModifier,
    deps.generate,
  );

  return persistReport(userId, opts.moodModifier ?? null, picks);
}

async function generateVerifiedPicks(
  candidates: Candidate[],
  profileSummary: string,
  excerpts: string[],
  mood: string | undefined,
  generate: DiscoveryDeps["generate"],
): Promise<ResolvedPick[]> {
  const byKey = new Map(candidates.map((c) => [matchKey(c.title, c.author), c]));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(candidates, profileSummary, excerpts, mood) },
  ];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generate(messages);
    const picks = parsePicks(raw);
    const problems = validate(picks, byKey);

    if (problems.length === 0) {
      return picks!.map((p) => ({
        candidate: byKey.get(matchKey(p.title!, p.author!))!,
        rationale: p.why!.trim(),
      }));
    }

    if (attempt === 2) {
      throw createError(
        `The recommendation model failed the verbatim/format check twice: ${problems.join("; ")}`,
        502,
      );
    }

    // Retry once, telling the model exactly what was wrong — not a blind resend.
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: buildCorrectionMessage(problems, candidates) },
    );
  }

  throw createError("Discovery generation failed", 500); // unreachable
}

/** Parse the model output into picks, tolerating code fences / surrounding prose. */
function parsePicks(raw: string): RawPick[] | null {
  try {
    const obj = JSON.parse(stripToJson(raw)) as { picks?: unknown };
    return Array.isArray(obj.picks) ? (obj.picks as RawPick[]) : null;
  } catch {
    return null;
  }
}

/** Strip Markdown code fences / surrounding prose so fenced JSON parses (gemma). */
function stripToJson(raw: string): string {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) s = fenced[1]!.trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

/** Return a list of specific problems; empty means the picks are valid. */
function validate(picks: RawPick[] | null, byKey: Map<string, Candidate>): string[] {
  if (!picks) return ["the response was not valid JSON with a `picks` array"];

  const problems: string[] = [];
  if (picks.length !== REQUIRED_PICKS) {
    problems.push(`expected exactly ${REQUIRED_PICKS} picks but got ${picks.length}`);
  }

  const seen = new Set<string>();
  for (const p of picks) {
    if (!p.title || !p.author) {
      problems.push("a pick was missing a title or author");
      continue;
    }
    const key = matchKey(p.title, p.author);
    if (!byKey.has(key)) {
      problems.push(`"${p.title}" by ${p.author} is not one of the 5 candidates`);
    }
    if (seen.has(key)) {
      problems.push(`"${p.title}" by ${p.author} was picked more than once`);
    }
    seen.add(key);
    if (!p.why || !p.why.trim()) {
      problems.push(`"${p.title}" has an empty rationale`);
    }
  }
  return problems;
}

function buildUserMessage(
  candidates: Candidate[],
  profileSummary: string,
  excerpts: string[],
  mood: string | undefined,
): string {
  const parts = [
    profileSummary,
    "READER EXCERPTS:\n" +
      (excerpts.length > 0
        ? excerpts.map((e) => `- "${e}"`).join("\n")
        : "- (none yet)"),
    "CANDIDATES:\n" +
      candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.author}`).join("\n"),
  ];
  if (mood && mood.trim()) parts.push(`MOOD MODIFIER: ${mood.trim()}`);
  return parts.join("\n\n");
}

function buildCorrectionMessage(problems: string[], candidates: Candidate[]): string {
  return (
    "Your previous response was rejected for these reasons:\n" +
    problems.map((p) => `- ${p}`).join("\n") +
    "\n\nFix them. Choose EXACTLY 3 books, copying each title and author VERBATIM from " +
    "this candidate list:\n" +
    candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.author}`).join("\n") +
    "\n\nReturn ONLY the JSON object, with no surrounding text."
  );
}

async function loadProfileSummary(userId: string): Promise<string> {
  const profile = await prisma.tasteProfile.findUnique({ where: { userId } });
  const agg = (profile?.aggregatedData ?? {}) as {
    topGenres?: { genre: string }[];
    topAuthors?: { author: string }[];
    avgRating?: number | null;
  };
  const genres = (agg.topGenres ?? []).map((g) => g.genre).join(", ") || "n/a";
  const authors = (agg.topAuthors ?? []).map((a) => a.author).join(", ") || "n/a";
  const avg = agg.avgRating != null ? String(agg.avgRating) : "n/a";
  return `READER PROFILE:\n- Top genres: ${genres}\n- Top authors: ${authors}\n- Average rating: ${avg}`;
}

async function loadExcerpts(userId: string): Promise<string[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    select: { reflectionText: true },
    orderBy: { createdAt: "desc" },
    take: MAX_EXCERPTS,
  });
  return entries.map((e) => e.reflectionText.trim()).filter((t) => t.length > 0);
}

async function persistReport(
  userId: string,
  moodModifier: string | null,
  picks: ResolvedPick[],
): Promise<DiscoveryReportResult> {
  const report = await prisma.discoveryReport.create({
    data: {
      userId,
      moodModifier,
      items: {
        create: picks.map((p, i) => ({
          rank: i + 1,
          title: p.candidate.title,
          author: p.candidate.author,
          rationale: p.rationale,
          similarity: p.candidate.similarity,
        })),
      },
    },
    include: { items: { orderBy: { rank: "asc" } } },
  });

  return {
    id: report.id,
    moodModifier: report.moodModifier,
    createdAt: report.createdAt,
    items: report.items.map((it) => ({
      rank: it.rank,
      title: it.title,
      author: it.author,
      rationale: it.rationale,
      similarity: it.similarity,
    })),
  };
}

interface StoredReport {
  id: string;
  moodModifier: string | null;
  createdAt: Date;
  items: {
    rank: number;
    title: string;
    author: string;
    rationale: string;
    similarity: number | null;
  }[];
}

function toResult(report: StoredReport): DiscoveryReportResult {
  return {
    id: report.id,
    moodModifier: report.moodModifier,
    createdAt: report.createdAt,
    items: report.items.map((it) => ({
      rank: it.rank,
      title: it.title,
      author: it.author,
      rationale: it.rationale,
      similarity: it.similarity,
    })),
  };
}

/** Owner-scoped: this user's reports, newest first, each with its three picks. */
export async function listDiscoveryReports(
  userId: string,
): Promise<DiscoveryReportResult[]> {
  const reports = await prisma.discoveryReport.findMany({
    where: { userId },
    include: { items: { orderBy: { rank: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return reports.map(toResult);
}

/** Owner-scoped: a single report. 404 if it isn't this user's. */
export async function getDiscoveryReport(
  userId: string,
  id: string,
): Promise<DiscoveryReportResult> {
  const report = await prisma.discoveryReport.findUnique({
    where: { id },
    include: { items: { orderBy: { rank: "asc" } } },
  });
  if (!report || report.userId !== userId) {
    throw createError("Discovery report not found", 404);
  }
  return toResult(report);
}

function matchKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}\u0000${author.trim().toLowerCase()}`;
}
