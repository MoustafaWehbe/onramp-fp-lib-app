import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type {
  Book,
  BookFileKind,
  BookFileMeta,
  BookFormat,
  JournalEntry,
  ReadingProgress,
  ReadingStatus,
} from "../lib/types";

/** Library list filters; empty values are stripped before the request. */
export interface BookFilters {
  status?: ReadingStatus;
  genre?: string;
  author?: string;
  q?: string;
  sort?: string;
}

/** Create/update payload for a book — mirrors the API zod schema. */
export interface BookInput {
  title: string;
  author: string;
  genre?: string;
  coverImage?: string;
  year?: number;
  pageCount?: number;
  format?: BookFormat;
  status?: ReadingStatus;
  /** Set when the book came from the B6a catalog search — powers dedup. */
  openLibraryId?: string;
}

/** Drop empty filter values so we don't send `?status=` and friends. */
function clean(filters: BookFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""),
  );
}

/** The reader's library, filtered and sorted server-side. */
export function useBooks(filters: BookFilters = {}) {
  return useQuery({
    queryKey: ["books", filters],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Book[] }>("/books", {
        params: clean(filters),
      });
      return data.data;
    },
  });
}

/** One owned book; disabled until an id exists. */
export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Book }>(`/books/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** Create a book; a 409 means the (title, author) pair already exists. */
export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BookInput) => {
      const { data } = await apiClient.post<{ data: Book }>("/books", input);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

/** Patch a book and refresh every view that shows it. */
export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<BookInput> & { id: string }) => {
      const { data } = await apiClient.patch<{ data: Book }>(
        `/books/${id}`,
        input,
      );
      return data.data;
    },
    onSuccess: (book) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["book", book.id] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

/** Remove a book from the library (and, via cascade, its journal). */
export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/books/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

/** One "books like this one" card (B7a). */
export interface SimilarBookItem {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverImage: string | null;
  similarity: number;
  why: string;
}

/** B7a payload: "ok" with items, or "thin" until enough books are embedded. */
export interface SimilarBooksResult {
  status: "ok" | "thin";
  embeddedCount: number;
  needed: number;
  items: SimilarBookItem[];
}

/** Design B7a — "Books like this one", drawn only from the reader's own library. */
export function useSimilarBooks(bookId: string | undefined) {
  return useQuery({
    queryKey: ["similar-books", bookId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: SimilarBooksResult }>(
        `/books/${bookId}/similar`,
      );
      return data.data;
    },
    enabled: Boolean(bookId),
    // Retrieval + a generation call can take a while and failures mean the
    // engine is offline — surface that state instead of hammering it.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/** The private journal entry for a book; null until one is written. */
export function useJournal(bookId: string | undefined) {
  return useQuery({
    queryKey: ["journal", bookId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: JournalEntry | null }>(
        `/books/${bookId}/journal`,
      );
      return data.data;
    },
    enabled: Boolean(bookId),
  });
}

/**
 * Design B8a — AI opening prompts for a blank reflection. POST because the
 * server generates on demand; nothing about the request is persisted there.
 */
export function useJournalPrompts(
  bookId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["journal-prompts", bookId],
    queryFn: async () => {
      const { data } = await apiClient.post<{ data: { prompts: string[] } }>(
        `/ai/journal-prompts/${bookId}`,
      );
      return data.data.prompts;
    },
    enabled: Boolean(bookId) && enabled,
    retry: false,
    staleTime: Infinity,
  });
}

/** Journal save payload; the API gates it behind FINISHED. */
export interface JournalInput {
  reflectionText: string;
  favoriteQuotes?: string[];
  rating?: number;
}

/** Upsert the reflection; every save re-queues the book's embedding. */
export function useSaveJournal(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JournalInput) => {
      // The API rejects this with 409 until the book is FINISHED — that gate is
      // deliberate (design B7: "unlocks when you mark this book Finished").
      const { data } = await apiClient.put<{ data: JournalEntry }>(
        `/books/${bookId}/journal`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", bookId] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

// ── Attached files & reading progress ───────────────────────────────────────

/** Where an attached file streams from (the API honours Range here). */
export function bookFileUrl(bookId: string, kind: BookFileKind): string {
  return `/api/books/${bookId}/file/${kind.toLowerCase()}`;
}

/** The saved reading position for a book; null when never opened. */
export function useReadingProgress(bookId: string | undefined) {
  return useQuery({
    queryKey: ["reading-progress", bookId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: ReadingProgress | null }>(
        `/books/${bookId}/progress`,
      );
      return data.data;
    },
    enabled: Boolean(bookId),
    // The reader owns the live position while open; don't refetch under it.
    staleTime: Infinity,
  });
}

export function useSaveProgress(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { position: string; percent: number }) => {
      const { data } = await apiClient.put<{ data: ReadingProgress }>(
        `/books/${bookId}/progress`,
        input,
      );
      return data.data;
    },
    onSuccess: (progress) => {
      queryClient.setQueryData(["reading-progress", bookId], progress);
    },
  });
}

/** Raw-stream upload; the sniffed metadata comes back. */
export function useUploadBookFile(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data } = await apiClient.post<{ data: BookFileMeta }>(
        `/books/${bookId}/file`,
        file,
        {
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
        },
      );
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function useDeleteBookFile(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kind: BookFileKind) => {
      await apiClient.delete(`/books/${bookId}/file/${kind.toLowerCase()}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
