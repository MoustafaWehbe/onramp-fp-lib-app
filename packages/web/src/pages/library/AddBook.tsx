import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useBook,
  useBooks,
  useCreateBook,
  useUpdateBook,
} from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  CatalogSearch,
  type CatalogResult,
} from "../../components/folio/CatalogSearch";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { CoverDropzone } from "../../components/folio/CoverDropzone";
import {
  READING_STATUSES,
  STATUS_LABEL,
  STATUS_DOT,
  BOOK_FORMATS,
  FORMAT_LABEL,
  type BookFormat,
  type ReadingStatus,
} from "../../lib/types";
import { cn } from "../../lib/utils";

/**
 * Design B6a — "Add / Edit Book". One form, two modes: /books/new creates
 * (search-first, with the catalog above the manual fields), /books/:id/edit
 * hydrates the same fields and PATCHes. Cover is optional; a typographic one
 * is generated otherwise.
 */
export function AddBook() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const {
    data: existing,
    isLoading: loadPending,
    isError: loadError,
    refetch: refetchExisting,
  } = useBook(isEdit ? id : undefined);
  const { data: allBooks } = useBooks({});

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [format, setFormat] = useState<BookFormat>("PHYSICAL");
  const [status, setStatus] = useState<ReadingStatus>("WANT_TO_READ");
  const [openLibraryId, setOpenLibraryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Design B6a — "Use this": the catalog row fills the manual fields, which
  // stay fully editable afterwards. Assignments are unconditional so a second
  // pick fully replaces the first — a missing field clears, never lingers.
  function applyCatalogPick(r: CatalogResult) {
    setTitle(r.title);
    setAuthor(r.author);
    setYear(r.year ? String(r.year) : "");
    setPageCount(r.pageCount ? String(r.pageCount) : "");
    setCoverImage(r.coverUrl ?? "");
    setOpenLibraryId(r.openLibraryId);
    titleRef.current?.focus();
  }

  // Hydrate once when editing.
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setAuthor(existing.author);
      setGenre(existing.genre ?? "");
      setYear(existing.year ? String(existing.year) : "");
      setPageCount(existing.pageCount ? String(existing.pageCount) : "");
      setCoverImage(existing.coverImage ?? "");
      setFormat(existing.format);
      setStatus(existing.status);
    }
  }, [existing]);

  // Genre suggestions from the library, matching the design's dropdown affordance.
  const knownGenres = [
    ...new Set((allBooks ?? []).map((b) => b.genre).filter(Boolean)),
  ].sort() as string[];

  const pending = createBook.isPending || updateBook.isPending;
  const canSubmit = title.trim() !== "" && author.trim() !== "" && !pending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      title: title.trim(),
      author: author.trim(),
      genre: genre.trim() || undefined,
      coverImage: coverImage.trim() || undefined,
      year: year ? Number(year) : undefined,
      pageCount: pageCount ? Number(pageCount) : undefined,
      format,
      status,
      ...(isEdit ? {} : { openLibraryId: openLibraryId ?? undefined }),
    };
    try {
      if (isEdit && id) {
        await updateBook.mutateAsync({ id, ...payload });
        navigate(`/books/${id}`);
      } else {
        const book = await createBook.mutateAsync(payload);
        navigate(`/books/${book.id}`);
      }
    } catch (err) {
      // The API returns 409 when (title, author) already exists for this user.
      const code = (err as { response?: { status?: number } }).response?.status;
      setError(
        code === 409
          ? "That book is already in your library."
          : "Something went wrong saving this book.",
      );
    }
  }

  // Editing a book that failed to load would present a blank create form for
  // a book that exists — state the failure instead of the misleading form.
  // Cached data wins over a failed background refetch (stale beats blank).
  if (isEdit && loadError && !existing) {
    return (
      <EmptyState
        title="This book wouldn’t open for editing."
        line="Its details are unchanged — the page just couldn’t reach it. Try again in a moment."
        action={
          <Button variant="outline" onClick={() => refetchExisting()}>
            Try again
          </Button>
        }
      />
    );
  }

  // Never show the blank form while the book is still on its way — typing
  // into it would be overwritten by hydration when the data lands.
  if (isEdit && loadPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      {/* B6a mobile sheet chrome: Cancel / title / Save as a header bar.
          Save submits the same form (form= attribute); the page heading
          belongs to sm and up. */}
      <div className="-mx-4 flex items-center justify-between border-b border-border px-4 py-1 sm:hidden">
        <button
          type="button"
          onClick={() => navigate(isEdit && id ? `/books/${id}` : "/library")}
          className="flex min-h-[44px] items-center text-sm text-muted-foreground"
        >
          Cancel
        </button>
        <span className="font-display text-lg text-foreground">
          {isEdit ? "Edit details" : "Add a book"}
        </span>
        <button
          type="submit"
          form="book-form"
          disabled={!canSubmit}
          className="flex min-h-[44px] items-center text-sm font-semibold text-primary disabled:text-muted-foreground/50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <h1 className="hidden font-display text-[2rem] text-foreground sm:block">
        {isEdit ? "Edit details" : "Add a book"}
      </h1>

      {/* Design B6a — search first; the manual form never blocks on it. */}
      {!isEdit && (
        <CatalogSearch
          onPick={applyCatalogPick}
          onManual={() => titleRef.current?.focus()}
        />
      )}

      <form
        id="book-form"
        onSubmit={onSubmit}
        className="grid gap-8 sm:grid-cols-[180px_1fr]"
      >
        {/* B6a mobile: search first, fields next, cover last. */}
        <div className="order-last sm:order-none">
          <CoverDropzone
            title={title || "Untitled"}
            author={author || "Unknown"}
            coverImage={coverImage || null}
            onChange={(url) => setCoverImage(url ?? "")}
          />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                // Edited away from the catalog pick — it's a manual entry now,
                // and keeping the id would dedup against the wrong book.
                setOpenLibraryId(null);
              }}
              placeholder="The Peregrine Notebooks"
              className="bg-card placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value);
                setOpenLibraryId(null);
              }}
              placeholder="R. F. Caldwell"
              className="bg-card placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Nature"
                className="bg-card placeholder:text-muted-foreground/60"
                list="genre-options"
              />
              <datalist id="genre-options">
                {knownGenres.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
                className="bg-card placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pages">Pages</Label>
              <Input
                id="pages"
                type="number"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="312"
                className="bg-card placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Design B6a — format is a label, chosen by the reader. The
              catalog pick never sets it: Open Library doesn't carry format
              reliably, and guessing would present a fact never entered. */}
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="flex flex-wrap gap-2">
              {BOOK_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                    format === f
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            <p className="text-[0.7rem] text-muted-foreground">
              Just a label, for your own filtering. Once the book is in your
              library you can also attach its file — a PDF scan, an EPUB, or
              audio — from the book&rsquo;s page, whatever the label says.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Lifecycle</Label>
            <div className="flex flex-wrap gap-2">
              {READING_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    status === s
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2 pt-2">
            {/* The sheet header carries Save/Cancel on phones. */}
            <div className="hidden items-center gap-3 sm:flex">
              <Button type="submit" disabled={!canSubmit}>
                {pending
                  ? "Saving…"
                  : isEdit
                    ? "Save changes"
                    : "Add to library"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  navigate(isEdit && id ? `/books/${id}` : "/library")
                }
              >
                Cancel
              </Button>
            </div>
            {/* A disabled control with no stated reason reads as broken. */}
            {!canSubmit && !pending && (
              <p className="text-[0.7rem] text-muted-foreground">
                Needs at least a title and an author — everything else is
                optional.
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
