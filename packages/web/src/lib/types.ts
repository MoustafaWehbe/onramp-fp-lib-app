/** Shared API types. These mirror the real responses in packages/api. */

export type ReadingStatus =
  | "WANT_TO_READ"
  | "READING"
  | "FINISHED"
  | "ABANDONED";

export const READING_STATUSES: ReadingStatus[] = [
  "WANT_TO_READ",
  "READING",
  "FINISHED",
  "ABANDONED",
];

/** Design §0 wording for each lifecycle state. */
export const STATUS_LABEL: Record<ReadingStatus, string> = {
  WANT_TO_READ: "Want to read",
  READING: "Currently reading",
  FINISHED: "Finished",
  ABANDONED: "Abandoned",
};

export const STATUS_DOT: Record<ReadingStatus, string> = {
  WANT_TO_READ: "bg-lifecycle-want",
  READING: "bg-lifecycle-reading",
  FINISHED: "bg-lifecycle-finished",
  ABANDONED: "bg-lifecycle-abandoned",
};

/** Design B6a: a label for the reader's own filtering — never a file. */
export type BookFormat = "PHYSICAL" | "EBOOK" | "AUDIOBOOK";

export const BOOK_FORMATS: BookFormat[] = ["PHYSICAL", "EBOOK", "AUDIOBOOK"];

export const FORMAT_LABEL: Record<BookFormat, string> = {
  PHYSICAL: "Physical",
  EBOOK: "Ebook",
  AUDIOBOOK: "Audiobook",
};

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  year: number | null;
  pageCount: number | null;
  format: BookFormat;
  status: ReadingStatus;
  openLibraryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  bookId: string;
  reflectionText: string;
  favoriteQuotes: string[];
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Shelf {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on the list endpoint — powers "5 books · 1 shared" (design C9). */
  _count?: { books: number; shares: number };
}

/** A book as it appears on a shelf — carries who put it there (design E17). */
export type ShelvedBook = Book & {
  addedBy: { id: string; name: string };
  addedAt: string;
};

export type ShelfWithBooks = Shelf & { books: ShelvedBook[] };

export interface AnalyticsSummary {
  totalFinished: number;
  averageRating: number | null;
  genreBreakdown: { genre: string; count: number }[];
  velocity: { month: string; finished: number }[];
}

export interface DiscoveryItem {
  rank: number;
  title: string;
  author: string;
  rationale: string;
  similarity: number | null;
}

export interface DiscoveryReport {
  id: string;
  moodModifier: string | null;
  createdAt: string;
  items: DiscoveryItem[];
}

/** The 768-dim embedding is never sent to the client — only the summary. */
export interface TasteProfile {
  id: string;
  userId: string;
  aggregatedData: {
    topGenres: { genre: string; count: number }[];
    topAuthors: { author: string; count: number }[];
    avgRating: number | null;
  };
  refreshedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Design D16 — one entry on a built (not yet kept) mood shelf. */
export interface MoodShelfItem {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  status: ReadingStatus;
  similarity: number;
  why: string;
}

export type MoodShelfResult =
  | { status: "thin"; embeddedCount: number; needed: number }
  | { status: "ok"; title: string; items: MoodShelfItem[] };

/** Design G19 — Reading Memory. */
export interface MemoryOverview {
  entryCount: number;
  wordCount: number;
}

export interface MemoryHit {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  coverImage: string | null;
  entryDate: string;
  pre: string;
  /** The highlighted span; empty when the match was by meaning, not word. */
  hit: string;
  post: string;
  similarity: number | null;
}

export interface MemorySearchResult {
  mode: "semantic" | "exact";
  entryCount: number;
  hits: MemoryHit[];
}

/** Design G20 — Year in Reading. */
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

export interface YearNarrative {
  shape: string[];
  arcs: { label: string; note: string }[];
  headline: string;
}

export type YearInReadingResult =
  | { status: "tooEarly"; year: number; finishedCount: number; needed: number }
  | { status: "ok"; stats: YearStats; narrative: YearNarrative | null };

export type AccessLevel = "VIEW" | "WRITE";
export type ShareStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface ShelfShare {
  id: string;
  shelfId: string;
  accessLevel: AccessLevel;
  status: ShareStatus;
  createdAt: string;
  user: { id: string; email: string; name: string };
}

/** Outgoing: people I share my shelves with. */
export interface Contributor {
  shelfId: string;
  shelfName: string;
  accessLevel: AccessLevel;
  status: ShareStatus;
  user: { id: string; email: string; name: string };
}

/** Design E18 — a single shared book, incoming. Metadata + sender name only. */
export interface ReceivedBookShare {
  shareId: string;
  sharedAt: string;
  sender: { id: string; name: string };
  book: {
    id: string;
    title: string;
    author: string;
    genre: string | null;
    coverImage: string | null;
    year: number | null;
    pageCount: number | null;
  };
}

/** Design E18 — a single shared book, outgoing (who has it + Take it back). */
export interface SentBookShare {
  shareId: string;
  sharedAt: string;
  recipient: { id: string; name: string; email: string };
  book: {
    id: string;
    title: string;
    author: string;
    coverImage: string | null;
  };
}

/** Incoming: a shelf shared with me — metadata only, never the owner's journal. */
export interface SharedShelf {
  shelfId: string;
  name: string;
  description: string | null;
  accessLevel: AccessLevel;
  owner: { id: string; name: string };
  books: ShelvedBook[];
}
