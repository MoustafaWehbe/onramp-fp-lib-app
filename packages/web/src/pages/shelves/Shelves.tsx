import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAddBookToAnyShelf,
  useCreateShelf,
  useShelves,
} from "../../hooks/useShelves";
import { useBooks } from "../../hooks/useBooks";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

function updatedAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  if (days < 31) return `updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `updated ${months === 1 ? "a month" : `${months} months`} ago`;
}

/** Decorative spine colours from the design's cover palette (real count, fake titles). */
const SPINES = ["#41553F", "#7A3B2E", "#39424E", "#5E4B3B", "#8C5A3C"];

function SpineStack({ seed, count }: { seed: string; count: number }) {
  const n = Math.min(count, 5);
  if (n === 0) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (
    <div className="flex items-end pl-3.5" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="-ml-3.5 h-[66px] w-11 rounded-[2px] border-l border-white/15 shadow-[-6px_0_10px_-4px_rgba(40,30,15,0.35)]"
          style={{ backgroundColor: SPINES[(hash + i) % SPINES.length] }}
        />
      ))}
    </div>
  );
}

/** Design C9 — the custom shelf list, with C10's create form inline. */
export function Shelves() {
  const { data: shelves, isLoading } = useShelves();
  const createShelf = useCreateShelf();

  const addBook = useAddBookToAnyShelf();
  const { data: library } = useBooks({});

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const shared = (shelves ?? []).filter(
    (s) => (s._count?.shares ?? 0) > 0,
  ).length;

  const candidates = (library ?? []).filter(
    (b) =>
      bookQuery.trim() === "" ||
      `${b.title} ${b.author}`.toLowerCase().includes(bookQuery.toLowerCase()),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const shelf = await createShelf.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      // Design C10: books picked during creation land on the new shelf.
      for (const bookId of selected) {
        await addBook.mutateAsync({ shelfId: shelf.id, bookId });
      }
      setName("");
      setDescription("");
      setSelected(new Set());
      setBookQuery("");
      setOpen(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setError(
        status === 409
          ? "You already have a shelf with that name."
          : "Couldn't create that shelf.",
      );
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            Shelves
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shelves?.length ?? 0} {shelves?.length === 1 ? "shelf" : "shelves"}
            {shared > 0 ? ` · ${shared} shared` : ""}
          </p>
        </div>
        <Button onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "+ New shelf"}
        </Button>
      </header>

      {open && (
        <form
          onSubmit={create}
          className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="shelf-name">Name</Label>
            <Input
              id="shelf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer Beach Reads"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shelf-desc">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="shelf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Light on plot, heavy on atmosphere."
              className="bg-background"
            />
          </div>
          {/* Design C10 — pick books while creating; they can live on many shelves. */}
          <div className="space-y-2">
            <Label>Add books</Label>
            <Input
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
              placeholder="Search your library…"
              className="max-w-xs bg-background"
            />
            {(library ?? []).length > 0 ? (
              <>
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {candidates.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggle(b.id)}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-1.5 text-left text-sm transition-colors " +
                        (selected.has(b.id)
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/40")
                      }
                    >
                      <span>
                        {b.title}{" "}
                        <span className="text-muted-foreground">
                          · {b.author}
                          {b.genre ? ` · ${b.genre}` : ""}
                        </span>
                      </span>
                      {selected.has(b.id) && <span className="text-xs">✓</span>}
                    </button>
                  ))}
                  {candidates.length === 0 && (
                    <p className="px-3 py-1.5 text-sm text-muted-foreground">
                      No books match that search.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Books can live on many shelves at once.
                  {selected.size > 0 &&
                    ` · ${selected.size} ${selected.size === 1 ? "book" : "books"} selected`}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your library is empty — you can add books to the shelf later.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={
              !name.trim() || createShelf.isPending || addBook.isPending
            }
          >
            {createShelf.isPending || addBook.isPending
              ? "Creating…"
              : "Create shelf"}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Shimmer className="h-36 w-full" />
          <Shimmer className="h-36 w-full" />
        </div>
      ) : shelves && shelves.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {shelves.map((shelf) => (
            <Link
              key={shelf.id}
              to={`/shelves/${shelf.id}`}
              className="flex justify-between gap-6 rounded-xl border border-border bg-card p-7 transition-shadow hover:shadow-[0_14px_28px_-12px_rgba(60,45,25,0.28)]"
            >
              <div className="flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-display text-[1.4rem] leading-snug text-foreground">
                      {shelf.name}
                    </h2>
                    {(shelf._count?.shares ?? 0) > 0 && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-[0.7rem] font-semibold text-accent-foreground">
                        Shared
                      </span>
                    )}
                  </div>
                  {shelf.description && (
                    <p className="text-sm text-muted-foreground">
                      {shelf.description}
                    </p>
                  )}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {shelf._count?.books ?? 0}{" "}
                  {shelf._count?.books === 1 ? "book" : "books"} ·{" "}
                  {updatedAgo(shelf.updatedAt)}
                </p>
              </div>
              <SpineStack seed={shelf.id} count={shelf._count?.books ?? 0} />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[9rem] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border p-7 text-center transition-colors hover:bg-card/60"
          >
            <span className="font-display text-3xl font-light text-muted-foreground/70">
              +
            </span>
            <span className="text-[0.9rem] font-medium text-muted-foreground">
              Create a shelf
            </span>
            <span className="text-xs text-muted-foreground/80">
              “Winter comforts”, “Lent to friends”, “To re-read”…
            </span>
          </button>
        </div>
      ) : (
        <EmptyState
          title="Create a shelf"
          line="“Winter comforts”, “Lent to friends”, “To re-read”…"
          action={<Button onClick={() => setOpen(true)}>+ New shelf</Button>}
        />
      )}
    </div>
  );
}
