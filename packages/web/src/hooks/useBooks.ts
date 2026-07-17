import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { Book, JournalEntry, ReadingStatus } from "../lib/types";

export interface BookFilters {
  status?: ReadingStatus;
  genre?: string;
  author?: string;
  q?: string;
  sort?: string;
}

export interface BookInput {
  title: string;
  author: string;
  genre?: string;
  coverImage?: string;
  year?: number;
  pageCount?: number;
  status?: ReadingStatus;
}

/** Drop empty filter values so we don't send `?status=` and friends. */
function clean(filters: BookFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""),
  );
}

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

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/books/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

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

export interface JournalInput {
  reflectionText: string;
  favoriteQuotes?: string[];
  rating?: number;
}

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
