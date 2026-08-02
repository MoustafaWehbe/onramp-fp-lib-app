import { useState } from "react";
import { Link } from "react-router-dom";
import {
  usePendingInvites,
  useRespondToInvite,
  useSharedWithMe,
} from "../../hooks/useContributors";
import {
  useReceivedBookShares,
  useRevokeBookShare,
  useSentBookShares,
} from "../../hooks/useBookShares";
import { useCreateBook } from "../../hooks/useBooks";
import type { ReceivedBookShare } from "../../lib/types";
import { BookCover } from "../../components/folio/BookCover";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";

function sentAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/** Design E18 recipient view — one shared book, metadata only, and it says so. */
function ReceivedBookCard({ share }: { share: ReceivedBookShare }) {
  const createBook = useCreateBook();
  const [added, setAdded] = useState<string | null>(null);

  async function addToLibrary() {
    try {
      await createBook.mutateAsync({
        title: share.book.title,
        author: share.book.author,
        genre: share.book.genre ?? undefined,
        coverImage: share.book.coverImage ?? undefined,
        year: share.book.year ?? undefined,
        pageCount: share.book.pageCount ?? undefined,
        status: "WANT_TO_READ",
      });
      setAdded("In your library now — your copy, your journal.");
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setAdded(
        status === 409
          ? "Already in your library."
          : "Couldn't add it just now.",
      );
    }
  }

  const meta = [
    share.book.author,
    share.book.genre,
    share.book.year,
    share.book.pageCount ? `${share.book.pageCount} pages` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex gap-5 rounded-[var(--radius)] border border-border bg-card p-5">
      <div className="w-20 shrink-0">
        <BookCover
          title={share.book.title}
          author={share.book.author}
          coverImage={share.book.coverImage}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {share.sender.name} sent you this, {sentAgo(share.sharedAt)}
          </p>
          <p className="font-display text-xl text-foreground">
            {share.book.title}
          </p>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-background/60 px-4 py-3">
          <p className="font-display text-sm text-foreground/85">
            No note, no review, nothing of theirs.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Folio doesn&rsquo;t pass along what {share.sender.name} thought of
            it. If you want to know, ask them — that&rsquo;s the whole design.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={addToLibrary} disabled={createBook.isPending}>
            Add to my library
          </Button>
          {added && (
            <span className="text-xs text-muted-foreground">{added}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shelves and single books other people have shared with you, plus invites. */
export function SharedShelves() {
  const { data: shelves, isLoading } = useSharedWithMe();
  const { data: invites } = usePendingInvites();
  const { data: receivedBooks } = useReceivedBookShares();
  const { data: sentBooks } = useSentBookShares();
  const revoke = useRevokeBookShare();
  const respond = useRespondToInvite();
  const [revokeError, setRevokeError] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          Shared with you
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Single shelves other readers have opened to you — and nothing else of
          theirs.
        </p>
      </header>

      {invites && invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Waiting on you
          </h2>
          {invites.map((invite) => (
            <div
              key={invite.shelfId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-primary/30 bg-accent/40 p-4"
            >
              <div>
                <p className="font-display text-lg text-foreground">
                  {invite.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {invite.owner.name} invited you ·{" "}
                  {invite.accessLevel === "WRITE"
                    ? "you could add books"
                    : "you could view it"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    respond.mutate({ shelfId: invite.shelfId, accept: true })
                  }
                  disabled={respond.isPending}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    respond.mutate({ shelfId: invite.shelfId, accept: false })
                  }
                  disabled={respond.isPending}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Design E18 — single books shared with you: metadata only. */}
      {receivedBooks && receivedBooks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Books shared with you
          </h2>
          <p className="flex items-center gap-2 rounded-[var(--radius)] bg-secondary/70 px-4 py-2.5 text-xs text-muted-foreground">
            <span aria-hidden>🔒</span> Each of these is one book someone chose
            to send. Their rating, reflection, reading dates, and the rest of
            their library are not part of it.
          </p>
          <div className="space-y-3">
            {receivedBooks.map((share) => (
              <ReceivedBookCard key={share.shareId} share={share} />
            ))}
          </div>
        </section>
      )}

      {/* Design E18 — what you've sent, with Take it back. */}
      <section className="space-y-3">
        <h2 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Books you&rsquo;ve sent
        </h2>
        {sentBooks && sentBooks.length > 0 ? (
          <div className="space-y-2">
            {sentBooks.map((s) => (
              <div
                key={s.shareId}
                className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    <Link
                      to={`/books/${s.book.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {s.book.title}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">
                      → {s.recipient.name}, {sentAgo(s.sharedAt)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRevokeError(null);
                    revoke.mutate(s.shareId, {
                      onError: () =>
                        setRevokeError(
                          `Couldn't take back "${s.book.title}" — it's still shared. Try again.`,
                        ),
                    });
                  }}
                  // Pending is per row: only the share being revoked waits.
                  disabled={revoke.isPending && revoke.variables === s.shareId}
                  className="shrink-0 text-xs font-medium text-primary hover:text-accent-foreground disabled:opacity-60"
                >
                  {revoke.isPending && revoke.variables === s.shareId
                    ? "Taking back…"
                    : "Take it back"}
                </button>
              </div>
            ))}
            {revokeError && (
              <p className="text-xs text-destructive">{revokeError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-6">
            <p className="font-display text-lg text-foreground">
              You haven&rsquo;t sent anyone a book.
            </p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              When you do, it appears here with who has it and a Take it back
              button. Nothing goes out until you name a person.
            </p>
            <div className="flex items-center gap-3.5 rounded-[var(--radius)] border border-dashed border-border bg-background/60 p-4">
              <div
                className="h-12 w-8 rounded-sm border border-dashed border-border"
                aria-hidden
              />
              <span className="text-xs text-muted-foreground">
                Open any book and choose Share book.
              </span>
            </div>
          </div>
        )}
      </section>

      {isLoading ? (
        <Shimmer className="h-24 w-full" />
      ) : shelves && shelves.length > 0 ? (
        <div className="space-y-3">
          {shelves.map((shelf) => (
            <Link
              key={shelf.shelfId}
              to={`/shared/${shelf.shelfId}`}
              className="block rounded-[var(--radius)] border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display text-lg text-foreground">
                    {shelf.name}
                  </h2>
                  {shelf.description && (
                    <p className="text-sm text-muted-foreground">
                      {shelf.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Shared with you by {shelf.owner.name} · {shelf.books.length}{" "}
                    {shelf.books.length === 1 ? "book" : "books"}
                  </p>
                </div>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[0.7rem] text-accent-foreground">
                  {shelf.accessLevel === "WRITE" ? "Can add books" : "Can view"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        !invites?.length &&
        !receivedBooks?.length && (
          <EmptyState
            title="Nothing shared with you yet."
            line="When someone opens a shelf to you, it will appear here — and only that shelf."
            action={
              <Link to="/library" className={buttonVariants({ variant: "outline" })}>
                Back to your library
              </Link>
            }
          />
        )
      )}
    </div>
  );
}
