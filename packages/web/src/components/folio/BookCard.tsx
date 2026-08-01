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
        <StatusBadge status={book.status} />
      </div>
    </Link>
  );
}
