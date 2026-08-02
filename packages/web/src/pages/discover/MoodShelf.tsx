import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBuildMoodShelf } from "../../hooks/useDiscovery";
import { useCreateShelf } from "../../hooks/useShelves";
import { apiClient } from "../../lib/api-client";
import type { MoodShelfResult } from "../../lib/types";
import { BookCover } from "../../components/folio/BookCover";
import { Button, buttonVariants } from "../../components/ui/button";
import { cn } from "../../lib/utils";

const EXAMPLES = [
  "short and funny",
  "a book that feels like October",
  "something I'll finish on a train",
  "quiet, nothing dramatic",
];

/** The design's thinking bars — book spines waiting to be pulled. */
function ThinkBars() {
  const bars = [
    { color: "#41553F", height: 34, delay: 0 },
    { color: "#7A3B2E", height: 44, delay: 0.18 },
    { color: "#39424E", height: 28, delay: 0.36 },
    { color: "#5E4B3B", height: 40, delay: 0.54 },
  ];
  return (
    <div className="flex items-end gap-3.5" aria-hidden>
      {bars.map((b) => (
        <span
          key={b.color}
          className="animate-think w-2.5 rounded-sm"
          style={{
            backgroundColor: b.color,
            height: b.height,
            animationDuration: "1.4s",
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Time-based estimate for local generation — honest about being a guess. */
function ThinkingProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const expected = 60;
  const pct = Math.min(90, Math.round((elapsed / expected) * 100));
  const left = Math.max(5, expected - elapsed);
  return (
    <div className="flex items-center gap-3">
      <div className="h-[3px] w-64 overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-primary transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {elapsed < expected ? `about ${left}s left` : "almost there…"}
      </span>
    </div>
  );
}

/**
 * Design D16 — Mood Shelf: a sentence in, a themed shelf out. Everything is
 * drawn from the reader's own library; the mood itself is never stored.
 */
export function MoodShelf() {
  const navigate = useNavigate();
  const build = useBuildMoodShelf();
  const createShelf = useCreateShelf();
  const [mood, setMood] = useState("");
  const [result, setResult] = useState<MoodShelfResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [keeping, setKeeping] = useState(false);
  // Failing to SAVE a built shelf is not the same as failing to BUILD one —
  // the results must stay on screen, with the error beside the keep button.
  const [keepError, setKeepError] = useState<string | null>(null);
  // Cancel discards the in-flight build: only the latest request may land.
  const requestSeq = useRef(0);

  async function run(text: string, force = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMood(trimmed);
    setFailed(false);
    setKeepError(null);
    setResult(null);
    const seq = ++requestSeq.current;
    try {
      const data = await build.mutateAsync({ mood: trimmed, force });
      if (seq === requestSeq.current) setResult(data);
    } catch {
      if (seq === requestSeq.current) setFailed(true);
    }
  }

  function cancel() {
    requestSeq.current++;
    build.reset();
  }

  async function keepAsShelf() {
    if (result?.status !== "ok" || keeping) return;
    setKeeping(true);
    setKeepError(null);
    try {
      const shelf = await createShelf.mutateAsync({
        name: result.title.slice(0, 120),
        description: "Kept from a mood shelf.",
      });
      for (const item of result.items) {
        await apiClient.post(`/shelves/${shelf.id}/books`, { bookId: item.id });
      }
      navigate(`/shelves/${shelf.id}`);
    } catch (err) {
      setKeeping(false);
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setKeepError(
        status === 409
          ? "You already have a shelf with this name — it may hold these books."
          : "Couldn't save the shelf just now. The picks are still here — try again.",
      );
    }
  }

  const thinking = build.isPending;

  // ── Thinking ────────────────────────────────────────────────────────────
  if (thinking) {
    return (
      <div className="flex flex-col items-center gap-6 py-24 text-center">
        <ThinkBars />
        <h1 className="font-display text-2xl text-foreground">
          Pulling a shelf together for{" "}
          <span className="italic">{mood}</span>
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Reading back through your books and what you wrote about them. This
          runs on home hardware and can take a minute — you can leave the page
          and come back.
        </p>
        <ThinkingProgress />
        <button
          onClick={cancel}
          className="text-xs font-medium text-primary underline hover:text-accent-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Unavailable ─────────────────────────────────────────────────────────
  if (failed) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-destructive">
          Mood shelf · unavailable
        </p>
        <h1 className="font-display text-2xl text-foreground">
          The shelf-builder is asleep.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Generation runs on hardware at home, and it isn&rsquo;t answering.
          Your mood is kept in the box — press Try again whenever, or browse by
          shelf in the meantime.
        </p>
        <div className="flex gap-2.5 pt-2">
          <Button onClick={() => run(mood)}>Try again</Button>
          <Link to="/shelves" className={buttonVariants({ variant: "outline" })}>
            Browse your shelves
          </Link>
        </div>
      </div>
    );
  }

  // ── Thin taste ──────────────────────────────────────────────────────────
  if (result?.status === "thin") {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Mood shelf · taste too thin
        </p>
        <div className="flex items-end gap-1.5 py-1" aria-hidden>
          {["#41553F", "#7A3B2E", "#39424E"]
            .slice(0, Math.max(1, result.embeddedCount))
            .map((c) => (
              <div
                key={c}
                className="h-11 w-[30px] rounded-sm"
                style={{ backgroundColor: c }}
              />
            ))}
          {Array.from({
            length: Math.max(0, result.needed - result.embeddedCount),
          }).map((_, i) => (
            <div
              key={i}
              className="h-11 w-[30px] rounded-sm border border-dashed border-border"
            />
          ))}
        </div>
        <h1 className="font-display text-2xl text-foreground">
          {result.embeddedCount} book
          {result.embeddedCount === 1 ? "" : "s"} isn&rsquo;t much to go on.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Mood shelves read your ratings and reflections, and yours are still
          short. Folio would rather say so than invent a taste for you.
        </p>
        <ul className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-5 text-sm text-foreground/85">
          <li className="flex gap-2.5">
            <span className="text-primary">·</span> Finish and rate a few more
            books
          </li>
          <li className="flex gap-2.5">
            <span className="text-primary">·</span> Or write a reflection on
            one you&rsquo;ve already finished
          </li>
        </ul>
        <div className="flex gap-2.5 pt-2">
          <Link to="/library" className={buttonVariants({ variant: "default" })}>
            Go to your library
          </Link>
          <Button variant="outline" onClick={() => run(mood, true)}>
            Build one anyway
          </Button>
        </div>
      </div>
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────
  if (result?.status === "ok") {
    return (
      // 0M Settling — 140ms even at this full-page scale (no distance
      // scaling by rule; flagged for an on-device re-check).
      <div className="animate-settle space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              Mood shelf · built just now
            </p>
            <h1 className="font-display text-2xl leading-tight text-foreground sm:text-[2rem]">
              {result.title}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.items.length} book
              {result.items.length === 1 ? "" : "s"} that fit the mood, all
              from your own library. Have a look and keep what&rsquo;s right —
              it&rsquo;s a suggestion, not a reading list.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setKeepError(null);
                  setResult(null);
                }}
              >
                Try another mood
              </Button>
              <Button onClick={keepAsShelf} disabled={keeping}>
                {keeping ? "Keeping…" : "Keep as a shelf"}
              </Button>
            </div>
            {keepError && (
              <p className="max-w-xs text-xs text-destructive sm:text-right">
                {keepError}
              </p>
            )}
          </div>
        </header>

        {/* D16 mobile: horizontal rows; the five-column grid is a desktop shape. */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
          {result.items.map((m) => (
            <Link
              key={m.id}
              to={`/books/${m.id}`}
              className="group flex items-start gap-4 sm:block sm:space-y-3"
            >
              <div className="w-[74px] shrink-0 transition-transform duration-200 group-hover:-translate-y-1 sm:w-full">
                <BookCover
                  title={m.title}
                  author={m.author}
                  coverImage={m.coverImage}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {m.title}
                </p>
                <p className="text-xs text-muted-foreground">{m.author}</p>
                <p className="font-display text-[0.85rem] leading-relaxed text-foreground/80">
                  {m.why}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <p className="border-t border-border pt-5 text-xs text-muted-foreground">
          Assembled from your own library and reflections. Folio is guessing at
          a mood, not telling you what you like.
        </p>
      </div>
    );
  }

  // ── Input ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-7 py-16 text-center">
      <div className="max-w-xl space-y-3">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Mood shelf
        </p>
        <h1 className="font-display text-3xl leading-tight text-foreground sm:text-[2.5rem]">
          What are you in the mood for?
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Describe it however it comes out. Folio builds a small shelf from
          what it knows of your taste — your own reading, nobody else&rsquo;s.
        </p>
      </div>

      {/* D16 mobile: the box stands alone and the button goes full width. */}
      <form
        className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:rounded-[var(--radius)] sm:border-[1.5px] sm:border-primary sm:bg-card sm:px-4 sm:py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(mood);
        }}
      >
        <input
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          autoFocus
          maxLength={200}
          placeholder="something for a rainy weekend"
          className="min-h-[3.5rem] flex-1 rounded-[var(--radius)] border-[1.5px] border-primary bg-card px-4 font-display text-base text-foreground outline-none placeholder:text-muted-foreground/50 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:text-lg"
        />
        <Button
          type="submit"
          disabled={!mood.trim()}
          className="min-h-[3rem] w-full sm:min-h-0 sm:w-auto"
        >
          Build the shelf
        </Button>
      </form>

      <div className="flex max-w-2xl flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => void run(ex)}
            className={cn(
              "rounded-full border border-border px-4 py-1.5 font-display text-[0.85rem] italic",
              "text-muted-foreground transition-colors hover:border-primary hover:text-accent-foreground",
            )}
          >
            {ex}
          </button>
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>🔒</span> Your moods aren&rsquo;t stored after the
        shelf is built, and never leave your account.
      </p>
    </div>
  );
}
