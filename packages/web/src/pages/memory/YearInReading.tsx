import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/api-client";
import type { YearInReadingResult, YearStats } from "../../lib/types";
import { useAuth } from "../../hooks/useAuth";
import { BookCover } from "../../components/folio/BookCover";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";

/** The design's cover palette, reused for the card spines and velocity bars. */
const SPINES = ["#7A3B2E", "#5E4B3B", "#41553F", "#39424E", "#EFE6D4", "#6B4A55"];

function useYearInReading(year: number) {
  return useQuery({
    queryKey: ["year-in-reading", year],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: YearInReadingResult }>(
        "/ai/year-in-reading",
        { params: { year } },
      );
      return data.data;
    },
    retry: false,
    staleTime: Infinity, // one long local generation per visit is plenty
  });
}

/**
 * 0M Tallying, the retrospective exception: on first reveal only, a count
 * climbs once through intermediate values over 220ms, then never re-runs.
 * Under reduced motion the final value is rendered directly — no climb.
 */
function TallyNumber({ value }: { value: number }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduced ? value : 0);

  // Re-runs whenever `value` changes (e.g. "Try the narrative again" refetches
  // different stats) — a run-once guard here left stale counts on screen.
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 220);
      setShown(Math.round(value * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return <>{shown.toLocaleString()}</>;
}

/** Draw the keepable card on a canvas and download it — nothing is posted. */
async function saveCard(stats: YearStats, headline: string) {
  await document.fonts.ready;
  const scale = 2;
  const w = 520;
  const h = 560;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#221D16";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#F5EFE3";
  ctx.font = "italic 500 20px Newsreader, serif";
  ctx.fillText("Folio", 44, 64);
  ctx.fillStyle = "#A79E8F";
  ctx.font = "600 11px 'Instrument Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(stats.year).toUpperCase(), w - 44, 62);
  ctx.textAlign = "left";

  // Headline, wrapped by hand.
  ctx.fillStyle = "#F5EFE3";
  ctx.font = "500 36px Newsreader, serif";
  const words = headline.split(" ");
  let line = "";
  let y = 130;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > w - 88 && line) {
      ctx.fillText(line, 44, y);
      line = word;
      y += 46;
    } else {
      line = probe;
    }
  }
  ctx.fillText(line, 44, y);

  // Spines.
  const spineY = y + 40;
  SPINES.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(44 + i * 52, spineY, 44, 68);
  });

  // Divider + stats.
  const statY = spineY + 108;
  ctx.strokeStyle = "#3A342B";
  ctx.beginPath();
  ctx.moveTo(44, statY - 26);
  ctx.lineTo(w - 44, statY - 26);
  ctx.stroke();

  const stat = (x: number, big: string, small: string) => {
    ctx.fillStyle = "#F5EFE3";
    ctx.font = "500 24px Newsreader, serif";
    ctx.fillText(big, x, statY + 8);
    ctx.fillStyle = "#A79E8F";
    ctx.font = "400 11px 'Instrument Sans', sans-serif";
    ctx.fillText(small, x, statY + 28);
  };
  stat(44, stats.pages.toLocaleString(), "pages");
  stat(190, stats.wordsWritten.toLocaleString(), "words written");
  if (stats.bookOfTheYear) {
    ctx.fillStyle = "#F5EFE3";
    ctx.font = "500 18px Newsreader, serif";
    ctx.fillText(truncate(stats.bookOfTheYear.title, 20), 336, statY + 6);
    ctx.fillStyle = "#A79E8F";
    ctx.font = "400 11px 'Instrument Sans', sans-serif";
    ctx.fillText("book of the year", 336, statY + 28);
  }

  ctx.fillStyle = "#8A8378";
  ctx.font = "400 11px 'Instrument Sans', sans-serif";
  ctx.fillText("No handles, no links, nothing to tap.", 44, h - 36);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `folio-${stats.year}-in-reading.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Design G20 — Year in Reading: a written retrospective, and one card worth
 * keeping. Counts always render; the narrative is the only part that needs
 * the model, and its absence degrades the page instead of blocking it.
 */
export function YearInReading() {
  const year = new Date().getFullYear();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useYearInReading(year);

  // ── Generating ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-5 py-16">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Writing your year
        </p>
        <div className="flex items-end gap-3" aria-hidden>
          {["#41553F", "#7A3B2E", "#39424E"].map((c, i) => (
            <span
              key={c}
              className="animate-think w-2 rounded-sm"
              style={{
                backgroundColor: c,
                height: [30, 40, 26][i],
                animationDuration: "1.4s",
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
        <h1 className="font-display text-2xl text-foreground">
          Reading back through {year}…
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This takes a couple of minutes on home hardware — it&rsquo;ll be
          waiting when you come back.
        </p>
        <div className="max-w-md space-y-2.5">
          <Shimmer className="h-3.5 w-4/5" />
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-11/12" />
          <Shimmer className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16">
        <h1 className="font-display text-2xl text-foreground">
          The year wouldn&rsquo;t load.
        </h1>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  // ── Too early ───────────────────────────────────────────────────────────
  if (data.status === "tooEarly") {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Not much of a year yet
        </p>
        <h1 className="font-display text-2xl text-foreground">
          {data.finishedCount} book{data.finishedCount === 1 ? "" : "s"}{" "}
          doesn&rsquo;t make a retrospective.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A year in reading needs a year of reading. Folio will write this in
          December, or whenever you&rsquo;ve finished around {data.needed}{" "}
          books — whichever comes first. Nothing to switch on.
        </p>
        <div className="flex items-center gap-4 rounded-[var(--radius)] border border-dashed border-border bg-card p-5">
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: Math.min(data.finishedCount, 6) }).map(
              (_, i) => (
                <div
                  key={i}
                  className="h-9 w-6 rounded-sm"
                  style={{ backgroundColor: SPINES[i % SPINES.length] }}
                />
              ),
            )}
            {Array.from({
              length: Math.max(0, Math.min(6, data.needed) - data.finishedCount),
            }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-6 rounded-sm border border-dashed border-border"
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {data.finishedCount} of about {data.needed}
          </span>
        </div>
        <Link to="/library" className={buttonVariants({ variant: "outline" })}>
          Back to your library
        </Link>
      </div>
    );
  }

  const { stats, narrative } = data;
  const maxFinished = Math.max(1, ...stats.velocity.map((v) => v.finished));
  const maxShift = Math.max(
    1,
    ...stats.genreShifts.map((s) => Math.max(s.before, s.after)),
  );
  const headline =
    narrative?.headline ?? `${stats.finishedCount} books in ${stats.year}`;

  return (
    // Bleeds the dark hero to the layout edge at every gutter width.
    // 0M Settling — the retrospective replaces the generating state whole.
    <div className="animate-settle -mx-4 space-y-0 sm:-mx-8 lg:-mx-12">
      {/* ── Dark hero ─────────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius)] bg-[#221D16] px-5 py-10 text-[#F5EFE3] sm:px-8 sm:py-12 lg:px-12">
        <div className="space-y-4">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-[#B0A695]">
            {user?.name ?? "You"} · a private retrospective
          </p>
          <h1 className="font-display text-[2.6rem] leading-none sm:text-[4rem]">
            {stats.year}, in reading
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-[#C9C1B2]">
            Written from your own library and journal. Nobody else has seen
            this page, and nothing here is published anywhere.
          </p>
        </div>
        {/* 0M Tallying — the hero counts climb once on first reveal. */}
        <div className="mt-8 flex flex-wrap gap-x-14 gap-y-6 border-t border-[#3A342B] pt-7">
          {[
            { value: stats.finishedCount, label: "books finished" },
            { value: stats.pages, label: "pages" },
            { value: stats.wordsWritten, label: "words you wrote about them" },
            { value: stats.abandonedCount, label: "set down unfinished" },
          ].map(({ value, label }) => (
            <div key={label} className="space-y-1">
              <p className="font-display text-4xl">
                <TallyNumber value={value} />
              </p>
              <p className="text-xs text-[#A79E8F]">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="grid gap-10 px-4 py-10 sm:gap-12 sm:px-8 sm:py-12 lg:grid-cols-[1fr_360px] lg:px-12">
        <div className="space-y-9">
          {narrative ? (
            <section className="space-y-4">
              <h2 className="font-display text-2xl text-foreground">
                The shape of it
              </h2>
              {narrative.shape.map((p) => (
                <p
                  key={p.slice(0, 32)}
                  className="max-w-2xl font-display text-[1.1rem] leading-[1.85] text-foreground/90"
                >
                  {p}
                </p>
              ))}
            </section>
          ) : (
            <section className="space-y-3 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-6">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-destructive">
                Narrative unavailable
              </p>
              <p className="font-display text-xl text-foreground">
                The writing didn&rsquo;t come through.
              </p>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                The counts on this page are yours and always available —
                they&rsquo;re read straight off your shelves. Only the written
                part needs the model, and it isn&rsquo;t answering.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try the narrative again
              </Button>
            </section>
          )}

          {narrative && narrative.arcs.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Three arcs
              </h3>
              <div className="space-y-3">
                {narrative.arcs.map((arc) => (
                  <div
                    key={arc.label}
                    className="space-y-1 rounded-[var(--radius)] border border-border bg-card p-5"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {arc.label}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {arc.note}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.standouts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Books that stayed
              </h3>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {stats.standouts.map((b) => (
                  <Link
                    key={b.id}
                    to={`/books/${b.id}`}
                    className="flex gap-4 rounded-[var(--radius)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="w-14 shrink-0">
                      <BookCover
                        title={b.title}
                        author={b.author}
                        coverImage={b.coverImage}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {b.title}
                      </p>
                      {b.note && (
                        <p className="font-display text-[0.85rem] leading-relaxed text-foreground/80 line-clamp-4">
                          {b.note}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-9">
          <section className="space-y-4">
            <h3 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
              How the year read
            </h3>
            <div className="flex h-28 items-end gap-1.5">
              {stats.velocity.map((v, i) => (
                <div
                  key={v.month}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${(v.finished / maxFinished) * 100}%`,
                      minHeight: v.finished > 0 ? 4 : 2,
                      backgroundColor:
                        v.finished > 0
                          ? SPINES[i % SPINES.length]
                          : "hsl(var(--border))",
                    }}
                  />
                  <span className="text-[0.55rem] text-muted-foreground">
                    {v.month}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {stats.genreShifts.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                What shifted
              </h3>
              <div className="space-y-3">
                {stats.genreShifts.map((s) => (
                  <div key={s.genre} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {s.genre}
                      </span>
                      <span className="text-muted-foreground">
                        {s.before} → {s.after}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(s.after / maxShift) * 100}%`,
                          backgroundColor:
                            s.after >= s.before
                              ? "hsl(var(--primary))"
                              : "#B9AB8F",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Counted from your shelves, compared with {stats.year - 1}.
                It&rsquo;s a description of a year, not a judgement about you.
              </p>
            </section>
          )}
        </aside>
      </div>

      {/* ── Keep a card ───────────────────────────────────────────────── */}
      <div className="space-y-4 px-4 pb-12 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl text-foreground">Keep a card</h2>
            <p className="text-sm text-muted-foreground">
              A single image of the year. Saved to your device — Folio
              doesn&rsquo;t post it anywhere.
            </p>
          </div>
          <Button onClick={() => void saveCard(stats, headline)}>
            Save the card
          </Button>
        </div>
        <div className="flex justify-center rounded-[var(--radius)] border border-border bg-secondary/60 p-8">
          <div className="w-full max-w-[520px] space-y-5 rounded-[10px] bg-[#221D16] p-6 text-[#F5EFE3] shadow-xl sm:space-y-6 sm:p-10">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-xl italic">Folio</span>
              <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[#A79E8F]">
                {stats.year}
              </span>
            </div>
            <p className="font-display text-3xl leading-tight sm:text-[2.2rem]">
              {headline}
            </p>
            <div className="flex gap-1.5" aria-hidden>
              {SPINES.map((c) => (
                <div
                  key={c}
                  className="h-16 w-11 rounded-sm"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {/* 0M Tallying — the card's counts share the one-shot climb. */}
            <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-[#3A342B] pt-5">
              <div>
                <p className="font-display text-2xl">
                  <TallyNumber value={stats.pages} />
                </p>
                <p className="text-[0.65rem] text-[#A79E8F]">pages</p>
              </div>
              <div>
                <p className="font-display text-2xl">
                  <TallyNumber value={stats.wordsWritten} />
                </p>
                <p className="text-[0.65rem] text-[#A79E8F]">words written</p>
              </div>
              {stats.bookOfTheYear && (
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl">
                    {stats.bookOfTheYear.title}
                  </p>
                  <p className="text-[0.65rem] text-[#A79E8F]">
                    book of the year
                  </p>
                </div>
              )}
            </div>
            <p className="text-[0.65rem] text-[#8A8378]">
              No handles, no links, nothing to tap. Yours to keep or not.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
