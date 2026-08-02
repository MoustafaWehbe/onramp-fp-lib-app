import { useState } from "react";
import { Link } from "react-router-dom";
import { useMemoryOverview, useMemorySearch } from "../../hooks/useMemory";
import type { MemorySearchResult } from "../../lib/types";
import { BookCover } from "../../components/folio/BookCover";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";

const EXAMPLES = [
  "books that made me want to write",
  "anything about my grandmother",
  "when I gave up on a book",
  "the winter I read nothing but poetry",
];

const NO_MATCH_IDEAS = ["restless", "the sea", "travel"];

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ThinkDots() {
  return (
    <span className="flex items-end gap-1" aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="animate-think h-1 w-1 rounded-full bg-primary"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Design G19 — Reading Memory: search your own reflections, in your own
 * words. Matching is by meaning; when the model is offline the page keeps
 * working in exact-match mode. Searches aren't kept.
 */
export function Memory() {
  const { data: overview } = useMemoryOverview();
  const search = useMemorySearch();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<MemorySearchResult | null>(null);

  async function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed || search.isPending) return;
    setQuery(trimmed);
    setSubmitted(trimmed);
    try {
      setResult(await search.mutateAsync(trimmed));
    } catch {
      // Even the degraded path failed — treat like no matches with a notice.
      setResult({ mode: "exact", entryCount: overview?.entryCount ?? 0, hits: [] });
    }
  }

  function clear() {
    setQuery("");
    setSubmitted("");
    setResult(null);
    search.reset();
  }

  // ── Nothing written yet ─────────────────────────────────────────────────
  if (overview && overview.entryCount === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Reading memory
        </p>
        <h1 className="font-display text-2xl text-foreground">
          There&rsquo;s nothing to search yet.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reading Memory looks through reflections you&rsquo;ve written. Once
          you&rsquo;ve finished a book and put a few sentences down, this
          becomes the most useful page in Folio.
        </p>
        <Link to="/library" className={buttonVariants({ variant: "default" })}>
          Write your first reflection
        </Link>
      </div>
    );
  }

  const searching = search.isPending;
  const hasResult = result !== null && !searching;

  return (
    <div className="space-y-8">
      {/* ── Hero (collapses once a search is in play) ─────────────────── */}
      {!hasResult && !searching && (
        <div className="mx-auto max-w-xl space-y-3 pt-10 text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Reading memory
          </p>
          <h1 className="font-display text-3xl leading-tight text-foreground sm:text-[2.5rem]">
            What did you write about?
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ask in plain words. This searches your own reflections only
            {overview
              ? ` — ${overview.entryCount} ${
                  overview.entryCount === 1 ? "entry" : "entries"
                }, ${overview.wordCount.toLocaleString()} words, none of it seen by anyone but you.`
              : "."}
          </p>
          {/* Design G20 lives beside memory search in section G. */}
          <Link
            to="/memory/year"
            className="inline-block text-xs font-medium text-primary hover:text-accent-foreground"
          >
            Your year in reading →
          </Link>
        </div>
      )}

      {/* ── Search box ────────────────────────────────────────────────── */}
      <form
        className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-[var(--radius)] border-[1.5px] border-primary bg-card px-4 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <span className="text-muted-foreground" aria-hidden>
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          maxLength={300}
          placeholder="when did I write about grief?"
          className="flex-1 bg-transparent font-display text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        {searching ? (
          <ThinkDots />
        ) : hasResult ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="px-1 text-sm text-muted-foreground/70 hover:text-foreground"
          >
            ✕
          </button>
        ) : (
          <Button type="submit" disabled={!query.trim()}>
            Search
          </Button>
        )}
      </form>

      {/* ── Idle: example chips + privacy line ────────────────────────── */}
      {!hasResult && !searching && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs text-muted-foreground">Or start with one of these</p>
          {/* G19 mobile stacks the example chips full-width for the thumb. */}
          <div className="flex w-full max-w-2xl flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => void run(ex)}
                className="rounded-full border border-border px-4 py-2.5 text-left font-display text-[0.85rem] italic text-muted-foreground transition-colors hover:border-primary hover:text-accent-foreground sm:py-1.5 sm:text-center"
              >
                {ex}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <span aria-hidden>🔒</span> Nothing here is indexed off your
            account, and searches aren&rsquo;t kept.
          </p>
        </div>
      )}

      {/* ── Searching ─────────────────────────────────────────────────── */}
      {searching && (
        <div className="mx-auto max-w-3xl space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex gap-5 rounded-[var(--radius)] border border-border bg-card p-6"
            >
              <Shimmer className="aspect-[2/3] w-14 shrink-0" />
              <div className="flex-1 space-y-2.5 pt-1">
                <Shimmer className="h-3 w-2/5" />
                <Shimmer className="h-2.5 w-full" />
                <Shimmer className="h-2.5 w-11/12" />
                <Shimmer className="h-2.5 w-3/5" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Reading back through {overview?.entryCount ?? "your"} entries…
          </p>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────── */}
      {hasResult && (
        <div className="mx-auto max-w-3xl space-y-4">
          {result.mode === "exact" && (
            <div className="space-y-1 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-xs font-semibold text-destructive">
                Meaning-search is offline.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Plain word search still works and runs locally — it just
                won&rsquo;t connect &ldquo;grief&rdquo; to
                &ldquo;mourning&rdquo; until the model is back.
              </p>
            </div>
          )}

          {result.hits.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {result.hits.length}{" "}
                {result.hits.length === 1 ? "entry seems" : "entries seem"} to
                be about this.
              </p>
              {result.hits.map((h) => (
                <div
                  key={h.bookId}
                  className="flex gap-4 rounded-[var(--radius)] border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:gap-5 sm:p-6"
                >
                  <div className="w-10 shrink-0 sm:w-14">
                    <BookCover
                      title={h.bookTitle}
                      author={h.bookAuthor}
                      coverImage={h.coverImage}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <p className="text-sm">
                      <span className="font-semibold text-foreground">
                        {h.bookTitle}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {h.bookAuthor} · journal entry,{" "}
                        {formatEntryDate(h.entryDate)}
                      </span>
                    </p>
                    {/* The service already adds truncation ellipses where the
                        text was actually cut — none are added here. */}
                    <p className="font-display text-[0.95rem] leading-relaxed text-foreground/90 sm:text-[1.05rem]">
                      {h.pre}
                      {h.hit && (
                        <mark className="rounded-sm bg-accent px-0.5 text-accent-foreground">
                          {h.hit}
                        </mark>
                      )}
                      {h.post}
                    </p>
                    <div className="flex gap-4 pt-0.5">
                      <Link
                        to={`/books/${h.bookId}/journal`}
                        className="text-xs font-medium text-primary hover:text-accent-foreground"
                      >
                        Open the full entry
                      </Link>
                      <Link
                        to={`/books/${h.bookId}`}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Go to the book
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Matching is by meaning, so &ldquo;grief&rdquo; finds
                &ldquo;mourning&rdquo; and &ldquo;loss&rdquo;. Folio pulls up
                what you wrote; it doesn&rsquo;t summarise or interpret it.
              </p>
            </>
          ) : (
            <div className="space-y-3 rounded-[var(--radius)] border border-dashed border-border bg-card p-8">
              <p className="font-display text-xl text-foreground">
                Nothing on that, yet.
              </p>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                You&rsquo;ve written {result.entryCount}{" "}
                {result.entryCount === 1 ? "entry" : "entries"} and none of
                them go near &ldquo;{submitted}&rdquo;. Try a feeling rather
                than a subject — &ldquo;restless&rdquo;, &ldquo;couldn&rsquo;t
                put it down&rdquo; — or search a book you remember writing at
                length about.
              </p>
              <div className="flex gap-2 pt-1">
                {NO_MATCH_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => void run(idea)}
                    className="rounded-full border border-border px-3.5 py-1.5 font-display text-[0.8rem] italic text-muted-foreground transition-colors hover:border-primary hover:text-accent-foreground"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
