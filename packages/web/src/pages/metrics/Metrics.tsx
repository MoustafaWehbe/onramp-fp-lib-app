import { useAnalytics } from "../../hooks/useAnalytics";
import { useBooks } from "../../hooks/useBooks";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Link } from "react-router-dom";
import { buttonVariants } from "../../components/ui/button";

/** Design C12 categorical palette — terracotta first, then the muted set. */
const DONUT_COLORS = ["#A34E2C", "#3E5C46", "#39424E", "#8A7A45", "#D9CFBC"];

function monthLabel(iso: string) {
  const [y, m] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString(undefined, { month: "short" });
}

/** The month with the fewest finishes — only meaningful with some history. */
function quietestMonth(velocity: { month: string; finished: number }[]) {
  if (velocity.length < 2) return null;
  const min = velocity.reduce((a, b) => (b.finished < a.finished ? b : a));
  const [y, m] = min.month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, {
    month: "long",
  });
}

/** Design C12 — editorial reading metrics, not a BI dashboard. */
export function Metrics() {
  const { data, isLoading } = useAnalytics();
  const { data: reading } = useBooks({ status: "READING" });

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

  // Top four genres get their own segment; the tail folds into "Everything else".
  const sortedGenres = [...data.genreBreakdown].sort((a, b) => b.count - a.count);
  const restCount = sortedGenres.slice(4).reduce((sum, g) => sum + g.count, 0);
  const segments =
    restCount > 0
      ? [...sortedGenres.slice(0, 4), { genre: "Everything else", count: restCount }]
      : sortedGenres.slice(0, 4);
  let acc = 0;
  const donutStops = segments
    .map((s, i) => {
      const from = acc;
      acc += (s.count / Math.max(1, totalGenre)) * 100;
      return `${DONUT_COLORS[i]} ${from}% ${acc}%`;
    })
    .join(", ");

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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Books finished
          </p>
          <p className="mt-2 font-display text-4xl text-foreground">
            {data.totalFinished}
          </p>
          {quietestMonth(data.velocity) && (
            <p className="mt-1 text-xs text-muted-foreground">
              your quietest month was {quietestMonth(data.velocity)}
            </p>
          )}
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
            Currently reading
          </p>
          <p className="mt-2 font-display text-4xl text-foreground">
            {reading?.length ?? 0}
          </p>
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

      {totalGenre > 0 && (
        <section className="space-y-5 rounded-xl border border-border bg-card p-7">
          <h2 className="font-display text-xl text-foreground">Where you read</h2>
          <div className="flex flex-wrap items-center gap-7">
            <div
              className="flex h-[150px] w-[150px] flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(${donutStops})` }}
              role="img"
              aria-label="Share of finished books by genre"
            >
              <div className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full bg-card">
                <span className="font-display text-[1.35rem] text-foreground">
                  {Math.round((segments[0].count / totalGenre) * 100)}%
                </span>
                <span className="max-w-[80px] truncate px-1 text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {segments[0].genre}
                </span>
              </div>
            </div>
            <div className="space-y-2.5">
              {segments.map((s, i) => (
                <div key={s.genre} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ backgroundColor: DONUT_COLORS[i] }}
                  />
                  <span className="font-medium text-foreground">{s.genre}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((s.count / totalGenre) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground">
        These numbers are for you alone — Folio never publishes reading stats.
      </p>
    </div>
  );
}
