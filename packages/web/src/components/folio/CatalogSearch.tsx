import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";
import { BookCover } from "./BookCover";
import { Shimmer } from "./Shimmer";

export interface CatalogResult {
  openLibraryId: string | null;
  title: string;
  author: string;
  year: number | null;
  pageCount: number | null;
  coverUrl: string | null;
}

/** Wait this long after the last keystroke before asking the catalog. */
const DEBOUNCE_MS = 400;
/** Below this, a query is too broad to be worth a request. */
const MIN_QUERY_CHARS = 3;

function useCatalogSearch(q: string) {
  return useQuery({
    queryKey: ["catalog-search", q],
    // Consuming `signal` opts into React Query's cancellation: when the
    // debounced query changes, this observer moves to the new key, the old
    // query loses its last watcher, and its request is aborted. Without it a
    // multi-word search leaves an earlier lookup in flight — and Open Library
    // allows one request a second to callers it can't identify.
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<{ data: CatalogResult[] }>(
        "/books/catalog-search",
        { params: { q }, signal },
      );
      return data.data;
    },
    enabled: q.trim().length >= MIN_QUERY_CHARS,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

interface CatalogSearchProps {
  onPick: (result: CatalogResult) => void;
  /** Focus the manual fields ("Enter it manually" / no results). */
  onManual: () => void;
}

/**
 * Design B6a — "Find it in the catalog". Search first, manual always: the
 * loading, empty, and unavailable states all leave the form below untouched.
 */
export function CatalogSearch({ onPick, onManual }: CatalogSearchProps) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  // Debounce: search what the reader typed, half a beat after they stop. The
  // cleanup cancels the pending timer on every keystroke, so a word typed
  // without pausing costs one request rather than one per letter.
  useEffect(() => {
    const t = setTimeout(() => setQ(text), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isLoading, isError } = useCatalogSearch(q);
  const active = q.trim().length >= MIN_QUERY_CHARS;

  return (
    <div className="space-y-3">
      <label
        htmlFor="catalog-q"
        className="text-xs font-semibold text-foreground/80"
      >
        Find it in the catalog
      </label>
      <div className="flex items-center gap-2.5 rounded-[var(--radius)] border-[1.5px] border-primary bg-card px-3.5 py-2.5">
        <span className="text-muted-foreground" aria-hidden>
          ⌕
        </span>
        <input
          id="catalog-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Title or author…"
          autoFocus
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {active && data && (
          <span className="text-xs text-muted-foreground">
            {data.length} match{data.length === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {active && isLoading && (
        <div className="space-y-2.5 rounded-[var(--radius)] border border-border bg-card p-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Shimmer className="h-12 w-8 shrink-0 rounded-sm" />
              <div className="flex-1 space-y-1.5">
                <Shimmer className="h-2.5 w-3/5" />
                <Shimmer className="h-2 w-2/5" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Looking in the catalog…
          </p>
        </div>
      )}

      {active && isError && (
        <div className="space-y-1.5 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            The catalog isn&rsquo;t answering right now.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nothing is lost — the manual fields below work exactly as they
            always do, and you can look the metadata up later.
          </p>
        </div>
      )}

      {active && data && data.length === 0 && (
        <div className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="font-display text-lg text-foreground">
            Nothing matched that.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Check the spelling, try the author alone, or just type the details
            in — plenty of books aren&rsquo;t in any catalog.
          </p>
          <button
            type="button"
            onClick={onManual}
            className="mt-1 rounded-[var(--radius)] border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary/50"
          >
            Enter it manually
          </button>
        </div>
      )}

      {active && data && data.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
          {data.map((r, i) => (
            <div
              key={`${r.openLibraryId ?? r.title}-${i}`}
              className={cnRow(i === 0)}
            >
              <div className="w-8 shrink-0">
                <BookCover title={r.title} author={r.author} coverImage={r.coverUrl} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[r.author, r.year, r.pageCount ? `${r.pageCount} pages` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onPick(r)}
                className={
                  i === 0
                    ? "shrink-0 rounded-[var(--radius)] bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-accent-foreground"
                    : "shrink-0 text-xs font-medium text-primary hover:text-accent-foreground"
                }
              >
                Use this
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3.5 pt-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">
          or fill it in yourself
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function cnRow(first: boolean): string {
  return [
    "flex items-center gap-3.5 px-4 py-3",
    first ? "bg-accent" : "border-t border-border/60",
  ].join(" ");
}
