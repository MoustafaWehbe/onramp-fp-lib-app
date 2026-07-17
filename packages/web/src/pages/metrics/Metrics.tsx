import { useAnalytics } from "../../hooks/useAnalytics";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Link } from "react-router-dom";
import { buttonVariants } from "../../components/ui/button";

function monthLabel(iso: string) {
  const [y, m] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString(undefined, { month: "short" });
}

/** Design C12 — editorial reading metrics, not a BI dashboard. */
export function Metrics() {
  const { data, isLoading } = useAnalytics();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Shimmer className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Shimmer className="h-28" />
          <Shimmer className="h-28" />
          <Shimmer className="h-28" />
        </div>
        <Shimmer className="h-48 w-full" />
      </div>
    );
  }

  const totalGenre = data.genreBreakdown.reduce((sum, g) => sum + g.count, 0);
  const peak = Math.max(1, ...data.velocity.map((v) => v.finished));
  const hasAnything = data.totalFinished > 0 || totalGenre > 0;

  if (!hasAnything) {
    return (
      <EmptyState
        title="Nothing to count yet."
        line="Finish a book and your reading year starts taking shape."
        action={
          <Link to="/library" className={buttonVariants()}>
            Go to your library
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          A year of reading
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you've finished, counted quietly.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Books finished
          </p>
          <p className="mt-2 font-display text-4xl text-foreground">
            {data.totalFinished}
          </p>
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Average rating
          </p>
          <p className="mt-2 font-display text-4xl text-foreground">
            {data.averageRating ?? "—"}
          </p>
          {data.averageRating != null && (
            <p className="mt-1 text-primary">
              {"★".repeat(Math.round(data.averageRating))}
              <span className="text-muted-foreground/40">
                {"★".repeat(5 - Math.round(data.averageRating))}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Genres read
          </p>
          <p className="mt-2 font-display text-4xl text-foreground">
            {data.genreBreakdown.length}
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg text-foreground">
            Reading velocity
          </h2>
          <p className="text-xs text-muted-foreground">
            books finished per month
          </p>
        </div>
        {data.velocity.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No finished books yet.
          </p>
        ) : (
          <div className="flex h-40 items-end gap-2">
            {data.velocity.map((v) => (
              <div
                key={v.month}
                className="flex flex-1 flex-col items-center gap-2"
                title={`${v.finished} in ${v.month}`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary/80 transition-all"
                  style={{ height: `${(v.finished / peak) * 100}%` }}
                />
                <span className="font-mono text-[0.65rem] text-muted-foreground">
                  {monthLabel(v.month)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
        <h2 className="font-display text-lg text-foreground">Where you read</h2>
        <div className="space-y-3">
          {data.genreBreakdown.map((g) => {
            const pct = Math.round((g.count / totalGenre) * 100);
            return (
              <div key={g.genre} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{g.genre}</span>
                  <span className="font-mono text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        These numbers are for you alone — Folio never publishes reading stats.
      </p>
    </div>
  );
}
