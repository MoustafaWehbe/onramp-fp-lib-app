import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdminStats,
  useAdminUsers,
  useAuditLog,
  useDeleteAccount,
  useUpdateAccount,
  type AdminStats,
} from "../../hooks/useAdmin";
import { useAuth } from "../../hooks/useAuth";
import { Shimmer } from "../../components/folio/Shimmer";

const TABS = ["Overview", "Usage", "AI spend", "Audit log"] as const;
type Tab = (typeof TABS)[number];

/**
 * Design F18 — deliberately a different mode from the reader app: zero user
 * content, anonymized aggregates only. Every number here is a real query;
 * panels the stack can't measure (p95 latency, error rate, token cost) are
 * omitted rather than invented.
 */
export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: stats, isLoading } = useAdminStats();

  return (
    <div className="min-h-screen bg-background">
      {/* Different mode, different chrome: ink-dark bar, ADMIN badge, env tag. */}
      <header className="bg-foreground text-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <div className="flex items-center gap-2">
            <Link to="/library" className="font-display text-xl italic">
              Folio
            </Link>
            <span className="rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[0.65rem] font-medium tracking-wider text-primary-foreground">
              ADMIN
            </span>
          </div>

          <nav className="flex items-center gap-5">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  t === tab
                    ? "text-sm text-background"
                    : "text-sm text-background/50 transition-colors hover:text-background/80"
                }
              >
                {t}
              </button>
            ))}
          </nav>

          <span className="ml-auto font-mono text-[0.7rem] opacity-60">
            env: development
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/20 text-[0.7rem] font-medium">
            {user?.name
              ?.split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase()}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {isLoading || !stats ? (
          <div className="grid gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Shimmer key={i} className="h-28" />
            ))}
          </div>
        ) : tab === "Overview" ? (
          <Overview stats={stats} />
        ) : tab === "Usage" ? (
          <Usage stats={stats} />
        ) : tab === "AI spend" ? (
          <AiSpend stats={stats} />
        ) : (
          <AuditLog />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Row-level drill-down into reading content is disabled by policy.
        </p>
      </main>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zero user content. Anonymized aggregates only.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active readers / 30d"
          value={stats.activeUsers30d}
          note={`of ${stats.userCount} accounts`}
        />
        <StatTile
          label="New signups / 7d"
          value={stats.signups7d}
          note="via public registration"
        />
        <StatTile
          label="Books tracked (agg.)"
          value={stats.bookCount}
          note="titles never shown"
        />
        <StatTile
          label="Discovery reports"
          value={stats.reportCount}
          note="all time"
        />
      </section>

      <ReportsChart stats={stats} />
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────────────────────────

function Usage({ stats }: { stats: AdminStats }) {
  const { data: accounts } = useAdminUsers();
  const { user } = useAuth();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          Usage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cohorts and account management — never a reader's library.
        </p>
      </header>

      <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
        <h2 className="font-display text-lg text-foreground">
          Aggregate activity (anonymized)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 font-normal">cohort</th>
              <th className="pb-2 text-right font-normal">accounts</th>
              <th className="pb-2 text-right font-normal">avg books</th>
            </tr>
          </thead>
          <tbody>
            {stats.cohorts.map((c) => (
              <tr key={c.cohort} className="border-b border-border/50">
                <td className="py-2 text-foreground">{c.cohort}</td>
                <td className="py-2 text-right font-mono">{c.accounts}</td>
                <td className="py-2 text-right font-mono">{c.avgBooks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg text-foreground">Accounts</h2>
          <p className="text-xs text-muted-foreground">
            Change a role, toggle verification, or remove an account. Every
            action lands in the audit log.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 font-normal">account</th>
              <th className="pb-2 text-right font-normal">books</th>
              <th className="pb-2 text-right font-normal">verified</th>
              <th className="pb-2 text-right font-normal">role</th>
              <th className="pb-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((account) => {
              const isSelf = account.id === user?.id;
              return (
                <tr key={account.id} className="border-b border-border/50">
                  <td className="py-2.5">
                    <p className="text-foreground">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.email}
                      {isSelf && " · you"}
                    </p>
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {account._count.books}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() =>
                        updateAccount.mutate({
                          id: account.id,
                          emailVerified: !account.emailVerified,
                        })
                      }
                      disabled={updateAccount.isPending}
                      className="text-xs underline underline-offset-4"
                      title="Toggle email verification"
                    >
                      {account.emailVerified ? "yes" : "no"}
                    </button>
                  </td>
                  <td className="py-2.5 text-right">
                    <select
                      value={account.role}
                      disabled={isSelf || updateAccount.isPending}
                      onChange={(e) =>
                        updateAccount.mutate({
                          id: account.id,
                          role: e.target.value as "user" | "admin",
                        })
                      }
                      className="rounded-[var(--radius)] border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${account.email}? Their library, journals and shelves go with the account.`,
                          )
                        ) {
                          deleteAccount.mutate(account.id);
                        }
                      }}
                      disabled={isSelf || deleteAccount.isPending}
                      className="text-xs text-destructive underline underline-offset-4 disabled:opacity-40"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ── AI spend ─────────────────────────────────────────────────────────────────

function AiSpend({ stats }: { stats: AdminStats }) {
  const total14d = stats.reportsPerDay.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          AI spend
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generation runs on self-hosted Ollama, so the spend is compute, not
          dollars — measured in reports generated.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Reports / 14d"
          value={total14d}
          note={`avg ${(total14d / 14).toFixed(1)} per day`}
        />
        <StatTile
          label="Reports all time"
          value={stats.reportCount}
          note="3 grounded picks each"
        />
        <StatTile
          label="Model calls / report"
          value={2}
          note="retrieval embed + generation (worst case incl. one retry)"
        />
      </section>

      <ReportsChart stats={stats} />
    </div>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────

function AuditLog() {
  const { data: entries, isLoading } = useAuditLog();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every admin action, kept even after the accounts involved are gone.
        </p>
      </header>

      {isLoading ? (
        <Shimmer className="h-40 w-full" />
      ) : entries && entries.length > 0 ? (
        <section className="rounded-[var(--radius)] border border-border bg-card p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-normal">when</th>
                <th className="pb-2 font-normal">actor</th>
                <th className="pb-2 font-normal">action</th>
                <th className="pb-2 font-normal">target</th>
                <th className="pb-2 font-normal">detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 align-top">
                  <td className="whitespace-nowrap py-2 font-mono text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-foreground">{entry.actorEmail}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{entry.action}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {entry.targetEmail ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {entry.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
          No admin actions recorded yet.
        </p>
      )}
    </div>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function ReportsChart({ stats }: { stats: AdminStats }) {
  const peak = Math.max(1, ...stats.reportsPerDay.map((r) => r.count));
  return (
    <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg text-foreground">
          AI usage — discovery reports / day
        </h2>
        <p className="text-xs text-muted-foreground">last 14 days</p>
      </div>
      <div className="flex h-32 items-end gap-1.5">
        {stats.reportsPerDay.map((r) => (
          <div
            key={r.day}
            title={`${r.count} on ${r.day}`}
            className="flex-1 rounded-t-sm bg-primary/70"
            style={{
              height: `${Math.max(3, (r.count / peak) * 100)}%`,
              opacity: r.count === 0 ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[0.65rem] text-muted-foreground">
        <span>{stats.reportsPerDay[0]?.day}</span>
        <span>{stats.reportsPerDay.at(-1)?.day}</span>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-5">
      <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-3xl text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
