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

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  year: number | null;
  pageCount: number | null;
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

/** Incoming: a shelf shared with me — metadata only, never the owner's journal. */
export interface SharedShelf {
  shelfId: string;
  name: string;
  description: string | null;
  accessLevel: AccessLevel;
  owner: { id: string; name: string };
  books: ShelvedBook[];
}
