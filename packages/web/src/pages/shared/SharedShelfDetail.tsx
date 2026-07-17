import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useSharedShelfBooks,
  useSharedWithMe,
} from "../../hooks/useContributors";
import { useBooks } from "../../hooks/useBooks";
import { useAuth } from "../../hooks/useAuth";
import { BookCover } from "../../components/folio/BookCover";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

/** Design E17 — a shared shelf as the contributor sees it. */
export function SharedShelfDetail() {
  const { id } = useParams<{ id: string }>();
  const shelfId = id ?? "";
  const { user } = useAuth();
  const { data: shelves, isLoading } = useSharedWithMe();
  const { data: myBooks } = useBooks({});
  const { add, remove } = useSharedShelfBooks(shelfId);

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Shimmer className="h-64 w-full" />;

  const shelf = shelves?.find((s) => s.shelfId === shelfId);
  if (!shelf) {
    return (
      <EmptyState
        title="This shelf isn't shared with you."
        line="It may have been revoked, or the invite is still waiting on your answer."
        action={
          <Link to="/shared">
            <Button variant="outline">Back to shared shelves</Button>
          </Link>
        }
      />
    );
  }

  const canWrite = shelf.accessLevel === "WRITE";
  const onShelf = new Set(shelf.books.map((b) => b.id));
  const candidates = (myBooks ?? []).filter(
    (b) =>
      !onShelf.has(b.id) &&
      (query.trim() === "" ||
        `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase())),
  );

  async function addBook(bookId: string) {
    setError(null);
    try {
      await add.mutateAsync(bookId);
    } catch {
      setError("Couldn't add that book to the shelf.");
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[var(--radius)] border border-border bg-accent/40 p-4 text-sm text-accent-foreground">
        You're seeing one shared shelf. {shelf.owner.name}'s library, journal,
        and reading metrics remain private — as do yours.
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            {shelf.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shelf.description ? `${shelf.description} · ` : ""}
            Shared with you by {shelf.owner.name} · {shelf.books.length}{" "}
            {shelf.books.length === 1 ? "book" : "books"}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setPicking((p) => !p)}>
            {picking ? "Done" : "+ Add a book"}
          </Button>
        )}
      </header>

      {picking && canWrite && (
        <section className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your own library…"
            className="max-w-xs bg-background"
          />
          <p className="text-xs text-muted-foreground">
            You can add books from your own library. Everything else in your
            library stays private.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {candidates.map((b) => (
              <button
                key={b.id}
                onClick={() => addBook(b.id)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-accent/50"
              >
                <span className="text-foreground">
                  {b.title}{" "}
                  <span className="text-muted-foreground">· {b.author}</span>
                </span>
                <span className="text-xs text-primary">Add</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Nothing left in your library to add.
              </p>
            )}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {shelf.books.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {shelf.books.map((book) => {
            const mine = book.addedBy?.id === user?.id;
            return (
              <div key={book.id} className="space-y-2">
                <BookCover
                  title={book.title}
                  author={book.author}
                  coverImage={book.coverImage}
                />
                <p className="font-display text-sm leading-snug text-foreground">
                  {book.title}
                </p>
                <p className="text-xs text-muted-foreground">{book.author}</p>
                {/* Design E17: every book says who put it here. */}
                <p className="text-[0.65rem] text-muted-foreground">
                  added by {mine ? "you" : book.addedBy?.name}
                </p>
                {canWrite && mine && (
                  <button
                    onClick={() => remove.mutate(book.id)}
                    className="block text-[0.65rem] text-muted-foreground underline underline-offset-4 hover:text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nothing on this shelf yet."
          line={
            canWrite
              ? "Add one of your books and start it off."
              : "When the owner adds a book, it will show up here."
          }
          action={
            canWrite ? (
              <Button onClick={() => setPicking(true)}>+ Add a book</Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
