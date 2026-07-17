import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type {
  AccessLevel,
  Contributor,
  SharedShelf,
  ShelfShare,
} from "../lib/types";

/** Outgoing: people I share my shelves with. */
export function useContributors() {
  return useQuery({
    queryKey: ["contributors"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Contributor[] }>(
        "/contributors",
      );
      return data.data;
    },
  });
}

export interface PendingInvite {
  shelfId: string;
  name: string;
  description: string | null;
  accessLevel: AccessLevel;
  invitedAt: string;
  owner: { id: string; name: string };
}

/** Invites waiting on my answer. */
export function usePendingInvites() {
  return useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: PendingInvite[] }>(
        "/contributors/invites",
      );
      return data.data;
    },
  });
}

/** Incoming: shelves shared with me. Metadata only — never the owner's journal. */
export function useSharedWithMe() {
  return useQuery({
    queryKey: ["shared-with-me"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: SharedShelf[] }>(
        "/contributors/shelves",
      );
      return data.data;
    },
  });
}

export function useShelfShares(shelfId: string | undefined) {
  return useQuery({
    queryKey: ["shelf-shares", shelfId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: ShelfShare[] }>(
        `/shelves/${shelfId}/shares`,
      );
      return data.data;
    },
    enabled: Boolean(shelfId),
  });
}

export function useInviteContributor(shelfId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; accessLevel: AccessLevel }) => {
      const { data } = await apiClient.post<{ data: ShelfShare }>(
        `/shelves/${shelfId}/shares`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf-shares", shelfId] });
      qc.invalidateQueries({ queryKey: ["contributors"] });
    },
  });
}

export function useRevokeShare(shelfId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/shelves/${shelfId}/shares/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf-shares", shelfId] });
      qc.invalidateQueries({ queryKey: ["contributors"] });
    },
  });
}

/** Invitee accepts or declines their own pending invite. */
export function useRespondToInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shelfId,
      accept,
    }: {
      shelfId: string;
      accept: boolean;
    }) => {
      await apiClient.post(
        `/shelves/${shelfId}/shares/${accept ? "accept" : "decline"}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-with-me"] });
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });
}

/** WRITE contributors may add/remove their OWN books on a shared shelf. */
export function useSharedShelfBooks(shelfId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["shared-with-me"] });

  const add = useMutation({
    mutationFn: async (bookId: string) => {
      const { data } = await apiClient.post<{ data: SharedShelf }>(
        `/contributors/shelves/${shelfId}/books`,
        { bookId },
      );
      return data.data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (bookId: string) => {
      await apiClient.delete(`/contributors/shelves/${shelfId}/books/${bookId}`);
    },
    onSuccess: invalidate,
  });

  return { add, remove };
}
