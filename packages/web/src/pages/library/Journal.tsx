import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBook, useJournal, useSaveJournal } from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { Shimmer } from "../../components/folio/Shimmer";
import { cn } from "../../lib/utils";

const RATING_WORD: Record<number, string> = {
  1: "not for me",
  2: "had its moments",
  3: "worth the time",
  4: "stayed with me",
  5: "unforgettable",
};

/** Design B8 — the review logger. Distraction-free, finished books only. */
export function Journal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: book, isLoading } = useBook(id);
  const { data: journal } = useJournal(id);
  const saveJournal = useSaveJournal(id ?? "");

  const [reflectionText, setReflectionText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [quotes, setQuotes] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate once the existing entry arrives.
  useEffect(() => {
    if (journal) {
      setReflectionText(journal.reflectionText);
      setRating(journal.rating);
      setQuotes((journal.favoriteQuotes ?? []).join("\n"));
    }
  }, [journal]);

  const words = reflectionText.trim()
    ? reflectionText.trim().split(/\s+/).length
    : 0;

  async function save() {
    if (!reflectionText.trim()) return;
    setError(null);
    try {
      await saveJournal.mutateAsync({
        reflectionText: reflectionText.trim(),
        rating: rating ?? undefined,
        favoriteQuotes: quotes
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean),
      });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      // The API gates journals behind FINISHED — surface that honestly.
      setError(
        status === 409
          ? "Mark this book Finished before writing your review."
          : "Couldn't save your review.",
      );
    }
  }

  // ⌘S / Ctrl+S to save, as the design promises.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (isLoading || !book) return <Shimmer className="h-64 w-full" />;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex items-center justify-between gap-4">
        <Link
          to={`/books/${book.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to {book.title}
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            {saveJournal.isPending
              ? "Saving…"
              : savedAt
                ? `Saved ${savedAt} · visible only to you`
                : "Visible only to you"}
          </span>
          <Button size="sm" onClick={() => navigate(`/books/${book.id}`)}>
            Done
          </Button>
        </div>
      </header>

      <div className="space-y-1">
        <h1 className="font-display text-[1.75rem] text-foreground">
          {book.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[book.author, book.genre].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={cn(
                  "text-2xl leading-none transition-colors",
                  rating && n <= rating
                    ? "text-primary"
                    : "text-muted-foreground/40 hover:text-primary/50",
                )}
              >
                ★
              </button>
            ))}
          </div>
          {rating && (
            <span className="text-sm text-muted-foreground">
              {rating} — {RATING_WORD[rating]}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <textarea
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          placeholder="What did you think of it?"
          rows={14}
          className="w-full resize-none rounded-[var(--radius)] border border-border bg-card p-5 font-display text-[1.05rem] leading-relaxed text-foreground outline-none focus:border-primary/50"
        />
        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span>{words} words</span>
          <span className="font-mono">⌘S to save</span>
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Favourite quotes — one per line
        </label>
        <textarea
          value={quotes}
          onChange={(e) => setQuotes(e.target.value)}
          rows={4}
          placeholder="“What the ash keeps, the rain returns —”"
          className="w-full resize-none rounded-[var(--radius)] border border-border bg-card p-4 font-display text-sm italic leading-relaxed text-foreground outline-none focus:border-primary/50"
        />
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={save} disabled={!reflectionText.trim() || saveJournal.isPending}>
        {saveJournal.isPending ? "Saving…" : "Save review"}
      </Button>
    </div>
  );
}
