import { useState } from "react";
import { Link } from "react-router-dom";
import { useCreateShelf, useShelves } from "../../hooks/useShelves";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

/** Design C9 — the custom shelf list, with C10's create form inline. */
export function Shelves() {
  const { data: shelves, isLoading } = useShelves();
  const createShelf = useCreateShelf();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const shared = (shelves ?? []).filter((s) => (s._count?.shares ?? 0) > 0).length;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createShelf.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
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
            {shelves?.length ?? 0}{" "}
            {shelves?.length === 1 ? "shelf" : "shelves"}
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={!name.trim() || createShelf.isPending}
          >
            {createShelf.isPending ? "Creating…" : "Create shelf"}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Shimmer className="h-24 w-full" />
          <Shimmer className="h-24 w-full" />
        </div>
      ) : shelves && shelves.length > 0 ? (
        <div className="space-y-3">
          {shelves.map((shelf) => (
            <Link
              key={shelf.id}
              to={`/shelves/${shelf.id}`}
              className="block rounded-[var(--radius)] border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display text-lg text-foreground">
                    {shelf.name}
                  </h2>
                  {shelf.description && (
                    <p className="text-sm text-muted-foreground">
                      {shelf.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {shelf._count?.books ?? 0}{" "}
                    {shelf._count?.books === 1 ? "book" : "books"}
                  </p>
                </div>
                {(shelf._count?.shares ?? 0) > 0 && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-[0.7rem] text-accent-foreground">
                    Shared
                  </span>
                )}
              </div>
            </Link>
          ))}
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
