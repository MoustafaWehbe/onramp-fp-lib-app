import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAddBookToShelf,
  useRemoveBookFromShelf,
  useShelf,
} from "../../hooks/useShelves";
import { useBooks } from "../../hooks/useBooks";
import {
  useInviteContributor,
  useRevokeShare,
  useShelfShares,
} from "../../hooks/useContributors";
import { BookCover } from "../../components/folio/BookCover";
import { StatusBadge } from "../../components/folio/StatusBadge";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { AccessLevel } from "../../lib/types";

/** Design C11 (shelf detail) + E16 (invite a contributor, scoped to this shelf). */
export function ShelfDetail() {
  const { id } = useParams<{ id: string }>();
  const shelfId = id ?? "";
  const { data: shelf, isLoading } = useShelf(shelfId);
  const { data: library } = useBooks({});
  const { data: shares } = useShelfShares(shelfId);
  const addBook = useAddBookToShelf(shelfId);
  const removeBook = useRemoveBookFromShelf(shelfId);
  const invite = useInviteContributor(shelfId);
  const revoke = useRevokeShare(shelfId);

  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("VIEW");
  const [shareError, setShareError] = useState<string | null>(null);

  if (isLoading || !shelf) return <Shimmer className="h-64 w-full" />;

  const onShelf = new Set(shelf.books.map((b) => b.id));
  const candidates = (library ?? []).filter(
    (b) =>
      !onShelf.has(b.id) &&
      (query.trim() === "" ||
        `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase())),
  );

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setShareError(null);
    try {
      await invite.mutateAsync({ email: email.trim(), accessLevel });
      setEmail("");
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setShareError(
        status === 404
          ? "No Folio account uses that email address."
          : status === 409
            ? "That person is already invited to this shelf."
            : status === 400
              ? "You can't share a shelf with yourself."
              : "Couldn't send that invite.",
      );
    }
  }

  return (
    <div className="space-y-8">
      <nav className="text-xs text-muted-foreground">
        <Link to="/shelves" className="hover:text-foreground">
          Shelves
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{shelf.name}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            {shelf.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shelf.description ? `${shelf.description} · ` : ""}
            {shelf.books.length}{" "}
            {shelf.books.length === 1 ? "book" : "books"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSharing((s) => !s)}>
            Share
          </Button>
          <Button onClick={() => setPicking((p) => !p)}>
            {picking ? "Done" : "+ Add books"}
          </Button>
        </div>
      </header>

      {sharing && (
        <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
          <div>
            <h2 className="font-display text-lg text-foreground">
              Share “{shelf.name}”
            </h2>
            <p className="text-sm text-muted-foreground">
              Invite one person to add and see books on this shelf — and nothing
              else.
            </p>
          </div>

          <form onSubmit={sendInvite} className="flex flex-wrap gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maya@example.com"
              type="email"
              className="w-full max-w-xs bg-background"
            />
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
              className="h-10 rounded-[var(--radius)] border border-input bg-background px-3 text-sm"
            >
              <option value="VIEW">Can view</option>
              <option value="WRITE">Can add books</option>
            </select>
            <Button type="submit" disabled={!email.trim() || invite.isPending}>
              Send invite
            </Button>
          </form>
          {shareError && (
            <p className="text-sm text-destructive">{shareError}</p>
          )}

          <div className="rounded-[var(--radius)] bg-accent/40 p-4 text-sm">
            <p className="mb-2 font-medium text-accent-foreground">
              What they will see
            </p>
            <ul className="space-y-1 text-muted-foreground">
              <li>· Books on this shared shelf, and who added each</li>
              <li>· The shelf name and description</li>
            </ul>
            <p className="mb-1 mt-3 font-medium text-accent-foreground">
              What stays private
            </p>
            <ul className="space-y-1 text-muted-foreground">
              <li>· Your journal entries, ratings, and reading metrics</li>
              <li>· Your library and every other shelf</li>
            </ul>
          </div>

          {shares && shares.length > 0 && (
            <ul className="space-y-2">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
                >
                  <span className="text-foreground">{s.user.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.accessLevel === "WRITE" ? "Can add books" : "Can view"} ·{" "}
                    {s.status.toLowerCase()}
                  </span>
                  <button
                    onClick={() => revoke.mutate(s.user.id)}
                    className="text-xs text-destructive underline underline-offset-4"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {picking && (
        <section className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library…"
            className="max-w-xs bg-background"
          />
          <p className="text-xs text-muted-foreground">
            Books can live on many shelves at once.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {candidates.map((b) => (
              <button
                key={b.id}
                onClick={() => addBook.mutate(b.id)}
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
                Nothing left to add from your library.
              </p>
            )}
          </div>
        </section>
      )}

      {shelf.books.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {shelf.books.map((book) => (
            <div key={book.id} className="space-y-2">
              <Link to={`/books/${book.id}`}>
                <BookCover
                  title={book.title}
                  author={book.author}
                  coverImage={book.coverImage}
                />
              </Link>
              <p className="font-display text-sm leading-snug text-foreground">
                {book.title}
              </p>
              <p className="text-xs text-muted-foreground">{book.author}</p>
              <StatusBadge status={book.status} />
              <button
                onClick={() => removeBook.mutate(book.id)}
                className="block text-[0.7rem] text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                Remove from shelf
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="An empty shelf is a promise."
          line="Add books from your library to fill it."
          action={<Button onClick={() => setPicking(true)}>+ Add books</Button>}
        />
      )}
    </div>
  );
}
