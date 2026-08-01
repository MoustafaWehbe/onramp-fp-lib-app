import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { MemoryOverview, MemorySearchResult } from "../lib/types";

/** Design G19 hero counts — "34 entries, 21,400 words". */
export function useMemoryOverview() {
  return useQuery({
    queryKey: ["memory-overview"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: MemoryOverview }>(
        "/ai/memory/overview",
      );
      return data.data;
    },
  });
}

/**
 * Design G19 — search the reader's own reflections. A mutation, not a query:
 * searches aren't kept, so there's nothing to cache or refetch.
 */
export function useMemorySearch() {
  return useMutation({
    mutationFn: async (query: string) => {
      const { data } = await apiClient.post<{ data: MemorySearchResult }>(
        "/ai/memory/search",
        { query },
      );
      return data.data;
    },
  });
}
