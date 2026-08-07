import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDeleteBookFile, useUploadBookFile } from "../../hooks/useBooks";
import type { Book, BookFileKind } from "../../lib/types";
import { Button, buttonVariants } from "../ui/button";

const KIND_LABEL: Record<BookFileKind, string> = {
  PDF: "PDF",
  EPUB: "EPUB",
  AUDIO: "Audio",
};

function mb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The book's attached files: the primary Read / Listen action when a file
 * exists, and the upload control — always available, never gated on the
 * format label. A physical book with a PDF scan is the intended case.
 */
export function BookFileSection({ book }: { book: Book }) {
  const files = book.files ?? [];
  const upload = useUploadBookFile(book.id);
  const removeFile = useDeleteBookFile(book.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const readable = files.find((f) => f.kind === "PDF" || f.kind === "EPUB");
  const audio = files.find((f) => f.kind === "AUDIO");

  async function onPick(file: File) {
    setError(null);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      const resp = (err as { response?: { data?: { error?: string } } })
        .response;
      setError(resp?.data?.error ?? "The upload didn't go through.");
    }
  }

  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
      <h2 className="font-display text-lg text-foreground">Read in Folio</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {files.length > 0
          ? "Attached files stay private, like everything else here — sharing a book never shares its file."
          : "Attach a PDF, EPUB, or audio file and this book opens right here. A physical book can carry its scan."}
      </p>

      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {readable && (
            <Link to={`/books/${book.id}/read`} className={buttonVariants()}>
              Read
            </Link>
          )}
          {audio && (
            <Link
              to={`/books/${book.id}/read?kind=audio`}
              className={buttonVariants({
                variant: readable ? "outline" : "default",
              })}
            >
              Listen
            </Link>
          )}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.kind}
              className="flex items-center gap-3 text-xs text-muted-foreground"
            >
              <span className="rounded-full border border-border px-2 py-0.5 font-medium">
                {KIND_LABEL[f.kind]}
              </span>
              <span className="min-w-0 truncate">{f.originalName}</span>
              <span className="shrink-0 font-mono">{mb(f.sizeBytes)}</span>
              <button
                onClick={() => {
                  setError(null);
                  removeFile.mutate(f.kind);
                }}
                disabled={removeFile.isPending}
                className="shrink-0 text-muted-foreground/70 underline hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending
            ? "Uploading…"
            : files.length > 0
              ? "Attach another file"
              : "Attach a file"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub,audio/*,application/pdf,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.target.value = "";
        }}
      />
    </section>
  );
}
