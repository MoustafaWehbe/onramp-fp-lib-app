import { createError } from "../middleware/error-handler";

const OPEN_LIBRARY_BASE = "https://openlibrary.org";
// Open Library asks API clients for a descriptive User-Agent with a contact.
const USER_AGENT =
  "Folio/0.1 (personal reading journal; +https://github.com/MoustafaWehbe/onramp-fp-lib-app)";
const SUBJECT_FETCH_LIMIT = 30;

/** A work from the Open Library Subjects API (only the fields we use). */
export interface OpenLibraryWork {
  key: string; // e.g. "/works/OL138052W"
  title: string;
  authors?: { name: string }[];
  cover_id?: number | null;
  first_publish_year?: number | null;
  subject?: string[];
}

/**
 * Fetch works for a subject slug from the Open Library Subjects API.
 *
 * Kept free of any DB/queue imports so it can be exercised (and smoke-tested)
 * without opening the shared Redis/Prisma handles.
 */
export async function fetchSubjectWorks(
  subject: string,
): Promise<OpenLibraryWork[]> {
  const url = `${OPEN_LIBRARY_BASE}/subjects/${encodeURIComponent(subject)}.json?limit=${SUBJECT_FETCH_LIMIT}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw createError(`Open Library request failed for "${subject}"`, 502);
  }
  if (!res.ok) {
    throw createError(`Open Library returned ${res.status} for "${subject}"`, 502);
  }
  const body = (await res.json()) as { works?: OpenLibraryWork[] };
  return body.works ?? [];
}
