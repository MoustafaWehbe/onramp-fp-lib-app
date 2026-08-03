import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { AnalyticsSummary } from "../lib/types";

/** Design C12 — the metrics summary. The route is /analytics/summary; the
 *  contract test (web-routes.test.ts) fails if this drifts from the API. */
export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AnalyticsSummary }>(
        "/analytics/summary",
      );
      return data.data;
    },
  });
}
