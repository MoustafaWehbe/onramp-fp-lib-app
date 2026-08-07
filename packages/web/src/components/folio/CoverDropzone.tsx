import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { BookCover } from "./BookCover";
import { cn } from "../../lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface CoverDropzoneProps {
  title: string;
  author: string;
  coverImage: string | null;
  onChange: (url: string | null) => void;
}

type UploadState =
  | { kind: "idle" }
  | { kind: "dragging" }
  | { kind: "uploading"; pct: number; name: string; size: string }
  | { kind: "error"; message: string };

/**
 * Design B6a — the cover upload: idle, dragging, uploading, attached, error.
 * The whole panel is a drop target; errors leave the rest of the form
 * editable, and skipping it is fine — a typographic cover is generated.
 */
export function CoverDropzone({
  title,
  author,
  coverImage,
  onChange,
}: CoverDropzoneProps) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Design B6a — "The whole panel is a drop target, not just the frame."
  // The listeners live on the document and accept only real file drags, so
  // dropping anywhere on the page (form fields included) attaches the cover.
  // Depth-counted: drag events fire enter/leave for every child crossed.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setState((s) => (s.kind === "idle" ? { kind: "dragging" } : s));
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0)
        setState((s) => (s.kind === "dragging" ? { kind: "idle" } : s));
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setState((s) => (s.kind === "dragging" ? { kind: "idle" } : s));
      const file = e.dataTransfer?.files[0];
      if (file) void upload(file);
    };
    // A cancelled drag (Escape, or dropping outside the window) can end
    // without a balancing dragleave — dragend is the catch-all reset.
    const end = () => {
      depth = 0;
      setState((s) => (s.kind === "dragging" ? { kind: "idle" } : s));
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    document.addEventListener("dragend", end);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
      document.removeEventListener("dragend", end);
    };
  }, []);

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      setState({
        kind: "error",
        message: "Covers need to be a JPG, PNG or WEBP image.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      setState({
        kind: "error",
        message: `That file is ${mb} MB. Covers need to be under 5 MB.`,
      });
      return;
    }
    const size =
      file.size > 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
    setState({ kind: "uploading", pct: 0, name: file.name, size });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data } = await apiClient.post<{ data: { url: string } }>(
        "/books/cover",
        file,
        {
          headers: { "Content-Type": "application/octet-stream" },
          signal: controller.signal,
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setState((s) => (s.kind === "uploading" ? { ...s, pct } : s));
          },
        },
      );
      onChange(data.data.url);
      setState({ kind: "idle" });
    } catch (err) {
      // A cancelled upload isn't an error — back to idle, nothing attached
      // (design B6a states: uploading carries its own Cancel).
      if (controller.signal.aborted) {
        setState({ kind: "idle" });
        return;
      }
      const resp = (err as { response?: { data?: { error?: string } } })
        .response;
      setState({
        kind: "error",
        message: resp?.data?.error ?? "The upload didn't go through.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // ── Attached ──────────────────────────────────────────────────────────
  if (coverImage && state.kind !== "uploading") {
    return (
      <div className="max-w-[11rem] space-y-2.5 sm:max-w-none">
        <BookCover title={title} author={author} coverImage={coverImage} />
        <div className="flex gap-3.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-primary hover:text-accent-foreground"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // ── Uploading ─────────────────────────────────────────────────────────
  if (state.kind === "uploading") {
    return (
      <div className="max-w-[11rem] space-y-2.5 sm:max-w-none">
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3.5 rounded-sm border border-border bg-secondary/70">
          <div className="h-[3px] w-2/3 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${state.pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{state.pct}%</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[0.7rem] text-muted-foreground">
            {state.name} · {state.size}
          </p>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 text-[0.7rem] font-medium text-muted-foreground underline hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (state.kind === "error") {
    return (
      <div className="space-y-2.5 sm:max-w-none">
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2.5 rounded-sm border-[1.5px] border-destructive/50 bg-destructive/5 px-4 text-center">
          <span className="font-display text-xl text-destructive">!</span>
          <p className="text-xs leading-relaxed text-destructive">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-primary underline"
          >
            Choose another
          </button>
        </div>
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          The rest of the form stays editable.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // ── Idle / dragging ───────────────────────────────────────────────────
  // Below `sm` there is no drag: the file picker is the whole affordance,
  // as a compact row (design B6a mobile — "search first, cover last").
  const dragging = state.kind === "dragging";
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center gap-3.5 rounded-[var(--radius)] border-[1.5px] border-dashed border-border bg-card p-4 text-left sm:hidden"
      >
        <span
          className="flex h-16 w-11 shrink-0 items-center justify-center rounded-sm border border-dashed border-border font-display text-xl font-light text-muted-foreground/60"
          aria-hidden
        >
          +
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-[0.8rem] font-semibold text-foreground/80">
            Add a cover photo
          </span>
          <span className="block text-[0.7rem] leading-relaxed text-muted-foreground">
            Take a photo of the spine, or pick from your library. Optional.
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "hidden aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-sm border-[1.5px] border-dashed transition-colors sm:flex",
          dragging
            ? "border-primary bg-accent"
            : "border-border bg-card hover:border-primary/60",
        )}
      >
        <span
          className={cn(
            "font-display text-3xl font-light",
            dragging ? "text-primary" : "text-muted-foreground/60",
          )}
          aria-hidden
        >
          {dragging ? "↓" : "+"}
        </span>
        <span
          className={cn(
            "px-3 text-center text-[0.7rem] leading-relaxed",
            dragging
              ? "font-semibold text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          {dragging ? (
            "Release to use as cover"
          ) : (
            <>
              Drop a cover image
              <br />
              or <span className="text-primary underline">browse</span>
            </>
          )}
        </span>
      </button>
      <p className="hidden text-[0.7rem] leading-snug text-muted-foreground sm:block">
        JPG, PNG or WEBP · up to 5 MB. Optional — a typographic cover is
        generated otherwise.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
