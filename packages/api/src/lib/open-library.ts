import { createError } from "../middleware/error-handler";

const OPEN_LIBRARY_BASE = "https://openlibrary.org";
// Open Library's documented format for identified clients: app name plus a
// contact email. Identified callers get 3 req/s (vs 1 for anonymous) — which
// matters now that the subject fan-out runs its three requests in parallel.
const CONTACT =
  process.env.OPENLIBRARY_CONTACT ?? "folio-maintainers@example.com";
const USER_AGENT = `Folio/1.0 (${CONTACT})`;
const SUBJECT_FETCH_LIMIT = 30;
// Eight seconds is generous for a metadata lookup; with the fan-out parallel
// this is also the retrieval path's worst case, down from 3 × 15s sequential.
const FETCH_TIMEOUT_MS = 8_000;

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
  publisher: string | null;
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
  publisher?: string[];
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
    `&limit=${limit}&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,publisher`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw createError("The catalog isn't answering right now.", 502);
  }
  if (!res.ok) {
    throw createError("The catalog isn't answering right now.", 502);
  }

  // The response shape belongs to an external service — validate it before
  // use. Anything unrecognised (non-JSON, docs missing, junk entries) becomes
  // the same 502 the client already degrades on: manual entry keeps working,
  // the form never crashes on someone else's payload.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw createError("The catalog isn't answering right now.", 502);
  }
  const docs = (body as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) {
    throw createError("The catalog isn't answering right now.", 502);
  }

  return docs
    .filter(
      (d): d is SearchDoc =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as SearchDoc).title === "string" &&
        (d as SearchDoc).title!.trim().length > 0,
    )
    .map((d) => ({
      openLibraryId:
        typeof d.key === "string" ? (d.key.match(/OL\w+/)?.[0] ?? null) : null,
      title: d.title!,
      author:
        Array.isArray(d.author_name) && typeof d.author_name[0] === "string"
          ? d.author_name[0]
          : "Unknown author",
      year: Number.isFinite(d.first_publish_year)
        ? (d.first_publish_year as number)
        : null,
      publisher:
        Array.isArray(d.publisher) && typeof d.publisher[0] === "string"
          ? d.publisher[0]
          : null,
      pageCount: Number.isFinite(d.number_of_pages_median)
        ? (d.number_of_pages_median as number)
        : null,
      coverUrl: Number.isFinite(d.cover_i)
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw createError(`Open Library request failed for "${subject}"`, 502);
  }
  if (!res.ok) {
    throw createError(
      `Open Library returned ${res.status} for "${subject}"`,
      502,
    );
  }
  const body = (await res.json()) as { works?: OpenLibraryWork[] };
  return body.works ?? [];
}
