import { Link } from "react-router-dom";
import {
  usePendingInvites,
  useRespondToInvite,
  useSharedWithMe,
} from "../../hooks/useContributors";
import { EmptyState } from "../../components/folio/EmptyState";
import { Shimmer } from "../../components/folio/Shimmer";
import { Button, buttonVariants } from "../../components/ui/button";

/** Shelves other people have shared with you, plus invites awaiting an answer. */
export function SharedShelves() {
  const { data: shelves, isLoading } = useSharedWithMe();
  const { data: invites } = usePendingInvites();
  const respond = useRespondToInvite();

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
        !invites?.length && (
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
