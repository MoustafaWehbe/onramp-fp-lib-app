import { useState } from "react";
import { useDiscoveryReports, useGenerateReport } from "../../hooks/useDiscovery";
import { useBooks, useCreateBook } from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { BookCover } from "../../components/folio/BookCover";
import { EmptyState } from "../../components/folio/EmptyState";
import { Link } from "react-router-dom";
import { buttonVariants } from "../../components/ui/button";
import type { DiscoveryItem } from "../../lib/types";

const MOOD_EXAMPLES = [
  "something melancholic, under 300 pages",
  "a book to read by a fire",
  "nothing sad this time",
  "a debut novel",
  "translated fiction",
];

/** Design D13–D15 — discovery entry, the mood modifier, and the report. */
export function Discover() {
  const generate = useGenerateReport();
  const { data: history } = useDiscoveryReports();
  const { data: finished } = useBooks({ status: "FINISHED" });

  const [moodOpen, setMoodOpen] = useState(false);
  const [mood, setMood] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createBook = useCreateBook();
  // Per-recommendation UI state, keyed by rank within the visible report.
  const [itemState, setItemState] = useState<
    Record<number, "added" | "inLibrary" | "dismissed">
  >({});

  // Show the freshly generated report if there is one, otherwise the last one
  // we stored — so a report survives a refresh (design D13, "Last report").
  const report = generate.data ?? history?.[0];
  const finishedCount = finished?.length ?? 0;
  const canGenerate = finishedCount > 0;

  async function run(withMood?: string) {
    setError(null);
    setMoodOpen(false);
    try {
      await generate.mutateAsync(withMood?.trim() || undefined);
      setItemState({});
    } catch {
      setError(
        "Couldn't build a report. The model may be unreachable, or you may not have enough finished books yet.",
      );
    }
  }

  async function wantToRead(item: DiscoveryItem) {
    setError(null);
    try {
      await createBook.mutateAsync({
        title: item.title,
        author: item.author,
        status: "WANT_TO_READ",
      });
      setItemState((s) => ({ ...s, [item.rank]: "added" }));
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status === 409) {
        setItemState((s) => ({ ...s, [item.rank]: "inLibrary" }));
      } else {
        setError("Couldn't add that book to your library.");
      }
    }
  }

  // Design D13 empty — "five finished books is enough to start", with a real
  // progress meter. It shows until five books are finished (or a report
  // exists); the backend can often manage earlier, so from the first finished
  // book a "try anyway" path stays reachable.
  if (finishedCount < 5 && !report && !generate.isPending) {
    const goal = 5;
    return (
      <div className="mx-auto max-w-md space-y-6 py-16 text-center">
        <p className="font-display text-2xl text-foreground">No report yet.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Once you've finished and rated a few books, Folio can read your taste
          and suggest three titles at a time. Five finished books is enough to
          start.
        </p>
        <div className="space-y-2">
          <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{
                width: `${Math.min(100, (finishedCount / goal) * 100)}%`,
              }}
            />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {Math.min(finishedCount, goal)} of {goal} finished books
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link to="/library" className={buttonVariants()}>
            Go to your library
          </Link>
          {canGenerate && (
            <Button variant="ghost" onClick={() => run()}>
              Try a report anyway
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-primary">
            Taste discovery
          </p>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            Recommendations from your own shelf.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Folio reads your library — what you finished, what you abandoned,
            what you rated five stars — and suggests three books at a time. No
            trends, no bestseller lists, no one else’s data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMoodOpen((m) => !m)}>
            Add a mood
          </Button>
          <Button onClick={() => run(mood)} disabled={generate.isPending}>
            {generate.isPending
              ? "Reading your shelf…"
              : report
                ? "↻ Regenerate"
                : "Generate a new report"}
          </Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Your library is sent to the model anonymously and never stored.
      </p>

      {moodOpen && (
        <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-5">
          <div>
            <h2 className="font-display text-lg text-foreground">
              What are you in the mood for?
            </h2>
            <p className="text-sm text-muted-foreground">
              A one-time note laid over your standing taste profile. It shapes
              this report only.
            </p>
          </div>
          <Input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="something melancholic, under 300 pages"
            className="bg-background"
          />
          <div className="flex flex-wrap gap-2">
            {MOOD_EXAMPLES.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to use your taste profile alone.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => run(mood)} disabled={generate.isPending}>
              Generate report
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMood("");
                setMoodOpen(false);
              }}
            >
              Skip
            </Button>
          </div>
        </section>
      )}

      {generate.isPending && (
        <section className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-8 text-center">
          <p className="font-display text-lg text-foreground">
            Reading your shelf…
          </p>
          <p className="text-sm text-muted-foreground">
            Weighing {finishedCount} finished{" "}
            {finishedCount === 1 ? "book" : "books"} and what you said about
            them.
          </p>
          <p className="text-xs text-muted-foreground">
            Usually under 30 seconds.
          </p>
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && !generate.isPending && (
        <section className="space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="font-display text-xl text-foreground">
              Discovery report ·{" "}
              {new Date(report.createdAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <p className="text-sm text-muted-foreground">
              Three books, chosen from your shelf outward.
            </p>
            {report.moodModifier && (
              <p className="mt-1 text-sm text-accent-foreground">
                Mood: “{report.moodModifier}”
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {report.items
              .filter((item) => itemState[item.rank] !== "dismissed")
              .map((item) => (
                <article
                  key={item.rank}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex items-start gap-5 border-b border-border/60 p-6">
                    <div className="w-16 flex-shrink-0" aria-hidden="true">
                      <BookCover title={item.title} author={item.author} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                        The match
                      </p>
                      <h3 className="font-display text-xl leading-snug text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {item.author}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-primary">
                      The why
                    </p>
                    <blockquote className="border-l-2 border-primary pl-4 font-display italic leading-relaxed text-foreground">
                      {item.rationale}
                    </blockquote>
                    <div className="flex-1" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => wantToRead(item)}
                        disabled={
                          !!itemState[item.rank] || createBook.isPending
                        }
                      >
                        {itemState[item.rank] === "added"
                          ? "Added ✓"
                          : itemState[item.rank] === "inLibrary"
                            ? "Already in your library"
                            : "Want to read"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setItemState((s) => ({
                            ...s,
                            [item.rank]: "dismissed",
                          }))
                        }
                      >
                        Not for me
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
