import { Link } from "react-router-dom";
import { BookCover } from "./BookCover";
import { StatusBadge } from "./StatusBadge";
import type { Book } from "../../lib/types";

export function BookCard({ book }: { book: Book }) {
  return (
    <Link to={`/books/${book.id}`} className="group space-y-2 text-left">
      <BookCover
        title={book.title}
        author={book.author}
        coverImage={book.coverImage}
        className="transition-transform duration-200 group-hover:-translate-y-1"
      />
      <div className="space-y-1.5">
        <p className="font-display text-sm leading-snug text-foreground">
          {book.title}
        </p>
        <p className="text-xs text-muted-foreground">{book.author}</p>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={book.status} />
          {(book.files?.length ?? 0) > 0 && (
            // A quiet mark that this book opens in Folio (file attached).
            <span
              className="rounded-full border border-border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted-foreground"
              title={
                book.files!.some((f) => f.kind === "AUDIO") &&
                book.files!.length === 1
                  ? "Audio attached — listens in Folio"
                  : "File attached — reads in Folio"
              }
            >
              {book.files!.some((f) => f.kind !== "AUDIO") ? "Read" : "Listen"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
