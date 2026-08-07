import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAddBookToShelf,
  useRemoveBookFromShelf,
  useShelf,
  useUpdateShelf,
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
import { Button, buttonVariants } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { AccessLevel } from "../../lib/types";

/** Design E16 — "Invited 2 days ago". */
function invitedAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "invited today";
  if (days === 1) return "invited yesterday";
  return `invited ${days} days ago`;
}

/** Design C11 (shelf detail) + E16 (invite a contributor, scoped to this shelf). */
export function ShelfDetail() {
  const { id } = useParams<{ id: string }>();
  const shelfId = id ?? "";
  const { data: shelf, isLoading, isError, refetch } = useShelf(shelfId);
  const { data: library } = useBooks({});
  const { data: shares } = useShelfShares(shelfId);
  const addBook = useAddBookToShelf(shelfId);
  const removeBook = useRemoveBookFromShelf(shelfId);
  const invite = useInviteContributor(shelfId);
  const revoke = useRevokeShare(shelfId);

  const updateShelf = useUpdateShelf();
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("VIEW");
  const [shareError, setShareError] = useState<string | null>(null);

  // A settled failure must not read as loading — the eternal-skeleton trap.
  if (isError && !shelf) {
    return (
      <EmptyState
        title="This shelf wouldn’t open."
        line="It may have been removed, or the page couldn’t reach your shelves just now."
        action={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
            <Link
              to="/shelves"
              className={buttonVariants({ variant: "ghost" })}
            >
              Back to your shelves
            </Link>
          </div>
        }
      />
    );
  }

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
            {shelf.books.length} {shelf.books.length === 1 ? "book" : "books"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setEditing((v) => !v);
              setEditName(shelf.name);
              setEditDescription(shelf.description ?? "");
              setEditError(null);
            }}
          >
            {editing ? "Cancel" : "Edit shelf"}
          </Button>
          <Button variant="outline" onClick={() => setSharing((s) => !s)}>
            Share
          </Button>
          <Button onClick={() => setPicking((p) => !p)}>
            {picking ? "Done" : "+ Add books"}
          </Button>
        </div>
      </header>

      {editing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setEditError(null);
            try {
              await updateShelf.mutateAsync({
                id: shelfId,
                name: editName.trim(),
                description: editDescription.trim() || undefined,
              });
              setEditing(false);
            } catch (err) {
              const status = (err as { response?: { status?: number } })
                .response?.status;
              setEditError(
                status === 409
                  ? "You already have a shelf with that name."
                  : "Couldn't save those changes.",
              );
            }
          }}
          className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5"
        >
          <div className="space-y-2">
            <label
              htmlFor="edit-name"
              className="text-sm font-medium text-foreground"
            >
              Name
            </label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="edit-desc"
              className="text-sm font-medium text-foreground"
            >
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="edit-desc"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Light on plot, heavy on atmosphere."
              className="bg-background"
            />
          </div>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <Button
            type="submit"
            disabled={!editName.trim() || updateShelf.isPending}
          >
            {updateShelf.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}

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
                    {invitedAgo(s.createdAt)} · {s.status.toLowerCase()}
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
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
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
              <div className="flex items-center gap-1.5">
                <StatusBadge status={book.status} />
                {(book.files?.length ?? 0) > 0 && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {book.files!.some((f) => f.kind !== "AUDIO")
                      ? "Read"
                      : "Listen"}
                  </span>
                )}
              </div>
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
