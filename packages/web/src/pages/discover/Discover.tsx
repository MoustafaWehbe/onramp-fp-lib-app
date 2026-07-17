import { useState } from "react";
import { useGenerateReport } from "../../hooks/useDiscovery";
import { useBooks } from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { EmptyState } from "../../components/folio/EmptyState";
import { Link } from "react-router-dom";
import { buttonVariants } from "../../components/ui/button";

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
  const { data: finished } = useBooks({ status: "FINISHED" });

  const [moodOpen, setMoodOpen] = useState(false);
  const [mood, setMood] = useState("");
  const [error, setError] = useState<string | null>(null);

  const report = generate.data;
  const finishedCount = finished?.length ?? 0;
  const canGenerate = finishedCount > 0;

  async function run(withMood?: string) {
    setError(null);
    setMoodOpen(false);
    try {
      await generate.mutateAsync(withMood?.trim() || undefined);
    } catch {
      setError(
        "Couldn't build a report. The model may be unreachable, or you may not have enough finished books yet.",
      );
    }
  }

  if (!canGenerate && !report) {
    return (
      <EmptyState
        title="No report yet."
        line="Finish a few books and Folio can start reading your shelf back to you."
        action={
          <Link to="/library" className={buttonVariants()}>
            Go to your library
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-foreground">
            Taste discovery
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recommendations from your own shelf.
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

          <div className="space-y-4">
            {report.items.map((item) => (
              <article
                key={item.rank}
                className="rounded-[var(--radius)] border border-border bg-card p-5"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-primary">
                    {item.rank}
                  </span>
                  <div>
                    <h3 className="font-display text-lg text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {item.author}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    The why
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {item.rationale}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
