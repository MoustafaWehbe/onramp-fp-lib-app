import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { AnalyticsSummary } from "../lib/types";

export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AnalyticsSummary }>(
        "/analytics",
      );
      return data.data;
    },
  });
}
