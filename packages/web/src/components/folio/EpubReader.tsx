import { useEffect, useRef, useState } from "react";
import ePub, { type Book as EpubBook, type Rendition } from "epubjs";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { Shimmer } from "./Shimmer";
import { Button } from "../ui/button";

/** Progress writes wait for the location to settle. */
const SAVE_DEBOUNCE_MS = 1_200;

import type { ReaderStatus } from "../../pages/library/Reader";

interface EpubReaderProps {
  bookId: string;
  /** Resume position: an EPUB CFI stored as a string, or null. */
  initialPosition: string | null;
  /** Reports position + percent up to the chrome bar. */
  onStatus?: (s: ReaderStatus) => void;
}

/**
 * The EPUB reading surface. epub.js renders chapters into an iframe it owns;
 * we own the chrome around it. The whole file is fetched once as an
 * ArrayBuffer — an EPUB is a ZIP, and epub.js's byte-range mode wants the
 * server to unzip per-resource, which ours deliberately doesn't. Position is
 * the CFI epub.js reports on every relocation.
 */
export function EpubReader({
  bookId,
  initialPosition,
  onStatus,
}: EpubReaderProps) {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [percentLabel, setPercentLabel] = useState<number | null>(null);
  const saveProgress = useSaveProgress(bookId);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveRef = useRef(saveProgress);
  saveRef.current = saveProgress;

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
      const rendition = book.renderTo(host, {
        width: "100%",
        height: "100%",
        // Paginated like a book, not a scroll — the journal-page feel.
        flow: "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;

      // Locations make percent meaningful; generate coarsely (600-char
      // slices) so big books don't stall the open.
      await book.ready;
      if (cancelled) return;
      const locations = book.locations;
      void locations.generate(600).then(() => {
        if (!cancelled) setPercentLabel(0);
      });

      rendition.on(
        "relocated",
        (location: { start: { cfi: string; percentage?: number } }) => {
          const cfi = location.start.cfi;
          const pct = locations.length()
            ? Math.round(locations.percentageFromCfi(cfi) * 1000) / 10
            : 0;
          setPercentLabel(pct);
          onStatusRef.current?.({ label: "Reading", percent: pct });
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            saveRef.current.mutate({ position: cfi, percent: pct });
          }, SAVE_DEBOUNCE_MS);
        },
      );

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
      }

      // 0.3.x quirk: percentage sizing columnizes the content but can leave
      // the iframe itself at 0×0, which also breaks paging. An explicit
      // pixel resize AFTER display fixes both — and it must not run before
      // display, when the manager doesn't exist yet. The observer keeps it
      // honest across container changes (rotation at 375px included).
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
      cleanupResize = () => observer.disconnect();

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
    // initialPosition is a mount-time snapshot (same rule as the other
    // readers: a save round-trip must not yank the page back).
  }, [bookId]);

  function turn(direction: "prev" | "next") {
    const r = renditionRef.current;
    if (!r) return;
    void (direction === "next" ? r.next() : r.prev());
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") turn("next");
      if (e.key === "ArrowLeft" || e.key === "PageUp") turn("prev");
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
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
        <span className="font-mono text-xs text-muted-foreground">
          {percentLabel != null ? `${percentLabel}%` : "…"}
        </span>
      </div>

      <div className="relative h-[72vh] overflow-hidden rounded-[var(--radius)] border border-border bg-card">
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
  );
}
