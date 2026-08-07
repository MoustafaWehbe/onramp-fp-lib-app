import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBook, useJournal, useSaveJournal } from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/folio/EmptyState";
import { JournalPrompts } from "../../components/folio/JournalPrompts";
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
  const { data: book, isLoading, isError, refetch } = useBook(id);
  const { data: journal } = useJournal(id);
  const saveJournal = useSaveJournal(id ?? "");

  const [reflectionText, setReflectionText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [quotes, setQuotes] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the server last saw — so autosave only fires on real changes.
  const lastSavedRef = useRef<string>("");
  // 0M Acknowledging (B8a) — counts chip picks. The textarea is keyed on it,
  // so each pick re-runs the 140ms opacity settle on the inserted text.
  const [ackTick, setAckTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // After a pick, the caret lands at the end of the inserted prompt — the
  // canvas keeps the cursor live throughout.
  useEffect(() => {
    if (ackTick === 0) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [ackTick]);

  // Hydrate once the existing entry arrives.
  useEffect(() => {
    if (journal) {
      setReflectionText(journal.reflectionText);
      setRating(journal.rating);
      setQuotes((journal.favoriteQuotes ?? []).join("\n"));
      lastSavedRef.current = JSON.stringify({
        reflectionText: journal.reflectionText,
        rating: journal.rating,
        quotes: (journal.favoriteQuotes ?? []).join("\n"),
      });
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
      lastSavedRef.current = JSON.stringify({ reflectionText, rating, quotes });
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

  // "Autosaves every 30s" — but only when something actually changed, and
  // never while a save is already in flight.
  useEffect(() => {
    const timer = setInterval(() => {
      const snapshot = JSON.stringify({ reflectionText, rating, quotes });
      if (
        reflectionText.trim() &&
        snapshot !== lastSavedRef.current &&
        !saveJournal.isPending
      ) {
        void save();
      }
    }, 30_000);
    return () => clearInterval(timer);
  });

  // A settled failure must not read as loading — nothing written is at risk,
  // but the page has to say the book couldn't be reached.
  if (isError && !book) {
    return (
      <EmptyState
        title="This book wouldn’t open."
        line="Your journal is safe — the page just couldn’t reach the book. Try again in a moment."
        action={
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

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

      {/* Design B8a — AI openings, only while the reflection hasn't been
          written yet. They suggest; the cursor below stays live throughout. */}
      {!journal?.reflectionText && (
        <JournalPrompts
          // Keyed: the route keeps this component mounted across books, and
          // its dismissed/hidden state is lazily read from storage — without
          // the key, one book's dismissal would leak onto the next.
          key={book.id}
          bookId={book.id}
          onPick={(prompt) => {
            setReflectionText((text) =>
              text.trim() ? `${text.trimEnd()}\n\n${prompt}\n` : `${prompt}\n`,
            );
            setAckTick((t) => t + 1);
          }}
        />
      )}

      <section className="space-y-2">
        <textarea
          key={ackTick}
          ref={textareaRef}
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          placeholder="What did you think of it?"
          rows={14}
          className={cn(
            "w-full resize-none rounded-[var(--radius)] border border-border bg-card p-5 font-display text-[1.05rem] leading-relaxed text-foreground outline-none focus:border-primary/50",
            ackTick > 0 && "animate-acknowledge",
          )}
        />
        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span>{words} words</span>
          <span className="font-mono">⌘S to save · autosaves every 30s</span>
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

      <Button
        onClick={save}
        disabled={!reflectionText.trim() || saveJournal.isPending}
      >
        {saveJournal.isPending ? "Saving…" : "Save review"}
      </Button>
    </div>
  );
}
