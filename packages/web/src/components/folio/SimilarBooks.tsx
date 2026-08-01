import { Link } from "react-router-dom";
import { useSimilarBooks } from "../../hooks/useBooks";
import { BookCover } from "./BookCover";
import { Shimmer } from "./Shimmer";
import { Button } from "../ui/button";

/**
 * Design B7a — "Books like this one", drawn only from the reader's own
 * embedded library. Four states: loading, too-thin, unavailable, loaded.
 * The section never blocks the rest of the detail page.
 */
export function SimilarBooks({ bookId }: { bookId: string }) {
  const { data, isLoading, isError, refetch, isRefetching } =
    useSimilarBooks(bookId);

  return (
    <section className="space-y-5 rounded-[var(--radius)] bg-secondary/60 p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl text-foreground">
            Books like this one
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Reading back through your library…"
              : "From your own shelves — nothing here comes from outside your library."}
          </p>
        </div>
        {data?.status === "ok" && (
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs font-medium text-primary hover:text-accent-foreground"
          >
            {isRefetching ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {isLoading || isRefetching ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex gap-4 rounded-[var(--radius)] border border-border bg-card p-4"
            >
              <Shimmer className="aspect-[2/3] w-16 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Shimmer className="h-3 w-2/3" />
                <Shimmer className="h-2.5 w-1/2" />
                <Shimmer className="mt-2 h-2.5 w-full" />
                <Shimmer className="h-2.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-destructive">
              Couldn&rsquo;t work these out just now.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              The suggestion engine is offline. Everything else on this page —
              your details, shelves, and journal — is unaffected.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : data?.status === "thin" ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-dashed border-border bg-card p-7">
          <div className="flex items-end gap-1.5" aria-hidden>
            <div className="h-9 w-6 rounded-sm bg-muted" />
            <div className="h-11 w-6 rounded-sm bg-muted-foreground/30" />
            <div className="h-8 w-6 rounded-sm border border-dashed border-border" />
          </div>
          <p className="font-display text-lg text-foreground">
            Not enough to compare yet.
          </p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Folio needs about {data.needed} finished books before it can find
            echoes between them. You have {data.embeddedCount}. This section
            will appear on its own — no setup, nothing to switch on.
          </p>
          <Link
            to="/books/new"
            className="text-xs font-semibold text-primary hover:text-accent-foreground"
          >
            Add another book
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.items ?? []).map((s) => (
              <Link
                key={s.id}
                to={`/books/${s.id}`}
                className="flex gap-4 rounded-[var(--radius)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="w-16 shrink-0">
                  <BookCover
                    title={s.title}
                    author={s.author}
                    coverImage={s.coverImage}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {s.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.author}</p>
                  <p className="pt-0.5 font-display text-[0.85rem] leading-relaxed text-foreground/80">
                    {s.why}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested from what you&rsquo;ve already read and written. A hunch,
            not a verdict — and never shown to anyone else.
          </p>
        </>
      )}
    </section>
  );
}
