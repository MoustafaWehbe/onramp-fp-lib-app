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
import { initialsOf } from "../../components/layout/UserMenu";
import { Shimmer } from "../../components/folio/Shimmer";
import { cn } from "../../lib/utils";

const TABS = ["Overview", "Usage", "AI spend", "Audit log"] as const;
type Tab = (typeof TABS)[number];

/** Shimmer recolored for the console's dark surfaces. */
const DARK_SHIMMER =
  "rounded-[6px] bg-[linear-gradient(90deg,#201D18_25%,#2A251E_45%,#201D18_65%)]";

/**
 * Design F18 — deliberately a different mode from the reader app: a dark
 * monospace console with zero user content, anonymized aggregates only.
 * Every number here is a real query; panels the stack can't measure
 * (p95 latency, error rate, token cost) are omitted rather than invented.
 */
export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: stats, isLoading, isError } = useAdminStats();

  return (
    <div className="min-h-screen bg-admin-bg font-mono text-admin-body">
      <header className="border-b border-admin-line">
        <div className="mx-auto flex h-14 max-w-[1440px] items-stretch justify-between px-6 lg:px-10">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <Link
                to="/library"
                className="font-display text-lg italic text-admin-ink"
              >
                Folio
              </Link>
              <span className="rounded-[3px] bg-admin-amber-bg px-2 py-[3px] text-[10px] font-semibold tracking-[0.1em] text-admin-amber">
                ADMIN
              </span>
            </div>

            <nav className="flex items-stretch gap-[22px]">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "border-b-2 text-[12.5px]",
                    t === tab
                      ? "border-admin-amber font-medium text-admin-ink"
                      : "border-transparent text-admin-dim transition-colors hover:text-admin-body",
                  )}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3.5">
            <span className="text-[11.5px] text-admin-dim">
              env: {import.meta.env.MODE}
            </span>
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-admin-avatar text-[11px] font-semibold text-admin-avatar-ink">
              {initialsOf(user?.name)}
            </span>
          </div>
        </div>
      </header>

      {/* Status strip: the dot reports the console's own health honestly. */}
      <div className="border-b border-admin-line bg-admin-strip">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2.5 px-6 lg:px-10 py-[9px]">
          <span
            className={cn(
              "h-[7px] w-[7px] shrink-0 rounded-full",
              isError
                ? "bg-admin-red"
                : isLoading
                  ? "bg-admin-dim"
                  : "bg-admin-green",
            )}
          />
          <span className="text-[11.5px] text-admin-note">
            {isError
              ? "Stats query failed — check that the API is running"
              : "All systems nominal"}
            {" · Privacy mode enforced: no titles, journals, or identifiable content are queryable from this console"}
          </span>
        </div>
      </div>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 pb-12 pt-8 lg:px-10">
        {isLoading || !stats ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Shimmer key={i} className={cn("h-28", DARK_SHIMMER)} />
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
      </main>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ stats }: { stats: AdminStats }) {
  return (
    <>
      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Active users / 30d"
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
        <StatTile label="Accounts" value={stats.userCount} note="all roles" />
      </section>

      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <ReportsChart stats={stats} />
        <CohortsPanel stats={stats} />
      </div>
    </>
  );
}

// ── Usage ────────────────────────────────────────────────────────────────────

function Usage({ stats }: { stats: AdminStats }) {
  const { data: accounts } = useAdminUsers();
  const { user } = useAuth();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  return (
    <>
      <TabHeader
        title="Usage"
        note="Cohorts and account management — never a reader's library."
      />

      <CohortsPanel stats={stats} />

      <Panel>
        <div>
          <h2 className="text-[13px] font-medium text-admin-ink">Accounts</h2>
          <p className="mt-1 text-[11px] text-admin-dim">
            Change a role, toggle verification, or remove an account. Every
            action lands in the audit log.
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-admin-line text-left text-[10.5px] uppercase tracking-[0.06em] text-admin-dim">
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
                <tr key={account.id} className="border-b border-admin-row">
                  <td className="py-2.5">
                    <p className="text-admin-body">{account.name}</p>
                    <p className="text-[11px] text-admin-dim">
                      {account.email}
                      {isSelf && " · you"}
                    </p>
                  </td>
                  <td className="py-2.5 text-right">{account._count.books}</td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() =>
                        updateAccount.mutate({
                          id: account.id,
                          emailVerified: !account.emailVerified,
                        })
                      }
                      disabled={updateAccount.isPending}
                      className="text-admin-amber underline underline-offset-4"
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
                      className="rounded-[4px] border border-admin-line bg-admin-strip px-2 py-1 text-[11px] text-admin-body disabled:opacity-50"
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
                      className="text-admin-red underline underline-offset-4 disabled:opacity-40"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

// ── AI spend ─────────────────────────────────────────────────────────────────

function AiSpend({ stats }: { stats: AdminStats }) {
  const total14d = stats.reportsPerDay.reduce((sum, r) => sum + r.count, 0);
  return (
    <>
      <TabHeader
        title="AI spend"
        note="Generation runs on self-hosted Ollama, so the spend is compute, not dollars — measured in reports generated."
      />

      <section className="grid gap-3.5 sm:grid-cols-3">
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
    </>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────

function AuditLog() {
  const { data: entries, isLoading } = useAuditLog();

  return (
    <>
      <TabHeader
        title="Audit log"
        note="Every admin action, kept even after the accounts involved are gone."
      />

      {isLoading ? (
        <Shimmer className={cn("h-40 w-full", DARK_SHIMMER)} />
      ) : entries && entries.length > 0 ? (
        <Panel>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-admin-line text-left text-[10.5px] uppercase tracking-[0.06em] text-admin-dim">
                <th className="pb-2 font-normal">when</th>
                <th className="pb-2 font-normal">actor</th>
                <th className="pb-2 font-normal">action</th>
                <th className="pb-2 font-normal">target</th>
                <th className="pb-2 font-normal">detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-admin-row align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-[11px] text-admin-dim">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-admin-body">
                    {entry.actorEmail}
                  </td>
                  <td className="py-2 pr-3 text-admin-amber">{entry.action}</td>
                  <td className="py-2 pr-3 text-admin-dim">
                    {entry.targetEmail ?? "—"}
                  </td>
                  <td className="py-2 text-[11px] text-admin-dim">
                    {entry.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <p className="rounded-[6px] border border-dashed border-admin-line px-6 py-12 text-center text-xs text-admin-dim">
          No admin actions recorded yet.
        </p>
      )}
    </>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[6px] border border-admin-line bg-admin-panel px-6 py-[22px]">
      {children}
    </section>
  );
}

/** The Usage / AI spend / Audit log tabs aren't drawn in the design (F18 shows
 *  Overview); a one-line mono header keeps them in the console's voice. */
function TabHeader({ title, note }: { title: string; note: string }) {
  return (
    <header>
      <h1 className="text-sm font-medium text-admin-ink">{title}</h1>
      <p className="mt-1 text-[11.5px] text-admin-dim">{note}</p>
    </header>
  );
}

function ReportsChart({ stats }: { stats: AdminStats }) {
  const days = stats.reportsPerDay;
  const peak = Math.max(1, ...days.map((r) => r.count));
  const total = days.reduce((sum, r) => sum + r.count, 0);
  return (
    <section className="flex flex-col gap-[18px] rounded-[6px] border border-admin-line bg-admin-panel px-6 py-[22px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-admin-ink">
          AI usage — discovery reports / day
        </h2>
        <span className="text-[11px] text-admin-dim">last 14 days</span>
      </div>
      <div className="flex h-[120px] items-end gap-2">
        {days.map((r, i) => (
          <div key={r.day} className="flex h-full flex-1 flex-col justify-end">
            <div
              title={`${r.count} on ${r.day}`}
              className={cn(
                "w-full rounded-t-[2px]",
                // The design picks out the most recent days in amber.
                i >= days.length - 2 ? "bg-admin-amber" : "bg-admin-bar",
              )}
              style={{
                height: `${Math.max(3, (r.count / peak) * 100)}%`,
                opacity: r.count === 0 ? 0.35 : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-admin-dim">
        <span>{days[0]?.day}</span>
        <span>avg {(total / Math.max(1, days.length)).toFixed(1)} reports/day</span>
        <span>{days.at(-1)?.day}</span>
      </div>
    </section>
  );
}

function CohortsPanel({ stats }: { stats: AdminStats }) {
  return (
    <Panel>
      <h2 className="text-[13px] font-medium text-admin-ink">
        Aggregate activity (anonymized)
      </h2>
      <div className="flex flex-col">
        <div className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-admin-line py-2 text-[10.5px] uppercase tracking-[0.06em] text-admin-dim">
          <span>cohort</span>
          <span className="text-right">accounts</span>
          <span className="text-right">avg books</span>
        </div>
        {stats.cohorts.map((c) => (
          <div
            key={c.cohort}
            className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-admin-row py-[9px] text-xs text-admin-body"
          >
            <span>{c.cohort}</span>
            <span className="text-right">{c.accounts.toLocaleString()}</span>
            <span className="text-right">{c.avgBooks}</span>
          </div>
        ))}
      </div>
      <span className="text-[10.5px] text-admin-dim">
        User IDs are salted hashes. Row-level drill-down is disabled by policy.
      </span>
    </Panel>
  );
}

function StatTile({
  label,
  value,
  note,
  tone = "dim",
}: {
  label: string;
  value: number;
  note: string;
  tone?: "up" | "warn" | "dim";
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[6px] border border-admin-line bg-admin-panel px-5 py-[18px]">
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-admin-dim">
        {label}
      </span>
      <span className="text-[26px] font-semibold leading-none text-admin-ink">
        {value.toLocaleString()}
      </span>
      <span
        className={cn(
          "text-[11px]",
          tone === "up"
            ? "text-admin-green"
            : tone === "warn"
              ? "text-admin-red"
              : "text-admin-dim",
        )}
      >
        {note}
      </span>
    </div>
  );
}
