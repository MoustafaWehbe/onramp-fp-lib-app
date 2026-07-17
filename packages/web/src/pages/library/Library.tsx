import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBooks, type BookFilters } from "../../hooks/useBooks";
import { BookCard } from "../../components/folio/BookCard";
import { EmptyState } from "../../components/folio/EmptyState";
import { BookGridShimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { READING_STATUSES, STATUS_LABEL } from "../../lib/types";

const SORTS = [
  { value: "-createdAt", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "-updatedAt", label: "Recently updated" },
];

/** Design B4/B5 — library home, with the filter bar, active chips and both
 *  empty states (first-run vs filtered-empty). */
export function Library() {
  const [filters, setFilters] = useState<BookFilters>({ sort: "-createdAt" });
  const { data: books, isLoading } = useBooks(filters);

  // The unfiltered count tells first-run ("no books at all") apart from
  // filtered-empty ("no books match") — they're different screens in the design.
  const { data: allBooks } = useBooks({});
  const total = allBooks?.length ?? 0;

  const set = (patch: Partial<BookFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const activeChips = useMemo(
    () =>
      [
        filters.status
          ? { key: "status", label: `Status: ${STATUS_LABEL[filters.status]}` }
          : null,
        filters.genre ? { key: "genre", label: `Genre: ${filters.genre}` } : null,
        filters.author
          ? { key: "author", label: `Author: ${filters.author}` }
          : null,
      ].filter(Boolean) as { key: string; label: string }[],
    [filters],
  );

  const genres = useMemo(
    () =>
      [...new Set((allBooks ?? []).map((b) => b.genre).filter(Boolean))].sort(),
    [allBooks],
  );

  const clearAll = () => setFilters({ sort: filters.sort });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            Your library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeChips.length > 0
              ? `${books?.length ?? 0} of ${total} books match`
              : `${total} ${total === 1 ? "book" : "books"} · private to you`}
          </p>
        </div>
        <Link to="/books/new" className={buttonVariants()}>
          + Add book
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filters.q ?? ""}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search title or author…"
          className="w-full max-w-xs bg-card"
        />
        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            set({ status: (e.target.value || undefined) as BookFilters["status"] })
          }
          className="h-10 rounded-[var(--radius)] border border-input bg-card px-3 text-sm"
        >
          <option value="">Status</option>
          {READING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.genre ?? ""}
          onChange={(e) => set({ genre: e.target.value || undefined })}
          className="h-10 rounded-[var(--radius)] border border-input bg-card px-3 text-sm"
        >
          <option value="">Genre</option>
          {genres.map((g) => (
            <option key={g} value={g as string}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={filters.sort ?? "-createdAt"}
          onChange={(e) => set({ sort: e.target.value })}
          className="ml-auto h-10 rounded-[var(--radius)] border border-input bg-card px-3 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => set({ [chip.key]: undefined })}
              className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground transition-colors hover:bg-accent/70"
            >
              {chip.label} ✕
            </button>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      )}

      {isLoading ? (
        <BookGridShimmer />
      ) : books && books.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : total === 0 ? (
        // A3 — first-run empty library.
        <EmptyState
          title="Your shelf is waiting."
          line="Every library starts with one book you meant to finish."
          action={
            <Link to="/books/new" className={buttonVariants()}>
              + Add your first book
            </Link>
          }
        />
      ) : (
        // B4 — filtered-empty.
        <EmptyState
          title="No books match these filters."
          line="Try removing a filter, or add a book that fits."
          action={
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      )}
    </div>
  );
}
