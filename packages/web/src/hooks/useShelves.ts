import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { Shelf, ShelfWithBooks } from "../lib/types";

export function useShelves() {
  return useQuery({
    queryKey: ["shelves"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Shelf[] }>("/shelves");
      return data.data;
    },
  });
}

export function useShelf(id: string | undefined) {
  return useQuery({
    queryKey: ["shelf", id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: ShelfWithBooks }>(
        `/shelves/${id}`,
      );
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/**
 * The shelves a given book sits on (design B7, "On shelves"). There is no
 * per-book membership endpoint, so this walks the user's shelves and checks
 * each one's books — fine at personal-library scale, and it reuses the same
 * cached queries the shelf pages populate.
 */
export function useBookShelves(bookId: string | undefined) {
  return useQuery({
    queryKey: ["book-shelves", bookId],
    queryFn: async () => {
      const { data: list } = await apiClient.get<{ data: Shelf[] }>("/shelves");
      const details = await Promise.all(
        list.data.map((shelf) =>
          apiClient
            .get<{ data: ShelfWithBooks }>(`/shelves/${shelf.id}`)
            .then((r) => r.data.data),
        ),
      );
      return {
        all: list.data,
        member: details
          .filter((s) => s.books.some((b) => b.id === bookId))
          .map((s) => ({ id: s.id, name: s.name })),
      };
    },
    enabled: Boolean(bookId),
  });
}

export interface ShelfInput {
  name: string;
  description?: string;
}

export function useCreateShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ShelfInput) => {
      const { data } = await apiClient.post<{ data: Shelf }>("/shelves", input);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shelves"] }),
  });
}

export function useUpdateShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<ShelfInput> & { id: string }) => {
      const { data } = await apiClient.patch<{ data: Shelf }>(
        `/shelves/${id}`,
        input,
      );
      return data.data;
    },
    onSuccess: (shelf) => {
      qc.invalidateQueries({ queryKey: ["shelves"] });
      qc.invalidateQueries({ queryKey: ["shelf", shelf.id] });
    },
  });
}

export function useDeleteShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/shelves/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shelves"] }),
  });
}

export function useAddBookToShelf(shelfId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const { data } = await apiClient.post<{ data: ShelfWithBooks }>(
        `/shelves/${shelfId}/books`,
        { bookId },
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf", shelfId] });
      qc.invalidateQueries({ queryKey: ["shelves"] });
      qc.invalidateQueries({ queryKey: ["book-shelves"] });
    },
  });
}

/** Same as useAddBookToShelf, but the shelf is picked at call time (design B7). */
export function useAddBookToAnyShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shelfId,
      bookId,
    }: {
      shelfId: string;
      bookId: string;
    }) => {
      const { data } = await apiClient.post<{ data: ShelfWithBooks }>(
        `/shelves/${shelfId}/books`,
        { bookId },
      );
      return data.data;
    },
    onSuccess: (shelf) => {
      qc.invalidateQueries({ queryKey: ["shelf", shelf.id] });
      qc.invalidateQueries({ queryKey: ["shelves"] });
      qc.invalidateQueries({ queryKey: ["book-shelves"] });
    },
  });
}

export function useRemoveBookFromShelf(shelfId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      await apiClient.delete(`/shelves/${shelfId}/books/${bookId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf", shelfId] });
      qc.invalidateQueries({ queryKey: ["shelves"] });
      qc.invalidateQueries({ queryKey: ["book-shelves"] });
    },
  });
}
