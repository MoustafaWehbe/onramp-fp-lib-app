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
    },
  });
}
