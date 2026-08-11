import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { useAuth } from "../../hooks/useAuth";
import { Shimmer } from "./Shimmer";
import { cn } from "../../lib/utils";
import type { ReaderStatus } from "../../pages/library/Reader";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Progress writes wait for the page to settle — never one write per tap. */
const SAVE_DEBOUNCE_MS = 1_200;

/**
 * A page never renders wider than a comfortable measure — fit-width on a
 * wide monitor is a wall, not a book. Spread pages are narrower so a pair
 * still reads at arm's length.
 */
const MAX_SINGLE_WIDTH = 760;
const MAX_SPREAD_WIDTH = 560;
const SPREAD_GAP = 24;

type ViewMode = "single" | "spread" | "scroll";
type ZoomMode = "fit-width" | "fit-page" | number;
const ZOOM_STEPS = [0.6, 0.8, 1, 1.2, 1.5, 2] as const;

/** Reading preferences are per user, not per book. */
function prefsKey(userId: string | undefined) {
  return `folio:reader:pdf:${userId ?? "anon"}`;
}
function loadPrefs(userId: string | undefined): {
  mode: ViewMode;
  zoom: ZoomMode;
} {
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey(userId)) ?? "{}");
    const mode = ["single", "spread", "scroll"].includes(raw.mode)
      ? (raw.mode as ViewMode)
      : "single";
    const zoom =
      raw.zoom === "fit-page" || raw.zoom === "fit-width"
        ? (raw.zoom as ZoomMode)
        : typeof raw.zoom === "number" && raw.zoom >= 0.5 && raw.zoom <= 2
          ? raw.zoom
          : "fit-width";
    return { mode, zoom };
  } catch {
    return { mode: "single", zoom: "fit-width" };
  }
}

/** The left page of the spread containing `page` (page 1 sits alone). */
function spreadLeft(page: number): number {
  if (page <= 1) return 1;
  return page % 2 === 0 ? page : page - 1;
}

interface PdfReaderProps {
  bookId: string;
  /** Resume position: a page number stored as a string, or null. */
  initialPosition: string | null;
  /** Reports position + percent up to the chrome bar. */
  onStatus?: (s: ReaderStatus) => void;
}

/**
 * The PDF reading surface. Three views of the same document — single page,
 * two-page spread, continuous scroll — with the rendered page capped at a
 * book-like measure and centred on the background token. pdf.js fetches
 * pages lazily over the API's Range endpoint; every paint goes to an
 * offscreen canvas and blits on completion, so a superseded render never
 * blanks the visible page.
 */
export function PdfReader({
  bookId,
  initialPosition,
  onStatus,
}: PdfReaderProps) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(() => {
    const n = Number(initialPosition);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const [prefs, setPrefs] = useState(() => loadPrefs(user?.id));
  const { mode, zoom } = prefs;

  const saveProgress = useSaveProgress(bookId);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveRef = useRef(saveProgress);
  saveRef.current = saveProgress;
  // The debounced write that hasn't fired yet — flushed on unmount so
  // closing the reader inside the debounce window doesn't lose the page.
  const pendingSaveRef = useRef<{ position: string; percent: number } | null>(
    null,
  );

  function setPref<K extends "mode" | "zoom">(
    key: K,
    value: { mode: ViewMode; zoom: ZoomMode }[K],
  ) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(prefsKey(user?.id), JSON.stringify(next));
      } catch {
        // Preferences are a convenience; a full quota is not an error.
      }
      return next;
    });
  }

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

  // ── Position → chrome bar + persisted progress ───────────────────────────
  useEffect(() => {
    if (!doc) return;
    onStatus?.({
      label: `${page} of ${doc.numPages}`,
      percent: (page / doc.numPages) * 100,
    });
    window.clearTimeout(saveTimer.current);
    const payload = {
      position: String(page),
      percent: Math.round((page / doc.numPages) * 1000) / 10,
    };
    pendingSaveRef.current = payload;
    saveTimer.current = window.setTimeout(() => {
      pendingSaveRef.current = null;
      saveProgress.mutate(payload);
    }, SAVE_DEBOUNCE_MS);
    // saveProgress (a fresh mutation object per render) must not retrigger.
  }, [doc, page, onStatus]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      if (pendingSaveRef.current)
        saveRef.current.mutate(pendingSaveRef.current);
    },
    [],
  );

  const goTo = useCallback(
    (next: number) => {
      if (!doc) return;
      setPage(Math.max(1, Math.min(doc.numPages, next)));
    },
    [doc],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!doc) return;
      if (mode === "spread") {
        const left = spreadLeft(page);
        goTo(direction === 1 ? (left === 1 ? 2 : left + 2) : left - 2);
      } else {
        goTo(page + direction);
      }
    },
    [doc, mode, page, goTo],
  );

  // ── Keyboard: arrows + space page, Home/End jump. ────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") step(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
      else if (e.key === " ") {
        e.preventDefault(); // space scrolls the page otherwise
        step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Home") goTo(1);
      else if (e.key === "End") goTo(doc?.numPages ?? 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goTo, doc]);

  function zoomStep(direction: 1 | -1) {
    const current = typeof zoom === "number" ? zoom : 1;
    const index = ZOOM_STEPS.findIndex((z) => z >= current);
    const at = index === -1 ? ZOOM_STEPS.length - 1 : index;
    const next =
      ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, at + direction))];
    setPref("zoom", next);
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
    <div className="flex h-full min-h-0 flex-col">
      {/* Secondary controls: view mode, then zoom. Quiet, one row. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border/60 px-4 py-1.5 sm:px-8 lg:px-12">
        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label="View mode"
        >
          {(
            [
              ["single", "Single"],
              ["spread", "Spread"],
              ["scroll", "Scroll"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPref("mode", value)}
              className={cn(
                "min-h-[32px] rounded-[var(--radius)] px-2.5 py-1 text-xs font-medium transition-colors",
                mode === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 text-xs">
          <button
            onClick={() => zoomStep(-1)}
            aria-label="Zoom out"
            className="min-h-[32px] rounded-[var(--radius)] px-2 text-muted-foreground hover:text-foreground"
          >
            −
          </button>
          <button
            onClick={() => zoomStep(1)}
            aria-label="Zoom in"
            className="min-h-[32px] rounded-[var(--radius)] px-2 text-muted-foreground hover:text-foreground"
          >
            +
          </button>
          {(["fit-width", "fit-page"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setPref("zoom", z)}
              className={cn(
                "min-h-[32px] rounded-[var(--radius)] px-2.5 py-1 font-medium transition-colors",
                zoom === z
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {z === "fit-width" ? "Fit width" : "Fit page"}
            </button>
          ))}
          {typeof zoom === "number" && (
            <span className="px-1.5 font-mono text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
          )}
        </div>
      </div>

      {!doc ? (
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-8">
          <Shimmer className="h-4 w-2/3" />
          <Shimmer className="h-[60vh] w-full" />
        </div>
      ) : mode === "scroll" ? (
        <ScrollView doc={doc} zoom={zoom} page={page} onPageChange={setPage} />
      ) : (
        <PagedView
          doc={doc}
          mode={mode}
          zoom={zoom}
          page={page}
          onStep={step}
          onRenderError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

// ─── Shared rendering ───────────────────────────────────────────────────────

/**
 * Render one page into `canvas` at `cssWidth`, offscreen-first. Returns the
 * page's aspect ratio (h/w). Cancels through `taskRef`; concurrent renders
 * on different canvases are fine — pdf.js only forbids two on one canvas.
 */
async function paintPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  cssWidth: number,
  canvas: HTMLCanvasElement,
  taskRef: { current: RenderTask | null },
  isCancelled: () => boolean,
): Promise<number> {
  const pdfPage = await doc.getPage(pageNum);
  if (isCancelled()) return 1.294;
  const base = pdfPage.getViewport({ scale: 1 });
  const aspect = base.height / base.width;
  const dpr = window.devicePixelRatio || 1;
  const viewport = pdfPage.getViewport({
    scale: (cssWidth / base.width) * dpr,
  });

  const offscreen = document.createElement("canvas");
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return aspect;

  const task = pdfPage.render({
    canvas: offscreen,
    canvasContext: offCtx,
    viewport,
  });
  taskRef.current = task;
  try {
    await task.promise;
  } catch (err) {
    if ((err as Error)?.name === "RenderingCancelledException") return aspect;
    throw err;
  } finally {
    if (taskRef.current === task) taskRef.current = null;
  }
  if (isCancelled()) return aspect;

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / dpr}px`;
  canvas.style.height = `${viewport.height / dpr}px`;
  canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
  return aspect;
}

/** Observe an element's content-box size (measured immediately, then live). */
function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize((prev) =>
        prev.w === Math.floor(r.width) && prev.h === Math.floor(r.height)
          ? prev
          : { w: Math.floor(r.width), h: Math.floor(r.height) },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** CSS width for a page under the measure cap, the zoom, and (for fit-page)
 *  the viewport height. */
function pageWidthFor(
  zoom: ZoomMode,
  containerW: number,
  containerH: number,
  aspect: number,
  perPageCap: number,
  columns: 1 | 2,
): number {
  const gutter = 32 + (columns === 2 ? SPREAD_GAP : 0);
  const available = Math.max(120, (containerW - gutter) / columns);
  let w = Math.min(available, perPageCap);
  if (zoom === "fit-page") {
    w = Math.min(w, Math.max(120, (containerH - 32) / aspect));
  } else if (typeof zoom === "number") {
    // Explicit zoom deliberately ignores the container width: zooming past
    // the viewport is the point, and the surrounding overflow-auto scrolls.
    // Clamping here made 200% a no-op on any screen narrower than the cap.
    w = Math.max(120, perPageCap * zoom);
  }
  return Math.floor(w);
}

// ─── Single page & spread ───────────────────────────────────────────────────

function PagedView({
  doc,
  mode,
  zoom,
  page,
  onStep,
  onRenderError,
}: {
  doc: PDFDocumentProxy;
  mode: "single" | "spread";
  zoom: ZoomMode;
  page: number;
  onStep: (d: 1 | -1) => void;
  onRenderError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { w: cw, h: ch } = useElementSize(containerRef);
  const leftCanvas = useRef<HTMLCanvasElement>(null);
  const rightCanvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(1.294);

  const left = mode === "spread" ? spreadLeft(page) : page;
  const right =
    mode === "spread" && left > 1 && left + 1 <= doc.numPages ? left + 1 : null;

  useEffect(() => {
    if (cw <= 0) return;
    let cancelled = false;
    const taskL = { current: null as RenderTask | null };
    const taskR = { current: null as RenderTask | null };
    const columns: 1 | 2 = right ? 2 : 1;
    const cap = mode === "spread" ? MAX_SPREAD_WIDTH : MAX_SINGLE_WIDTH;
    const width = pageWidthFor(zoom, cw, ch, aspect, cap, columns);

    (async () => {
      if (leftCanvas.current) {
        const a = await paintPage(
          doc,
          left,
          width,
          leftCanvas.current,
          taskL,
          () => cancelled,
        );
        if (!cancelled) setAspect(a);
      }
      if (right && rightCanvas.current) {
        await paintPage(
          doc,
          right,
          width,
          rightCanvas.current,
          taskR,
          () => cancelled,
        );
      }
    })().catch((err: Error) => {
      // A silent failure here is a blank page forever — say so instead.
      // (Scroll mode keeps per-slot retry semantics: a failed slot clears
      // its rendered mark and repaints on the next intersection.)
      if (!cancelled) {
        console.error("[pdf] render failed:", err?.message);
        onRenderError();
      }
    });

    return () => {
      cancelled = true;
      taskL.current?.cancel();
      taskR.current?.cancel();
    };
  }, [doc, left, right, zoom, mode, cw, ch, aspect]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-auto bg-background"
      onClick={(e) => {
        // Tap left/right half to page — the touch affordance at 375px.
        if ((e.target as HTMLElement).tagName !== "CANVAS") return;
        const rect = e.currentTarget.getBoundingClientRect();
        onStep(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
      }}
    >
      {/* 0M settling, opacity only: keyed on the page so the new page
          resolves in short/140ms. No slide, no flip — G21 stays out of
          scope. animate-acknowledge is the opacity-only settle alias. */}
      <div
        key={`${left}-${right ?? 0}`}
        className="animate-acknowledge flex min-h-full items-center justify-center gap-[24px] p-4"
      >
        <canvas ref={leftCanvas} className="shadow-sm" />
        {right != null && <canvas ref={rightCanvas} className="shadow-sm" />}
      </div>
    </div>
  );
}

// ─── Continuous scroll ──────────────────────────────────────────────────────

function ScrollView({
  doc,
  zoom,
  page,
  onPageChange,
}: {
  doc: PDFDocumentProxy;
  zoom: ZoomMode;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { w: cw, h: ch } = useElementSize(containerRef);
  const [aspect, setAspect] = useState(1.294);
  const slotRefs = useRef(new Map<number, HTMLDivElement>());
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const taskRefs = useRef(new Map<number, { current: RenderTask | null }>());
  const renderedAt = useRef(new Map<number, number>()); // page -> rendered width
  const didResume = useRef(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  const GAP = 16;
  const width =
    cw > 0 ? pageWidthFor(zoom, cw, ch, aspect, MAX_SINGLE_WIDTH, 1) : 0;
  const slotH = Math.floor(width * aspect);

  // Lazy render through an IntersectionObserver; clear far-away canvases so
  // a 400-page book doesn't hold 400 bitmaps.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || width <= 0) return;
    let disposed = false;
    const tasks = taskRefs.current;

    const render = (n: number) => {
      const canvas = canvasRefs.current.get(n);
      if (!canvas || renderedAt.current.get(n) === width) return;
      let taskRef = tasks.get(n);
      if (!taskRef) {
        taskRef = { current: null };
        tasks.set(n, taskRef);
      }
      taskRef.current?.cancel();
      renderedAt.current.set(n, width);
      void paintPage(doc, n, width, canvas, taskRef, () => disposed)
        .then((a) => {
          if (!disposed && n === 1) setAspect(a);
        })
        .catch(() => renderedAt.current.delete(n));
    };
    const clear = (n: number) => {
      const canvas = canvasRefs.current.get(n);
      tasks.get(n)?.current?.cancel();
      renderedAt.current.delete(n);
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) render(n);
          else clear(n);
        }
      },
      { root: container, rootMargin: "150% 0px" },
    );
    for (const el of slotRefs.current.values()) io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      for (const t of tasks.values()) t.current?.cancel();
    };
  }, [doc, width]);

  // Current page follows the scroll position (and feeds the chrome bar).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || slotH <= 0) return;
    const onScroll = () => {
      const mid = container.scrollTop + container.clientHeight / 2;
      const current = Math.min(
        doc.numPages,
        Math.max(1, Math.floor(mid / (slotH + GAP)) + 1),
      );
      if (current !== pageRef.current) onPageChange(current);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [doc, slotH, onPageChange]);

  // Resume once, and follow external jumps (keyboard paging, Home/End).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || slotH <= 0) return;
    const mid = container.scrollTop + container.clientHeight / 2;
    const visible = Math.floor(mid / (slotH + GAP)) + 1;
    if (!didResume.current || Math.abs(visible - page) > 1) {
      container.scrollTop = (page - 1) * (slotH + GAP);
      didResume.current = true;
    }
  }, [page, slotH]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-auto bg-background"
    >
      <div className="mx-auto flex flex-col items-center gap-[16px] p-4">
        {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-page={n}
            ref={(el) => {
              if (el) slotRefs.current.set(n, el);
              else slotRefs.current.delete(n);
            }}
            style={{ width, height: slotH }}
            className="bg-card shadow-sm"
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(n, el);
                else canvasRefs.current.delete(n);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
