import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBook, useReadingProgress } from "../../hooks/useBooks";
import type { BookFileKind } from "../../lib/types";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { PdfReader } from "../../components/folio/PdfReader";
import { AudioPlayer } from "../../components/folio/AudioPlayer";
import { EpubReader } from "../../components/folio/EpubReader";
import { buttonVariants } from "../../components/ui/button";

/** With several files attached, the reading kinds outrank listening. */
const KIND_PRIORITY: BookFileKind[] = ["PDF", "EPUB", "AUDIO"];

/**
 * /books/:id/read — the reading surface. No canvas frame exists for this
 * page, so it stays inside the token set: Newsreader for the title, the
 * journal pages' quiet chrome, 0M `arriving` for the surface itself. The
 * book detail remains the landing surface; this is one click further.
 */
export function Reader() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { data: book, isLoading, isError, refetch } = useBook(id);
  const progress = useReadingProgress(id);

  if (isError && !book) {
    return (
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
    );
  }
  if (isLoading || !book || progress.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Shimmer className="h-8 w-64" />
        <Shimmer className="h-[70vh] w-full" />
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
      <EmptyState
        title="No file attached."
        line="Attach a PDF, EPUB, or audio file from the book's page and it will open here."
        action={
          <Link to={`/books/${book.id}`} className={buttonVariants()}>
            Back to the book
          </Link>
        }
      />
    );
  }

  const initialPosition =
    progress.data?.position != null ? progress.data.position : null;

  return (
    // 0M Arriving — the reading surface owns the screen as it enters.
    <div className="animate-arrive mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/books/${book.id}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to the book
          </Link>
          <h1 className="truncate font-display text-2xl text-foreground">
            {book.title}
          </h1>
          <p className="text-sm text-muted-foreground">{book.author}</p>
        </div>
      </header>

      {kind === "PDF" && (
        <PdfReader bookId={book.id} initialPosition={initialPosition} />
      )}
      {kind === "EPUB" && (
        <EpubReader bookId={book.id} initialPosition={initialPosition} />
      )}
      {kind === "AUDIO" && (
        <AudioPlayer bookId={book.id} initialPosition={initialPosition} />
      )}
    </div>
  );
}
