import { useEffect, useRef, useState } from "react";
import ePub, { type Book as EpubBook, type Rendition } from "epubjs";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { useAuth } from "../../hooks/useAuth";
import { Shimmer } from "./Shimmer";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { ReaderStatus } from "../../pages/library/Reader";

/** Progress writes wait for the location to settle. */
const SAVE_DEBOUNCE_MS = 1_200;

/**
 * The same families the app loads — nothing new enters the iframe. The
 * stylesheet href matches index.html so the fonts are already cached.
 */
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Instrument+Sans:ital,wght@0,400..700;1,400..600&display=swap";

/** Reading typography — a per-user preference, not a per-book one. */
interface EpubPrefs {
  fontSize: number; // px
  lineHeight: number;
  family: "serif" | "sans";
  measure: "narrow" | "default" | "wide";
}
const DEFAULT_PREFS: EpubPrefs = {
  fontSize: 18,
  lineHeight: 1.65,
  family: "serif",
  measure: "default",
};
const FONT_SIZES = [16, 18, 20, 22];
const LINE_HEIGHTS = [1.5, 1.65, 1.8];
/** Content width. Default lands ~65–75 characters per line at 18px. */
const MEASURES = { narrow: 560, default: 672, wide: 780 } as const;
const FAMILY_CSS = {
  serif: "'Newsreader', Georgia, serif",
  sans: "'Instrument Sans', system-ui, sans-serif",
} as const;

function prefsKey(userId: string | undefined) {
  return `folio:reader:epub:${userId ?? "anon"}`;
}
function loadPrefs(userId: string | undefined): EpubPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey(userId)) ?? "{}");
    return {
      fontSize: FONT_SIZES.includes(raw.fontSize)
        ? raw.fontSize
        : DEFAULT_PREFS.fontSize,
      lineHeight: LINE_HEIGHTS.includes(raw.lineHeight)
        ? raw.lineHeight
        : DEFAULT_PREFS.lineHeight,
      family: raw.family === "sans" ? "sans" : "serif",
      measure: ["narrow", "default", "wide"].includes(raw.measure)
        ? raw.measure
        : DEFAULT_PREFS.measure,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** The iframe body rules for a preference set. */
function themeRules(prefs: EpubPrefs) {
  return {
    body: {
      "font-family": `${FAMILY_CSS[prefs.family]} !important`,
      "font-size": `${prefs.fontSize}px !important`,
      "line-height": `${prefs.lineHeight} !important`,
      color: "#221D16 !important",
    },
    "p, li, blockquote": {
      "font-family": "inherit !important",
      "line-height": "inherit !important",
    },
  };
}

interface EpubReaderProps {
  bookId: string;
  /** Resume position: an EPUB CFI stored as a string, or null. */
  initialPosition: string | null;
  /** Reports position + percent up to the chrome bar. */
  onStatus?: (s: ReaderStatus) => void;
}

/**
 * The EPUB reading surface. epub.js renders chapters into an iframe it owns;
 * we own the measure, the typography, and the chrome. The whole file is
 * fetched once as an ArrayBuffer — an EPUB is a ZIP, and epub.js's
 * byte-range mode wants the server to unzip per-resource, which ours
 * deliberately doesn't. Position is a CFI: it survives reflow, so type
 * changes re-land on the same words even though pagination moves.
 */
export function EpubReader({
  bookId,
  initialPosition,
  onStatus,
}: EpubReaderProps) {
  const { user } = useAuth();
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Single-spine books render as one continuous scroll; the paging
  // controls hide rather than sit there inert.
  const [scrolledDoc, setScrolledDoc] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPrefs(user?.id));
  const saveProgress = useSaveProgress(bookId);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveRef = useRef(saveProgress);
  saveRef.current = saveProgress;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const lastCfiRef = useRef<string | null>(initialPosition);

  // ── Open the book ────────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let book: EpubBook | null = null;
    let cleanupResize: (() => void) | null = null;

    (async () => {
      const res = await fetch(bookFileUrl(bookId, "EPUB"));
      if (!res.ok) throw new Error(`file fetch ${res.status}`);
      const data = await res.arrayBuffer();
      if (cancelled) return;

      book = ePub(data);
      await book.ready;
      if (cancelled) return;

      // Flow branches on the spine: a single-file EPUB has no chapter
      // boundaries to page across, so continuous scroll is the honest
      // presentation — and it stays clear of the paginated manager's
      // resume-state trouble (see the note at the resume below).
      const spineCount = (book.spine as unknown as { items: unknown[] }).items
        .length;
      const singleSpine = spineCount <= 1;
      setScrolledDoc(singleSpine);

      const rendition = book.renderTo(host, {
        width: "100%",
        height: "100%",
        // Paginated like a book, not a scroll — the journal-page feel —
        // except for single-file books, which scroll (see above).
        flow: singleSpine ? "scrolled-doc" : "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;

      // The reader's families, straight from the token set; the stylesheet
      // matches index.html so the fonts come from cache.
      rendition.hooks.content.register(
        (contents: { addStylesheet: (url: string) => Promise<unknown> }) =>
          contents.addStylesheet(FONTS_HREF),
      );
      rendition.themes.default(themeRules(loadPrefs(user?.id)));

      const locations = book.locations;
      void locations.generate(600).then(() => {
        // Locations make percent meaningful; refresh the bar once they exist.
        if (!cancelled && lastCfiRef.current) {
          const pct =
            Math.round(locations.percentageFromCfi(lastCfiRef.current) * 1000) /
            10;
          onStatusRef.current?.({ label: "Reading", percent: pct });
        }
      });

      // Touch paging: a tap on the outer thirds turns the page — the 375px
      // affordance; the middle third stays free for links and selection.
      // Only for paginated books: in a scrolled document the scroll IS the
      // gesture. Listeners go straight onto each chapter document (epub.js's
      // own click relay proved unreliable). Geometry note: the iframe spans
      // the whole column strip and the container scrolls it, so clientX
      // arrives in strip coordinates — subtract the scroll offset for the
      // on-screen position.
      if (!singleSpine) {
        rendition.hooks.content.register((contents: { document: Document }) => {
          contents.document.addEventListener("click", (event: MouseEvent) => {
            if ((event.target as HTMLElement).closest("a")) return;
            const container = host.querySelector(".epub-container");
            const onScreenX = event.clientX - (container?.scrollLeft ?? 0);
            const w = host.clientWidth;
            if (onScreenX < w / 3) void rendition.prev();
            else if (onScreenX > (2 * w) / 3) void rendition.next();
          });
        });
      }

      rendition.on(
        "relocated",
        (location: { start: { cfi: string; percentage?: number } }) => {
          const cfi = location.start.cfi;
          lastCfiRef.current = cfi;
          const pct = locations.length()
            ? Math.round(locations.percentageFromCfi(cfi) * 1000) / 10
            : 0;
          onStatusRef.current?.({ label: "Reading", percent: pct });
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            saveRef.current.mutate({ position: cfi, percent: pct });
          }, SAVE_DEBOUNCE_MS);
        },
      );

      // epub.js renders through requestAnimationFrame, which a hidden tab
      // freezes — a book opened in a background tab must wait for the first
      // look, not fail its 6s race while nobody is watching.
      if (document.visibilityState !== "visible") {
        await new Promise<void>((visible) => {
          const onChange = () => {
            if (!document.hidden) {
              document.removeEventListener("visibilitychange", onChange);
              visible();
            }
          };
          document.addEventListener("visibilitychange", onChange);
        });
        if (cancelled) return;
      }

      // Two-step open: the bare display() is the reliable one; displaying
      // straight to a CFI before any view exists hangs intermittently in
      // 0.3.x. Open at the start, then jump — and race a timeout so a bad
      // or hung CFI degrades to page one instead of a spinner forever.
      const attempt = (target?: string) =>
        Promise.race([
          rendition.display(target).then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((done) =>
            window.setTimeout(() => done(false), 6_000),
          ),
        ]);
      const opened = await attempt();
      if (cancelled) return;
      if (!opened) throw new Error("epub display never settled");
      if (initialPosition) {
        await attempt(initialPosition);
        if (cancelled) return;
        // Why the flow branches on spine count (see renderTo above), and a
        // corrected diagnosis: an earlier note here blamed "single spine
        // item" books for dead paging after resume. That was wrong — the
        // reproduced trigger is a resume CFI that lands on a DEGENERATE
        // spine item (Gutenberg's 431-byte wrap0000.html): after that
        // display-to-CFI, the paginated manager's prev/next silently no-op
        // (epub.js 0.3.93; same file resumes fine to a real chapter). The
        // wrapper CFI gets saved naturally on a book's very first open, so
        // the wedge recurs on that build. Upstream, documented, not fixed
        // here. Genuinely single-file EPUBs take the scrolled-doc branch
        // where none of this machinery applies.
      }

      // In scrolled-doc flow, scrolling does NOT fire relocated on its own —
      // without this, the only CFI ever saved is the document start and
      // resume goes nowhere. A debounced scroll listener asks the rendition
      // to report its location, which fires relocated and flows into the
      // existing save path.
      if (singleSpine) {
        const container = host.querySelector(".epub-container");
        if (container) {
          let scrollTimer: number | undefined;
          const onScroll = () => {
            window.clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(() => {
              (
                rendition as unknown as { reportLocation?: () => void }
              ).reportLocation?.();
            }, 600);
          };
          container.addEventListener("scroll", onScroll, { passive: true });
          cleanupResize = () => {
            container.removeEventListener("scroll", onScroll);
            window.clearTimeout(scrollTimer);
          };
        }
      }

      // 0.3.x quirk: percentage sizing columnizes the content but can leave
      // the iframe itself at 0×0, which also breaks paging. An explicit
      // pixel resize AFTER display fixes both — and it must not run before
      // display, when the manager doesn't exist yet. The observer keeps it
      // honest across measure/container changes (rotation at 375px too).
      rendition.resize(host.clientWidth, host.clientHeight);
      const observer = new ResizeObserver(() => {
        if (!cancelled && host.clientWidth > 0) {
          try {
            rendition.resize(host.clientWidth, host.clientHeight);
          } catch {
            // A resize during teardown is not worth crashing over.
          }
        }
      });
      observer.observe(host);
      // Chained: the scroll listener above may already own part of cleanup.
      const priorCleanup = cleanupResize;
      cleanupResize = () => {
        observer.disconnect();
        priorCleanup?.();
      };

      setReady(true);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer.current);
      cleanupResize?.();
      renditionRef.current = null;
      book?.destroy();
    };
    // initialPosition/prefs are mount-time snapshots: a save round-trip must
    // not re-open the book, and pref changes re-theme the live rendition.
  }, [bookId]);

  // ── Apply a preference change to the live rendition ──────────────────────
  function applyPrefs(next: EpubPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem(prefsKey(user?.id), JSON.stringify(next));
    } catch {
      // Preferences are a convenience; a full quota is not an error.
    }
    const rendition = renditionRef.current;
    if (!rendition) return;
    // CFIs survive reflow; pagination doesn't. Re-land on the same words.
    const cfi = lastCfiRef.current;
    rendition.themes.default(themeRules(next));
    if (cfi) {
      void rendition.display(cfi).catch(() => undefined);
    }
  }

  function turn(direction: "prev" | "next") {
    const r = renditionRef.current;
    if (!r) return;
    void (direction === "next" ? r.next() : r.prev());
  }

  // Arrows + space page; Home/End jump to the book's ends.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") turn("next");
      else if (e.key === "ArrowLeft" || e.key === "PageUp") turn("prev");
      else if (e.key === " ") {
        e.preventDefault();
        turn(e.shiftKey ? "prev" : "next");
      } else if (e.key === "Home" || e.key === "End") {
        const r = renditionRef.current;
        const book = r?.book;
        if (!r || !book) return;
        const spine = (book.spine as unknown as { items: { href: string }[] })
          .items;
        const target =
          e.key === "Home" ? spine[0]?.href : spine[spine.length - 1]?.href;
        if (target) void r.display(target).catch(() => undefined);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (failed) {
    return (
      <div className="space-y-2 py-16 text-center">
        <p className="font-display text-xl text-foreground">
          This file wouldn&rsquo;t open.
        </p>
        <p className="text-sm text-muted-foreground">
          The book and your journal are untouched — the EPUB just couldn&rsquo;t
          be read. Try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Secondary controls: paging, and the type settings. */}
      <div className="relative flex items-center justify-between border-b border-border/60 px-4 py-1.5 sm:px-8 lg:px-12">
        {/* A scrolled document has nothing to page — the controls hide
            rather than sit there inert. */}
        {scrolledDoc ? (
          <span className="text-xs text-muted-foreground">
            Scrolls as one page
          </span>
        ) : (
          <div className="flex items-center gap-0.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => turn("prev")}
              disabled={!ready}
              aria-label="Previous page"
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => turn("next")}
              disabled={!ready}
              aria-label="Next page"
            >
              →
            </Button>
          </div>
        )}
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          className={cn(
            "min-h-[36px] rounded-[var(--radius)] px-3 font-display text-sm transition-colors",
            settingsOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Aa
        </button>

        {settingsOpen && (
          // 0M Arriving — a small surface that owns its corner.
          <div className="animate-arrive absolute right-4 top-full z-10 mt-2 w-72 space-y-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-xl sm:right-8 lg:right-12">
            <div className="space-y-1.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Size
              </p>
              <div className="flex gap-1">
                {FONT_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => applyPrefs({ ...prefs, fontSize: s })}
                    className={cn(
                      "min-h-[36px] flex-1 rounded-[var(--radius)] border text-center font-display",
                      prefs.fontSize === s
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                    style={{ fontSize: `${Math.min(s, 20)}px` }}
                  >
                    Aa
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Line height
              </p>
              <div className="flex gap-1">
                {LINE_HEIGHTS.map((l) => (
                  <button
                    key={l}
                    onClick={() => applyPrefs({ ...prefs, lineHeight: l })}
                    className={cn(
                      "min-h-[36px] flex-1 rounded-[var(--radius)] border text-xs",
                      prefs.lineHeight === l
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Margins
              </p>
              <div className="flex gap-1">
                {(
                  [
                    ["narrow", "Narrow"],
                    ["default", "Default"],
                    ["wide", "Wide"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => applyPrefs({ ...prefs, measure: value })}
                    className={cn(
                      "min-h-[36px] flex-1 rounded-[var(--radius)] border text-xs",
                      prefs.measure === value
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Typeface
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => applyPrefs({ ...prefs, family: "serif" })}
                  className={cn(
                    "min-h-[36px] flex-1 rounded-[var(--radius)] border font-display text-sm",
                    prefs.family === "serif"
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  Newsreader
                </button>
                <button
                  onClick={() => applyPrefs({ ...prefs, family: "sans" })}
                  className={cn(
                    "min-h-[36px] flex-1 rounded-[var(--radius)] border font-sans text-sm",
                    prefs.family === "sans"
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  Instrument
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="min-h-0 flex-1 bg-background"
        onClick={() => settingsOpen && setSettingsOpen(false)}
      >
        <div
          className="relative mx-auto h-full"
          style={{ maxWidth: MEASURES[prefs.measure] }}
        >
          {!ready && (
            <div className="absolute inset-0 space-y-3 p-6">
              <Shimmer className="h-4 w-2/3" />
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-11/12" />
              <Shimmer className="h-3 w-1/2" />
            </div>
          )}
          <div ref={hostRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
