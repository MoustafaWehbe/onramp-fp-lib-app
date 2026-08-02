import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdminStats,
  useAdminUsers,
  useAuditLog,
  useDeleteAccount,
  useUpdateAccount,
  type AdminAccount,
  type AdminStats,
  type AuditEntry,
} from "../../hooks/useAdmin";
import { useAuth } from "../../hooks/useAuth";
import { initialsOf } from "../../components/layout/UserMenu";
import { Shimmer } from "../../components/folio/Shimmer";
import { cn } from "../../lib/utils";

const TABS = ["Overview", "Usage", "Accounts", "AI spend", "Audit log"] as const;
type Tab = (typeof TABS)[number];

/** Shimmer recolored for the console's dark surfaces. */
const DARK_SHIMMER =
  "rounded-[6px] bg-[linear-gradient(90deg,#201D18_25%,#2A251E_45%,#201D18_65%)]";

/**
 * F18 status registers. Bad news never edits the nominal line — it changes
 * state: degraded names the failing subsystem and its cost; offline dates the
 * snapshot, disables writes, and keeps the retry visible.
 */
type ConsoleStatus =
  | { kind: "nominal"; checkedAt: number }
  | { kind: "degraded"; message: string }
  | { kind: "offline"; snapshotAt: number | null };

/**
 * Design F18 — deliberately a different mode from the reader app: a dark
 * monospace console with zero user content, anonymized aggregates only. The
 * privacy pledge in Newsreader italic is the single thread back to the app
 * (frame 0's divergence decision). Every number is a real query; panels the
 * stack can't measure (p95 latency, token dollars) are omitted, not invented.
 */
export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  const statsQ = useAdminStats();
  const usersQ = useAdminUsers();
  const auditQ = useAuditLog();

  const stats = statsQ.data;

  // Status is derived from the console's own queries, honestly: stats down
  // with a cached snapshot = offline-with-stale; a side query down while
  // stats answer = degraded; otherwise nominal.
  const status: ConsoleStatus = statsQ.isError
    ? { kind: "offline", snapshotAt: stats ? statsQ.dataUpdatedAt : null }
    : usersQ.isError || auditQ.isError
      ? {
          kind: "degraded",
          message: `${usersQ.isError ? "Accounts" : "Audit log"} query failing — that tab is stale or empty. Everything else is live.`,
        }
      : { kind: "nominal", checkedAt: statsQ.dataUpdatedAt };

  const offline = status.kind === "offline";

  function retryAll() {
    void statsQ.refetch();
    void usersQ.refetch();
    void auditQ.refetch();
  }

  return (
    <div className="min-h-screen bg-admin-bg font-mono text-admin-body">
      <header className="border-b border-admin-line">
        <div className="mx-auto flex h-14 max-w-[1440px] items-stretch justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-4 sm:gap-8">
            <div className="flex shrink-0 items-center gap-2.5">
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

            {/* Five tabs don't fit a phone; the nav scrolls inside itself. */}
            <nav className="flex items-stretch gap-[18px] overflow-x-auto whitespace-nowrap sm:gap-[22px]">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "border-b-2 text-[12.5px]",
                    t === tab
                      ? "border-admin-amber font-medium text-admin-ink"
                      : "border-transparent text-admin-dim transition-colors duration-instant hover:text-admin-body",
                  )}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3.5">
            <span className="hidden text-[11.5px] text-admin-dim sm:inline">
              env: {import.meta.env.MODE}
            </span>
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-admin-avatar text-[11px] font-semibold text-admin-avatar-ink">
              {initialsOf(user?.name)}
            </span>
          </div>
        </div>
      </header>

      <StatusStrip status={status} onRetry={retryAll} />
      <PrivacyStrip />

      <main className="mx-auto flex max-w-[1440px] flex-col gap-7 px-4 pb-12 pt-8 sm:px-6 lg:px-10">
        {statsQ.isError && !stats ? (
          // No snapshot to show — the one state with nothing truthful to render.
          <div className="flex flex-col items-start gap-4 rounded-[6px] border border-[#3A241C] bg-admin-panel px-6 py-14">
            <p className="text-[13px] text-admin-body">
              Can&rsquo;t reach the Folio API, and no snapshot is cached.
            </p>
            <p className="font-sans text-xs text-admin-dim">
              The console never pretends — nothing renders until a query
              answers.
            </p>
            <RetryButton onClick={retryAll} />
          </div>
        ) : statsQ.isLoading || !stats ? (
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Shimmer key={i} className={cn("h-28", DARK_SHIMMER)} />
            ))}
          </div>
        ) : tab === "Overview" ? (
          <Overview stats={stats} stale={offline} staleAt={statsQ.dataUpdatedAt} />
        ) : tab === "Usage" ? (
          <Usage stats={stats} stale={offline} staleAt={statsQ.dataUpdatedAt} />
        ) : tab === "Accounts" ? (
          <Accounts
            accounts={usersQ.data}
            loading={usersQ.isLoading}
            failed={usersQ.isError && !usersQ.data}
            writesDisabled={offline}
            onRetry={() => void usersQ.refetch()}
          />
        ) : tab === "AI spend" ? (
          <AiSpend stats={stats} stale={offline} staleAt={statsQ.dataUpdatedAt} />
        ) : (
          <AuditLog
            entries={auditQ.data}
            loading={auditQ.isLoading}
            failed={auditQ.isError && !auditQ.data}
            onRetry={() => void auditQ.refetch()}
          />
        )}
      </main>
    </div>
  );
}

// ── Status system (F18) ──────────────────────────────────────────────────────

function StatusStrip({
  status,
  onRetry,
}: {
  status: ConsoleStatus;
  onRetry: () => void;
}) {
  if (status.kind === "degraded") {
    return (
      <div className="border-b border-[#4A3A28] bg-[#2A2418]">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-[9px] sm:px-6 lg:px-10">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-admin-amber" />
          <span className="shrink-0 rounded-[3px] bg-admin-amber-bg px-[7px] py-[2px] text-[8.5px] font-semibold tracking-[0.12em] text-admin-amber">
            DEGRADED
          </span>
          <span className="flex-1 text-[11.5px] text-admin-body">
            {status.message}
          </span>
        </div>
      </div>
    );
  }

  if (status.kind === "offline") {
    return (
      <div className="border-b border-[#3A241C] bg-[#2A1B16]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-[9px] sm:px-6 lg:px-10">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-admin-red" />
          <span className="shrink-0 rounded-[3px] bg-[#3A241C] px-[7px] py-[2px] text-[8.5px] font-semibold tracking-[0.12em] text-admin-red">
            OFFLINE
          </span>
          <span className="flex-1 text-[11.5px] text-admin-body">
            Console can&rsquo;t reach the Folio API
            {status.snapshotAt
              ? ` — showing the ${utcHm(status.snapshotAt)} UTC snapshot. Writes disabled.`
              : ". Writes disabled."}
          </span>
          <button
            onClick={onRetry}
            className="text-[11px] font-medium text-admin-red underline underline-offset-4"
          >
            retry now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-admin-line bg-admin-strip">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-[9px] sm:px-6 lg:px-10">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-admin-green" />
        <span className="text-[11.5px] text-admin-body">
          All systems nominal
        </span>
        <span className="hidden text-[11px] text-admin-dim sm:inline">
          api reachable · queue not measured here · checked{" "}
          {agoLabel(status.checkedAt)}
        </span>
      </div>
    </div>
  );
}

/** The privacy pledge, promoted to its own strip: the chip is mono and
 *  hard-edged; the sentence is Newsreader italic — the one thread back to
 *  the reading app (frame 0's divergence decision). */
function PrivacyStrip() {
  return (
    <div className="border-b border-admin-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-[13px] sm:flex-row sm:items-center sm:gap-3.5 sm:px-6 lg:px-10">
        <span className="w-fit shrink-0 rounded-[3px] border border-[#4A3A28] px-2 py-[3px] text-[9px] font-semibold tracking-[0.14em] text-admin-amber">
          PRIVACY MODE · HARD-LOCKED
        </span>
        <span className="font-display text-[15px] italic leading-snug text-admin-avatar-ink">
          No titles, journals, or identifiable content are queryable from this
          console.
        </span>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({
  stats,
  stale,
  staleAt,
}: {
  stats: AdminStats;
  stale: boolean;
  staleAt: number;
}) {
  return (
    <div className="animate-settle flex flex-col gap-7">
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <StatTile
          label="Active users / 30d"
          value={stats.activeUsers30d}
          note={`of ${stats.userCount} accounts`}
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="New signups / 7d"
          value={stats.signups7d}
          note="via public registration"
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Books tracked (agg.)"
          value={stats.bookCount}
          note="titles never shown"
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Discovery reports"
          value={stats.reportCount}
          note="all time"
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Accounts"
          value={stats.userCount}
          note="all roles"
          stale={stale}
          staleAt={staleAt}
        />
      </section>

      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <ReportsChart stats={stats} />
        <CohortsPanel stats={stats} />
      </div>
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────────────────────────

function Usage({
  stats,
  stale,
  staleAt,
}: {
  stats: AdminStats;
  stale: boolean;
  staleAt: number;
}) {
  return (
    <div className="animate-settle flex flex-col gap-7">
      <TabHeader
        title="Usage"
        note="Anonymized cohorts and report volume — never a reader's library."
      />
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <StatTile
          label="Active users / 30d"
          value={stats.activeUsers30d}
          note={`of ${stats.userCount} accounts`}
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Books tracked (agg.)"
          value={stats.bookCount}
          note="counts only, ever"
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="New signups / 7d"
          value={stats.signups7d}
          note="via public registration"
          stale={stale}
          staleAt={staleAt}
        />
      </section>
      <CohortsPanel stats={stats} />
      <ReportsChart stats={stats} />
    </div>
  );
}

// ── Accounts ─────────────────────────────────────────────────────────────────

function Accounts({
  accounts,
  loading,
  failed,
  writesDisabled,
  onRetry,
}: {
  accounts: AdminAccount[] | undefined;
  loading: boolean;
  failed: boolean;
  writesDisabled: boolean;
  onRetry: () => void;
}) {
  const { user } = useAuth();
  const updateAccount = useUpdateAccount();
  const [arming, setArming] = useState<AdminAccount | null>(null);

  if (failed) {
    return (
      <ConsoleFailure
        label="accounts · unreachable"
        line="The accounts query isn't answering. No account data is shown rather than stale rows without a date."
        onRetry={onRetry}
      />
    );
  }

  if (loading || !accounts) {
    return <TableSkeleton label="accounts · loading" />;
  }

  return (
    <div className="animate-settle flex flex-col gap-7">
      <TabHeader
        title="Accounts"
        note="Change a role, toggle verification, or remove an account. Every action lands in the audit log before it executes."
      />

      <Panel>
        {/* ≥sm: the table. Numbers right, text left, nothing centred. */}
        <div className="hidden flex-col sm:flex">
          <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_0.5fr] gap-4 border-b border-admin-line pb-2 text-[10px] uppercase tracking-[0.08em] text-admin-dim">
            <span>account</span>
            <span className="text-right">books</span>
            <span className="text-right">verified</span>
            <span className="text-right">role</span>
            <span />
          </div>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isSelf={account.id === user?.id}
              writesDisabled={writesDisabled}
              onArmDelete={() => setArming(account)}
              update={updateAccount}
            />
          ))}
        </div>

        {/* <sm: entry cards, stacked by reading priority (F18 mobile rule). */}
        <div className="flex flex-col gap-2.5 sm:hidden">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              isSelf={account.id === user?.id}
              writesDisabled={writesDisabled}
              onArmDelete={() => setArming(account)}
              update={updateAccount}
            />
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-2 rounded-[6px] border border-[#3A241C] bg-[rgba(217,139,104,.05)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-[3px] bg-[#3A241C] px-[7px] py-[2px] text-[8.5px] font-semibold tracking-[0.12em] text-admin-red">
            DESTRUCTIVE
          </span>
          <span className="font-sans text-xs text-admin-note">
            Deletion is two steps with typed confirmation, logged before
            execution. No undo exists anywhere in the system.
          </span>
        </div>
      </div>

      {arming && (
        <ArmDeleteDialog
          account={arming}
          onClose={() => setArming(null)}
        />
      )}
    </div>
  );
}

function AccountRow({
  account,
  isSelf,
  writesDisabled,
  onArmDelete,
  update,
}: {
  account: AdminAccount;
  isSelf: boolean;
  writesDisabled: boolean;
  onArmDelete: () => void;
  update: ReturnType<typeof useUpdateAccount>;
}) {
  return (
    <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_0.5fr] items-baseline gap-4 border-b border-admin-row py-2.5 text-xs">
      <div className="min-w-0">
        <p className="truncate text-admin-body">{account.name}</p>
        <p className="truncate text-[11px] text-admin-dim">
          {account.email}
          {isSelf && " · you"}
        </p>
      </div>
      <span className="text-right text-admin-body">{account._count.books}</span>
      <span className="text-right">
        <button
          onClick={() =>
            update.mutate({
              id: account.id,
              emailVerified: !account.emailVerified,
            })
          }
          disabled={writesDisabled || update.isPending}
          className="text-admin-amber underline underline-offset-4 disabled:opacity-40"
          title="Toggle email verification"
        >
          {account.emailVerified ? "yes" : "no"}
        </button>
      </span>
      <span className="text-right">
        <select
          value={account.role}
          disabled={isSelf || writesDisabled || update.isPending}
          onChange={(e) =>
            update.mutate({
              id: account.id,
              role: e.target.value as "user" | "admin",
            })
          }
          className="rounded-[4px] border border-admin-line bg-admin-strip px-2 py-1 text-[11px] text-admin-body disabled:opacity-50"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </span>
      <span className="text-right">
        <button
          onClick={onArmDelete}
          disabled={isSelf || writesDisabled}
          className="text-admin-red underline underline-offset-4 disabled:opacity-40"
        >
          delete…
        </button>
      </span>
    </div>
  );
}

function AccountCard({
  account,
  isSelf,
  writesDisabled,
  onArmDelete,
  update,
}: {
  account: AdminAccount;
  isSelf: boolean;
  writesDisabled: boolean;
  onArmDelete: () => void;
  update: ReturnType<typeof useUpdateAccount>;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[6px] border border-admin-line bg-admin-strip px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[12.5px] text-admin-body">
          {account.name}
          {isSelf && <span className="text-admin-dim"> · you</span>}
        </p>
        <span className="shrink-0 text-[11px] text-admin-dim">
          {account._count.books} books
        </span>
      </div>
      <p className="truncate text-[11px] text-admin-dim">{account.email}</p>
      <div className="flex min-h-[44px] items-center gap-4">
        <button
          onClick={() =>
            update.mutate({
              id: account.id,
              emailVerified: !account.emailVerified,
            })
          }
          disabled={writesDisabled || update.isPending}
          className="text-[11.5px] text-admin-amber underline underline-offset-4 disabled:opacity-40"
        >
          verified: {account.emailVerified ? "yes" : "no"}
        </button>
        <select
          value={account.role}
          disabled={isSelf || writesDisabled || update.isPending}
          onChange={(e) =>
            update.mutate({
              id: account.id,
              role: e.target.value as "user" | "admin",
            })
          }
          className="rounded-[4px] border border-admin-line bg-admin-panel px-2 py-1.5 text-[11px] text-admin-body disabled:opacity-50"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button
          onClick={onArmDelete}
          disabled={isSelf || writesDisabled}
          className="ml-auto text-[11.5px] text-admin-red underline underline-offset-4 disabled:opacity-40"
        >
          delete…
        </button>
      </div>
    </div>
  );
}

/**
 * F18a two-step typed confirm: the operator types the target email to arm the
 * action; execution stays disabled until it matches exactly. The red pair is
 * reserved for destruction alone. Arriving pattern on the surface (0M).
 */
function ArmDeleteDialog({
  account,
  onClose,
}: {
  account: AdminAccount;
  onClose: () => void;
}) {
  const deleteAccount = useDeleteAccount();
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);
  const armed = typed.trim() === account.email;

  async function execute() {
    if (!armed || deleteAccount.isPending) return;
    setFailed(false);
    try {
      await deleteAccount.mutateAsync(account.id);
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <div
      className="animate-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Delete account ${account.email}`}
    >
      <div
        className="animate-arrive w-full max-w-[560px] overflow-hidden rounded-[8px] border border-[#3A2E22] bg-admin-panel font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] bg-[#8C3B31]" />
        <div className="flex flex-col gap-4 px-7 py-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[14.5px] font-semibold text-admin-ink">
              Delete account {account.email}
            </span>
            <span className="shrink-0 rounded-[3px] bg-[#3A241C] px-[7px] py-[2px] text-[8.5px] font-semibold tracking-[0.12em] text-admin-red">
              DESTRUCTIVE
            </span>
          </div>
          <p className="font-sans text-[13px] leading-relaxed text-admin-note">
            Removes the account and everything it holds — {account._count.books}{" "}
            {account._count.books === 1 ? "book" : "books"}, every shelf, every
            journal word. Nothing is retained, so nothing can be restored.
          </p>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="arm-delete"
              className="text-[10px] uppercase tracking-[0.1em] text-admin-dim"
            >
              Type the account email to arm deletion
            </label>
            <input
              id="arm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={account.email}
              className="rounded-[4px] border border-[#4A3A28] bg-admin-bg px-3 py-2.5 text-[12.5px] text-admin-ink outline-none placeholder:text-admin-dim/50"
            />
          </div>
          {failed && (
            <p className="font-sans text-xs text-admin-red">
              The deletion didn&rsquo;t execute — the account is untouched. Try
              again.
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <button
              onClick={onClose}
              className="rounded-[4px] border border-admin-line px-4 py-2 text-[11.5px] font-medium text-admin-body"
            >
              Cancel
            </button>
            <button
              onClick={() => void execute()}
              disabled={!armed || deleteAccount.isPending}
              className="rounded-[4px] bg-[#8C3B31] px-4 py-2.5 text-[11.5px] font-semibold text-[#FBF0EC] disabled:opacity-40"
            >
              {deleteAccount.isPending
                ? "Deleting…"
                : "Delete account and all its data"}
            </button>
          </div>
          <p className="border-t border-admin-line pt-3 text-[10.5px] leading-relaxed text-admin-dim">
            audit: the action logs before it runs · unreachable by keyboard
            shortcut
          </p>
        </div>
      </div>
    </div>
  );
}

// ── AI spend ─────────────────────────────────────────────────────────────────

function AiSpend({
  stats,
  stale,
  staleAt,
}: {
  stats: AdminStats;
  stale: boolean;
  staleAt: number;
}) {
  const total14d = stats.reportsPerDay.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="animate-settle flex flex-col gap-7">
      <TabHeader
        title="AI spend"
        note="Generation runs on self-hosted Ollama, so the spend is compute, not dollars — measured in reports generated."
      />

      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <StatTile
          label="Reports / 14d"
          value={total14d}
          note={`avg ${(total14d / 14).toFixed(1)} per day`}
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Reports all time"
          value={stats.reportCount}
          note="3 grounded picks each"
          stale={stale}
          staleAt={staleAt}
        />
        <StatTile
          label="Model calls / report"
          value={2}
          note="retrieval embed + generation (worst case incl. one retry)"
          stale={stale}
          staleAt={staleAt}
        />
      </section>

      <ReportsChart stats={stats} />
    </div>
  );
}

// ── Audit log (F18a) ─────────────────────────────────────────────────────────

type AuditWindow = "24h" | "7d" | "all";

/** Colour carries class: grey reads, gold writes, red destruction. */
function actionClass(action: string): "read" | "write" | "destructive" {
  if (action.includes("delete")) return "destructive";
  if (/login|logout|view|read|list/.test(action)) return "read";
  return "write";
}

function withinWindow(entry: AuditEntry, window: AuditWindow): boolean {
  if (window === "all") return true;
  const ms = window === "24h" ? 86_400_000 : 7 * 86_400_000;
  return Date.now() - new Date(entry.createdAt).getTime() <= ms;
}

function AuditLog({
  entries,
  loading,
  failed,
  onRetry,
}: {
  entries: AuditEntry[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const [window_, setWindow] = useState<AuditWindow>("24h");
  const [destructiveOnly, setDestructiveOnly] = useState(false);

  const visible = useMemo(
    () =>
      (entries ?? []).filter(
        (e) =>
          withinWindow(e, window_) &&
          (!destructiveOnly || actionClass(e.action) === "destructive"),
      ),
    [entries, window_, destructiveOnly],
  );

  if (failed) {
    return (
      <ConsoleFailure
        label="audit log · unreachable"
        line="The audit query isn't answering. The log is never partially shown — it's the record of record."
        onRetry={onRetry}
      />
    );
  }

  if (loading || !entries) {
    return <TableSkeleton label="audit log · loading" />;
  }

  return (
    <div className="animate-settle flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-medium text-admin-ink">Audit log</h1>
        <p className="font-sans text-[11.5px] text-admin-dim">
          Every console action lands here before it executes — kept even after
          the accounts involved are gone.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["24h", "7d", "all"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={cn(
              "min-h-[32px] rounded-[4px] border px-3 text-[11px]",
              window_ === w
                ? "border-admin-amber-bg bg-admin-amber-bg text-admin-amber"
                : "border-admin-line bg-admin-panel text-admin-body",
            )}
          >
            {w === "24h" ? "Last 24h" : w === "7d" ? "Last 7 days" : "All time"}
          </button>
        ))}
        <button
          onClick={() => setDestructiveOnly((d) => !d)}
          className={cn(
            "min-h-[32px] rounded-[4px] border px-3 text-[11px]",
            destructiveOnly
              ? "border-[#3A241C] bg-[#3A241C] text-admin-red"
              : "border-[#3A241C] bg-transparent text-admin-red",
          )}
        >
          destructive only
        </button>
      </div>

      {visible.length === 0 ? (
        // F18 audit-empty: for an audit log, empty is the good outcome.
        <div className="flex flex-col items-start gap-2.5 rounded-[6px] border border-dashed border-[#3A342B] px-6 py-8">
          <p className="text-[13.5px] font-medium text-admin-body">
            No entries in this window.
          </p>
          <p className="font-sans text-xs leading-relaxed text-admin-dim">
            Nothing administrative happened — for an audit log, empty is the
            good outcome.
          </p>
          {window_ !== "all" && (
            <button
              onClick={() => setWindow(window_ === "24h" ? "7d" : "all")}
              className="mt-1 rounded-[4px] border border-admin-line px-3.5 py-2 text-[11px] font-medium text-admin-body"
            >
              {window_ === "24h" ? "Widen to 7 days" : "Widen to all time"}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ≥sm — the five-column rule: typography by data type. */}
          <div className="hidden flex-col sm:flex">
            <div className="grid grid-cols-[150px_150px_170px_150px_1fr] gap-5 border-b border-admin-line px-3.5 pb-2 text-[10px] uppercase tracking-[0.08em] text-admin-dim">
              <span>timestamp · utc</span>
              <span>actor</span>
              <span>action</span>
              <span>target</span>
              <span>detail</span>
            </div>
            {visible.map((entry) => {
              const kind = actionClass(entry.action);
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "grid min-h-[40px] grid-cols-[150px_150px_170px_150px_1fr] items-baseline gap-5 border-b border-admin-row px-3.5 py-[11px]",
                    // Destruction is the only row with a background.
                    kind === "destructive" && "bg-[rgba(217,139,104,.07)]",
                  )}
                >
                  {/* timestamps: mono, muted, UTC, scanned not read */}
                  <span className="whitespace-nowrap text-[11px] text-admin-dim">
                    {utcStamp(entry.createdAt)}
                  </span>
                  {/* identifiers: mono, one step brighter, never names —
                      the emails here are admin actors, weight marks them */}
                  <span className="truncate text-[11.5px] font-medium text-admin-body">
                    {entry.actorEmail}
                  </span>
                  {/* actions: colour carries class, weight never bolds alone */}
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[11.5px]",
                        kind === "destructive"
                          ? "font-medium text-admin-red"
                          : kind === "write"
                            ? "font-medium text-admin-amber"
                            : "text-admin-dim",
                      )}
                    >
                      {entry.action}
                    </span>
                    {kind === "destructive" && <DestructiveChip />}
                  </span>
                  <span className="truncate text-[11.5px] text-admin-body">
                    {entry.targetEmail ?? "—"}
                  </span>
                  {/* prose: the one column written for a human. Wraps. */}
                  <span className="font-sans text-[12.5px] leading-normal text-admin-note">
                    {entry.detail ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* <sm — entry cards: action first, who → what, then the sentence. */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {visible.map((entry) => {
              const kind = actionClass(entry.action);
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-[6px] border px-4 py-3",
                    kind === "destructive"
                      ? "border-[#3A241C] bg-[#261A16]"
                      : "border-admin-line bg-admin-panel",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[11.5px]",
                          kind === "destructive"
                            ? "font-medium text-admin-red"
                            : kind === "write"
                              ? "font-medium text-admin-amber"
                              : "text-admin-dim",
                        )}
                      >
                        {entry.action}
                      </span>
                      {kind === "destructive" && <DestructiveChip />}
                    </span>
                    {/* HH:MM on the phone; the full stamp rides the tap. */}
                    <span
                      title={utcStamp(entry.createdAt)}
                      className="shrink-0 text-[10px] text-admin-dim"
                    >
                      {utcHm(new Date(entry.createdAt).getTime())}
                    </span>
                  </div>
                  <span className="truncate text-[10.5px] text-admin-dim">
                    {entry.actorEmail} → {entry.targetEmail ?? "—"}
                  </span>
                  {entry.detail && (
                    <span className="font-sans text-xs leading-relaxed text-admin-note">
                      {entry.detail}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <span className="font-sans text-[11.5px] text-admin-dim">
            {visible.length} of {entries.length} entries shown.
          </span>
        </>
      )}
    </div>
  );
}

function DestructiveChip() {
  return (
    <span className="shrink-0 rounded-[3px] bg-[#3A241C] px-1.5 py-[2px] text-[8px] font-semibold tracking-[0.12em] text-admin-red">
      DESTRUCTIVE
    </span>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[6px] border border-admin-line bg-admin-panel px-4 py-[22px] sm:px-6">
      {children}
    </section>
  );
}

function TabHeader({ title, note }: { title: string; note: string }) {
  return (
    <header>
      <h1 className="text-sm font-medium text-admin-ink">{title}</h1>
      <p className="mt-1 font-sans text-[11.5px] text-admin-dim">{note}</p>
    </header>
  );
}

/** F18 loading, console idiom: content-shaped rows, same clock as the app. */
function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-[10px] uppercase tracking-[0.1em] text-admin-dim">
        {label}
      </span>
      <div className="flex flex-col">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[1.2fr_1fr_1.6fr] gap-3.5 border-b border-admin-row py-3"
          >
            <Shimmer className={cn("h-2.5", DARK_SHIMMER)} />
            <Shimmer className={cn("h-2.5", DARK_SHIMMER)} />
            <Shimmer className={cn("h-2.5", DARK_SHIMMER)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** F18 unreachable, per surface: stated plainly, retry visible, no pretending. */
function ConsoleFailure({
  label,
  line,
  onRetry,
}: {
  label: string;
  line: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3.5 rounded-[6px] border border-[#3A241C] bg-admin-panel px-6 py-10">
      <span className="text-[10px] uppercase tracking-[0.1em] text-admin-red">
        {label}
      </span>
      <p className="max-w-lg font-sans text-xs leading-relaxed text-admin-note">
        {line}
      </p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[4px] border border-admin-line px-4 py-2 text-[11px] font-medium text-admin-body"
    >
      Retry now
    </button>
  );
}

function ReportsChart({ stats }: { stats: AdminStats }) {
  const days = stats.reportsPerDay;
  const peak = Math.max(1, ...days.map((r) => r.count));
  const total = days.reduce((sum, r) => sum + r.count, 0);

  // F18 usage-no-data: dashed ghost bars, and the panel says why it's empty.
  if (total === 0) {
    return (
      <section className="flex flex-col gap-4 rounded-[6px] border border-admin-line bg-admin-panel px-6 py-[22px]">
        <span className="text-[10px] uppercase tracking-[0.1em] text-admin-dim">
          usage · no data yet
        </span>
        <div className="flex h-[76px] items-end gap-2 px-1">
          {[40, 65, 30, 55, 45].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[2px] border border-dashed border-[#3A342B]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <span className="font-sans text-xs leading-relaxed text-admin-dim">
          No discovery reports have been generated in this window. Bars appear
          with the first one — nothing is ever computed from live reader data.
        </span>
      </section>
    );
  }

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
      <span className="font-sans text-[10.5px] text-admin-dim">
        User IDs are salted hashes. Row-level drill-down is disabled by policy.
      </span>
    </Panel>
  );
}

function StatTile({
  label,
  value,
  note,
  stale,
  staleAt,
}: {
  label: string;
  value: number;
  note: string;
  stale?: boolean;
  staleAt?: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[6px] border border-admin-line bg-admin-panel px-5 py-[18px]",
        stale && "opacity-65",
      )}
    >
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-admin-dim">
        {label}
      </span>
      <span className="text-[26px] font-semibold leading-none text-admin-ink">
        {value.toLocaleString()}
      </span>
      {stale && staleAt ? (
        <span className="w-fit rounded-[3px] border border-[#3A241C] px-1.5 py-[1px] text-[8px] font-semibold tracking-[0.1em] text-admin-red">
          STALE · {utcHm(staleAt)} UTC
        </span>
      ) : (
        <span className="text-[11px] text-admin-dim">{note}</span>
      )}
    </div>
  );
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/** Fixed-width UTC stamp: scanned for distance, not read. */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

function utcHm(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

function agoLabel(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
