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

/** One row of B6a's "Find it in the catalog" list. */
export interface CatalogSearchResult {
  openLibraryId: string | null;
  title: string;
  author: string;
  year: number | null;
  pageCount: number | null;
  coverUrl: string | null;
}

interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  cover_i?: number;
}

/**
 * Design B6a — search the Open Library catalog by free text. The form never
 * blocks on this: failures surface as 502 and the client collapses the search
 * panel while the manual fields keep working.
 */
export async function searchCatalog(
  query: string,
  limit = 5,
): Promise<CatalogSearchResult[]> {
  const url =
    `${OPEN_LIBRARY_BASE}/search.json?q=${encodeURIComponent(query)}` +
    `&limit=${limit}&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw createError("The catalog isn't answering right now.", 502);
  }
  if (!res.ok) {
    throw createError("The catalog isn't answering right now.", 502);
  }
  const body = (await res.json()) as { docs?: SearchDoc[] };
  return (body.docs ?? [])
    .filter((d) => d.title)
    .map((d) => ({
      openLibraryId: d.key?.match(/OL\w+/)?.[0] ?? null,
      title: d.title!,
      author: d.author_name?.[0] ?? "Unknown author",
      year: d.first_publish_year ?? null,
      pageCount: d.number_of_pages_median ?? null,
      coverUrl:
        d.cover_i != null
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
          : null,
    }));
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
