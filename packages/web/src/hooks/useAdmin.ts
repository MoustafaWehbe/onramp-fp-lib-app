import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  emailVerified: boolean;
  createdAt: string;
  _count: { books: number };
}

export interface AdminStats {
  userCount: number;
  bookCount: number;
  reportCount: number;
  signups7d: number;
  activeUsers30d: number;
  reportsPerDay: { day: string; count: number }[];
  cohorts: { cohort: string; accounts: number; avgBooks: number }[];
}

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetEmail: string | null;
  detail: string | null;
  createdAt: string;
}

export function useAuditLog() {
  return useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AuditEntry[] }>(
        "/admin/audit",
      );
      return data.data;
    },
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AdminStats }>(
        "/admin/stats",
      );
      return data.data;
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AdminAccount[] }>(
        "/admin/users",
      );
      return data.data;
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      role?: "user" | "admin";
      emailVerified?: boolean;
    }) => {
      const { data } = await apiClient.patch<{ data: AdminAccount }>(
        `/admin/users/${id}`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/users/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
  });
}
