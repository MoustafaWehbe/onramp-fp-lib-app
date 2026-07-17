import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { DiscoveryReport, TasteProfile } from "../lib/types";

/** Past reports, newest first — powers D13's "Last report". */
export function useDiscoveryReports() {
  return useQuery({
    queryKey: ["discovery-reports"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: DiscoveryReport[] }>(
        "/ai/discovery-reports",
      );
      return data.data;
    },
  });
}

/** The standing taste profile. 404s until it's been refreshed at least once. */
export function useTasteProfile() {
  return useQuery({
    queryKey: ["taste-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: TasteProfile }>(
        "/ai/taste-profile",
      );
      return data.data;
    },
    retry: false, // a 404 here is "not built yet", not a transient failure
  });
}

/**
 * Generate a tailored discovery report. `moodModifier` is a one-time note laid
 * over the standing taste profile — it shapes this report only (design D14).
 * This is the slow call (the model writes each rationale), so the UI shows the
 * "Reading your shelf…" state while it runs.
 */
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moodModifier?: string) => {
      const { data } = await apiClient.post<{ data: DiscoveryReport }>(
        "/ai/discovery-report",
        moodModifier ? { moodModifier } : {},
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery-reports"] }),
  });
}

/** Recompute the rating-weighted taste vector from finished books. */
export function useRefreshTasteProfile() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        data: { refreshedAt: string; aggregatedData: unknown };
      }>("/ai/taste-profile/refresh");
      return data.data;
    },
  });
}
