import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useBook, useReadingProgress } from "../../hooks/useBooks";
import type { BookFileKind } from "../../lib/types";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { PdfReader } from "../../components/folio/PdfReader";
import { AudioPlayer } from "../../components/folio/AudioPlayer";
import { EpubReader } from "../../components/folio/EpubReader";
import { Button, buttonVariants } from "../../components/ui/button";

/** With several files attached, the reading kinds outrank listening. */
const KIND_PRIORITY: BookFileKind[] = ["PDF", "EPUB", "AUDIO"];

/** What a viewer tells the chrome bar: where the reader is, and how far in. */
export interface ReaderStatus {
  label: string;
  percent: number | null;
}

/**
 * /books/:id/read — the reading surface, on B8's chrome: a 60px bar with
 * "← Back to <title>" in Newsreader italic on the left, position and Done on
 * the right, a thin accent progress strip along its bottom edge — and
 * nothing else. No nav, no avatar, no breadcrumb; the book owns the rest of
 * the viewport (ReaderLayout supplies the empty shell).
 */
export function Reader() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: book, isLoading, isError, refetch } = useBook(id);
  const progress = useReadingProgress(id);
  const [status, setStatus] = useState<ReaderStatus | null>(null);

  // Escape exits to the book — B8's Done, from the keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && book) navigate(`/books/${book.id}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book, navigate]);

  if (isError && !book) {
    return (
      <div className="flex-1 content-center">
        <EmptyState
          title="This book wouldn’t open."
          line="Nothing is lost — the page just couldn’t reach it. Try again in a moment."
          action={
            <button
              onClick={() => refetch()}
              className={buttonVariants({ variant: "outline" })}
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (isLoading || !book || progress.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-[60px] shrink-0 border-b border-border" />
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-8">
          <Shimmer className="h-6 w-56" />
          <Shimmer className="h-[60vh] w-full" />
        </div>
      </div>
    );
  }

  const files = book.files ?? [];
  const requested = params.get("kind")?.toUpperCase();
  const kind =
    files.find((f) => f.kind === requested)?.kind ??
    KIND_PRIORITY.find((k) => files.some((f) => f.kind === k));

  if (!kind) {
    return (
      <div className="flex-1 content-center">
        <EmptyState
          title="No file attached."
          line="Attach a PDF, EPUB, or audio file from the book's page and it will open here."
          action={
            <Link to={`/books/${book.id}`} className={buttonVariants()}>
              Back to the book
            </Link>
          }
        />
      </div>
    );
  }

  const initialPosition = progress.data?.position ?? null;
  const percent = status?.percent ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── B8's bar: 60px, quiet, and the only chrome on the surface. ── */}
      <header className="relative h-[60px] shrink-0 border-b border-border">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          <Link
            to={`/books/${book.id}`}
            className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <span aria-hidden className="text-base">
              ←
            </span>
            <span className="shrink-0">Back to</span>
            <span className="truncate font-display text-[0.95rem] italic text-foreground">
              {book.title}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {status?.label ?? "…"}
              {percent != null && ` · ${Math.round(percent)}%`}
            </span>
            <Button size="sm" onClick={() => navigate(`/books/${book.id}`)}>
              Done
            </Button>
          </div>
        </div>
        {/* Thin progress along the bar's bottom edge, in the accent token. */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] bg-primary transition-[width] duration-short ease-settle"
          style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
        />
      </header>

      <div className="min-h-0 flex-1">
        {kind === "PDF" && (
          <PdfReader
            bookId={book.id}
            initialPosition={initialPosition}
            onStatus={setStatus}
          />
        )}
        {kind === "EPUB" && (
          <EpubReader
            bookId={book.id}
            initialPosition={initialPosition}
            onStatus={setStatus}
          />
        )}
        {kind === "AUDIO" && (
          <AudioPlayer
            book={book}
            initialPosition={initialPosition}
            onStatus={setStatus}
          />
        )}
      </div>
    </div>
  );
}
