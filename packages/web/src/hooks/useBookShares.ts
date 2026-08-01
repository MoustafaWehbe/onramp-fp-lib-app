import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { ReceivedBookShare, SentBookShare } from "../lib/types";

/** Design E18 — who already has a given book of mine. */
export function useBookShareList(bookId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["book-shares", "book", bookId],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: Omit<SentBookShare, "book">[];
      }>(`/books/${bookId}/shares`);
      return data.data;
    },
    enabled: Boolean(bookId) && enabled,
  });
}

/** Everything I've sent (the "Shared books" list with Take it back). */
export function useSentBookShares() {
  return useQuery({
    queryKey: ["book-shares", "sent"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: SentBookShare[] }>(
        "/book-shares/sent",
      );
      return data.data;
    },
  });
}

/** Books shared with me — metadata only; the page says so. */
export function useReceivedBookShares() {
  return useQuery({
    queryKey: ["book-shares", "received"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: ReceivedBookShare[] }>(
        "/book-shares/received",
      );
      return data.data;
    },
  });
}

export function useShareBook(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await apiClient.post<{
        data: { shareId: string; recipient: { name: string } };
      }>(`/books/${bookId}/share`, { email });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["book-shares"] });
    },
  });
}

export function useRevokeBookShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: string) => {
      await apiClient.delete(`/book-shares/${shareId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["book-shares"] });
    },
  });
}
