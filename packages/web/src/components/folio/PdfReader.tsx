import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { Shimmer } from "./Shimmer";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Zoom presets around fit-width — the reading default. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Progress writes wait for the page to settle — never one write per tap. */
const SAVE_DEBOUNCE_MS = 1_200;

import type { ReaderStatus } from "../../pages/library/Reader";

interface PdfReaderProps {
  bookId: string;
  /** Resume position: a page number stored as a string, or null. */
  initialPosition: string | null;
  /** Reports position + percent up to the chrome bar. */
  onStatus?: (s: ReaderStatus) => void;
}

/**
 * The PDF reading surface. pdf.js fetches pages lazily over the API's Range
 * endpoint; rendering is one page at a time onto a canvas sized to fit the
 * container's width (the "zoom to fit" default — factors multiply it).
 */
export function PdfReader({
  bookId,
  initialPosition,
  onStatus,
}: PdfReaderProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(() => {
    const n = Number(initialPosition);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Fit-width needs the live container width; a ResizeObserver feeds it into
  // state so width changes re-run the render effect like any other input.
  const [containerWidth, setContainerWidth] = useState(0);
  const saveProgress = useSaveProgress(bookId);
  const saveTimer = useRef<number | undefined>(undefined);

  // ── Load the document ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({
      url: bookFileUrl(bookId, "PDF"),
      // PDFs without embedded fonts (scans, generated files) fall back to
      // system fonts; without this the standard-14 fonts silently paint
      // nothing, since we don't ship pdf.js's standard font data.
      useSystemFonts: true,
    });
    task.promise.then(
      (loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        // A stale resume position past the end opens on the last page.
        setPage((p) => Math.min(p, loaded.numPages));
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bookId]);

  // Track the container's width (rotation at 375px included).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Measure now — the observer's first callback waits for a frame, and the
    // first render shouldn't.
    setContainerWidth(Math.floor(container.clientWidth));
    const observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      setContainerWidth((prev) => (prev === w ? prev : w));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Render the current page ──────────────────────────────────────────────
  // One self-contained effect per (doc, page, zoom, width): it cancels only
  // its own work on cleanup, so StrictMode's double run and rapid paging
  // can't interleave two renders on one canvas (pdf.js forbids that). The
  // paint goes to an offscreen canvas and is blitted on completion — a
  // superseded render never touches the visible canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || containerWidth <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;

      const base = pdfPage.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 2) / base.width;
      const scale = (zoom === "fit" ? 1 : zoom) * fitScale;
      // Render at device resolution so text stays crisp on high-DPI screens.
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * dpr });

      const offscreen = document.createElement("canvas");
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;

      task = pdfPage.render({
        canvas: offscreen,
        canvasContext: offCtx,
        viewport,
      });
      await task.promise;
      if (cancelled) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
    })().catch((err: Error) => {
      // A cancelled render is the expected cost of paging quickly. Matched
      // by name: instanceof breaks when the class crosses chunk boundaries.
      if (err?.name === "RenderingCancelledException") return;
      if (!cancelled) console.error("[pdf] render failed:", err?.message);
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, containerWidth]);

  // ── Paging + persisted progress ──────────────────────────────────────────
  const goTo = useCallback(
    (next: number) => {
      if (!doc) return;
      const clamped = Math.max(1, Math.min(doc.numPages, next));
      setPage(clamped);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveProgress.mutate({
          position: String(clamped),
          percent: Math.round((clamped / doc.numPages) * 1000) / 10,
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [doc, saveProgress],
  );

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // The chrome bar shows "N of M · pct%".
  useEffect(() => {
    if (!doc) return;
    onStatus?.({
      label: `${page} of ${doc.numPages}`,
      percent: (page / doc.numPages) * 100,
    });
  }, [doc, page, onStatus]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never steal keys from a focused field elsewhere on the page.
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, page]);

  function zoomStep(direction: 1 | -1) {
    const current = zoom === "fit" ? 1 : zoom;
    const index = ZOOM_STEPS.findIndex((z) => z >= current);
    const at = index === -1 ? ZOOM_STEPS.length - 1 : index;
    const next =
      ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, at + direction))];
    setZoom(next === 1 ? "fit" : next);
  }

  if (failed) {
    return (
      <div className="space-y-2 py-16 text-center">
        <p className="font-display text-xl text-foreground">
          This file wouldn&rsquo;t open.
        </p>
        <p className="text-sm text-muted-foreground">
          The book and your journal are untouched — the PDF just couldn&rsquo;t
          be read. Try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar — Instrument for controls, mono for the count. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => goTo(page - 1)}
            disabled={!doc || page <= 1}
            aria-label="Previous page"
          >
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => goTo(page + 1)}
            disabled={!doc || page >= (doc?.numPages ?? 1)}
            aria-label="Next page"
          >
            →
          </Button>
          <span className="px-2 font-mono text-xs text-muted-foreground">
            {doc ? `${page} / ${doc.numPages}` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => zoomStep(-1)}
            aria-label="Zoom out"
          >
            −
          </Button>
          <button
            onClick={() => setZoom("fit")}
            className={cn(
              "rounded-[var(--radius)] px-2 py-1 text-xs font-medium",
              zoom === "fit"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Fit width
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => zoomStep(1)}
            aria-label="Zoom in"
          >
            +
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-auto rounded-[var(--radius)] border border-border bg-card"
      >
        {!doc && (
          <div className="space-y-3 p-6">
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-[60vh] w-full" />
          </div>
        )}
        <canvas ref={canvasRef} className={cn("mx-auto", !doc && "hidden")} />
      </div>
    </div>
  );
}
