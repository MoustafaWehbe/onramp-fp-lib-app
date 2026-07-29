import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBook, useDeleteBook, useJournal, useUpdateBook } from "../../hooks/useBooks";
import { useAddBookToAnyShelf, useBookShelves } from "../../hooks/useShelves";
import { BookCover } from "../../components/folio/BookCover";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";
import { READING_STATUSES, STATUS_LABEL, type ReadingStatus } from "../../lib/types";
import { cn } from "../../lib/utils";

/** Design B7 — lifecycle control + the journal entry point. */
export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: book, isLoading } = useBook(id);
  const { data: journal } = useJournal(id);
  const { data: shelfInfo } = useBookShelves(id);
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const [addingToShelf, setAddingToShelf] = useState(false);
  const addToShelf = useAddBookToAnyShelf();

  if (isLoading || !book) {
    return (
      <div className="grid gap-10 sm:grid-cols-[200px_1fr]">
        <Shimmer className="aspect-[2/3] w-full" />
        <div className="space-y-4">
          <Shimmer className="h-8 w-2/3" />
          <Shimmer className="h-4 w-1/2" />
          <Shimmer className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const isFinished = book.status === "FINISHED";
  const meta = [
    book.author,
    book.genre,
    book.year,
    book.pageCount ? `${book.pageCount} pages` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-8">
      <nav className="text-xs text-muted-foreground">
        <Link to="/library" className="hover:text-foreground">
          Library
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{book.title}</span>
      </nav>

      <div className="grid gap-10 sm:grid-cols-[200px_1fr]">
        <div className="space-y-4">
          <BookCover
            title={book.title}
            author={book.author}
            coverImage={book.coverImage}
          />
          {/* Design B7: edit sits under the cover. */}
          <Link
            to={`/books/${book.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Edit details
          </Link>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="font-display text-[2rem] leading-tight text-foreground">
              {book.title}
            </h1>
            <p className="text-sm text-muted-foreground">{meta}</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Lifecycle
            </h2>
            <div className="flex flex-wrap gap-2">
              {READING_STATUSES.map((s: ReadingStatus) => (
                <button
                  key={s}
                  onClick={() => updateBook.mutate({ id: book.id, status: s })}
                  disabled={updateBook.isPending}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    book.status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          {/* Design B7 — "On shelves": membership chips + add-to-shelf. */}
          <section className="space-y-3">
            <h2 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              On shelves
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {(shelfInfo?.member ?? []).map((s) => (
                <Link
                  key={s.id}
                  to={`/shelves/${s.id}`}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40"
                >
                  {s.name}
                </Link>
              ))}
              {shelfInfo && shelfInfo.member.length === 0 && !addingToShelf && (
                <span className="text-xs text-muted-foreground">
                  Not on any shelf yet.
                </span>
              )}
              {!addingToShelf ? (
                <button
                  onClick={() => setAddingToShelf(true)}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  + Add to shelf
                </button>
              ) : (
                <select
                  autoFocus
                  defaultValue=""
                  disabled={addToShelf.isPending}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    await addToShelf.mutateAsync({
                      shelfId: e.target.value,
                      bookId: book.id,
                    });
                    setAddingToShelf(false);
                  }}
                  onBlur={() => setAddingToShelf(false)}
                  className="h-8 rounded-[var(--radius)] border border-input bg-card px-2 text-xs"
                >
                  <option value="">Choose a shelf…</option>
                  {(shelfInfo?.all ?? [])
                    .filter(
                      (s) => !shelfInfo?.member.some((m) => m.id === s.id),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
            <h2 className="font-display text-lg text-foreground">
              Journal &amp; review
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {isFinished
                ? "Your journal is never visible to anyone else."
                : "Rating and reflections unlock when you mark this book Finished. Your journal is never visible to anyone else."}
            </p>
            {isFinished ? (
              <Link
                to={`/books/${book.id}/journal`}
                className={buttonVariants({ variant: "default" })}
              >
                {journal ? "Edit your review" : "Write your review"}
              </Link>
            ) : (
              <Button disabled variant="outline">
                Write your review
              </Button>
            )}
          </section>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                await deleteBook.mutateAsync(book.id);
                navigate("/library");
              }}
            >
              Remove from library
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
