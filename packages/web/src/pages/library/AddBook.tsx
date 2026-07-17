import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateBook } from "../../hooks/useBooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { BookCover } from "../../components/folio/BookCover";
import { READING_STATUSES, STATUS_LABEL, type ReadingStatus } from "../../lib/types";
import { cn } from "../../lib/utils";

/** Design B6 — manual entry. Cover is optional; a typographic one is generated. */
export function AddBook() {
  const navigate = useNavigate();
  const createBook = useCreateBook();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [status, setStatus] = useState<ReadingStatus>("WANT_TO_READ");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim() !== "" && author.trim() !== "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const book = await createBook.mutateAsync({
        title: title.trim(),
        author: author.trim(),
        genre: genre.trim() || undefined,
        coverImage: coverImage.trim() || undefined,
        year: year ? Number(year) : undefined,
        pageCount: pageCount ? Number(pageCount) : undefined,
        status,
      });
      navigate(`/books/${book.id}`);
    } catch (err) {
      // The API returns 409 when (title, author) already exists for this user.
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setError(
        status === 409
          ? "That book is already in your library."
          : "Something went wrong saving this book.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="font-display text-[2rem] text-foreground">Add a book</h1>

      <form onSubmit={onSubmit} className="grid gap-8 sm:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <BookCover
            title={title || "Untitled"}
            author={author || "Unknown"}
            coverImage={coverImage || null}
          />
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            Optional — a typographic cover is generated otherwise.
          </p>
          <Input
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="Cover image URL"
            className="bg-card text-xs"
          />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The Peregrine Notebooks"
              className="bg-card"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="R. F. Caldwell"
              className="bg-card"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Nature"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pages">Pages</Label>
              <Input
                id="pages"
                type="number"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="312"
                className="bg-card"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lifecycle</Label>
            <div className="flex flex-wrap gap-2">
              {READING_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={!canSubmit || createBook.isPending}>
              {createBook.isPending ? "Adding…" : "Add to library"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/library")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
