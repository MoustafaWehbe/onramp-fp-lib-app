import { useState } from "react";
import {
  useBookShareList,
  useRevokeBookShare,
  useShareBook,
} from "../../hooks/useBookShares";
import type { Book } from "../../lib/types";
import { BookCover } from "./BookCover";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function ThinkDots() {
  return (
    <span className="flex items-end gap-1" aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="animate-think h-[5px] w-[5px] rounded-full bg-primary"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

interface ShareBookDialogProps {
  book: Book;
  onClose: () => void;
}

/**
 * Design E18 — "Share one book: the privacy boundary is the interface."
 * One named person at a time; the will-see / never-see panels and the
 * withheld preview are the feature, not decoration.
 */
export function ShareBookDialog({ book, onClose }: ShareBookDialogProps) {
  const share = useShareBook(book.id);
  const revoke = useRevokeBookShare();
  const { data: existing } = useBookShareList(book.id);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send() {
    if (!email.trim() || share.isPending) return;
    setError(null);
    setSentTo(null);
    try {
      const result = await share.mutateAsync(email.trim());
      setSentTo(result.recipient.name);
      setEmail("");
    } catch (err) {
      const resp = (err as { response?: { data?: { error?: string } } })
        .response;
      setError(
        resp?.data?.error ??
          "They weren't reachable. Nothing was shared — check the address, or try again in a moment.",
      );
    }
  }

  const meta = [
    book.author,
    book.genre,
    book.year,
    book.pageCount ? `${book.pageCount} pages` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${book.title}`}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-border px-7 py-5">
          <div className="space-y-0.5">
            <h2 className="font-display text-xl text-foreground">
              Share one book
            </h2>
            <p className="text-xs text-muted-foreground">
              {book.title} · {book.author}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="space-y-5 px-7 py-5">
          {/* ── Send row ─────────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <label
              htmlFor="share-email"
              className="text-xs font-semibold text-foreground/80"
            >
              Share with
            </label>
            <form
              className="flex gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Input
                id="share-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Their name's email address…"
                autoFocus
                disabled={share.isPending}
              />
              <Button type="submit" disabled={!email.trim() || share.isPending}>
                Share
              </Button>
            </form>
            {share.isPending && (
              <p className="flex items-center gap-2.5 rounded-[var(--radius)] border border-border bg-card px-3.5 py-2.5 text-sm text-foreground/80">
                <ThinkDots /> Sending{" "}
                <span className="font-display italic">{book.title}</span>…
              </p>
            )}
            {sentTo && !share.isPending && (
              <p className="text-sm text-lifecycle-finished">
                Sent. {sentTo} has it now — and nothing else.
              </p>
            )}
            {error && !share.isPending && (
              <div className="space-y-2 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-3.5">
                <p className="text-sm font-semibold text-destructive">
                  Couldn&rsquo;t send.
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              One named person at a time. There is no link, no public page, and
              nothing to post.
            </p>
          </div>

          {/* ── Who has it ───────────────────────────────────────────── */}
          {existing && existing.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Who has it
              </p>
              {existing.map((s) => (
                <div
                  key={s.shareId}
                  className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-3.5 py-2"
                >
                  <span className="text-sm text-foreground">
                    {s.recipient.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      {s.recipient.email}
                    </span>
                  </span>
                  <button
                    onClick={() => revoke.mutate(s.shareId)}
                    disabled={revoke.isPending}
                    className="text-xs font-medium text-primary hover:text-accent-foreground"
                  >
                    Take it back
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── The boundary panels ──────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-lifecycle-finished">
                They will see
              </p>
              <ul className="space-y-2 text-sm text-foreground/85">
                <li className="flex gap-2.5">
                  <span className="text-lifecycle-finished">✓</span> Title,
                  author, genre, year, page count
                </li>
                <li className="flex gap-2.5">
                  <span className="text-lifecycle-finished">✓</span> The cover
                </li>
                <li className="flex gap-2.5">
                  <span className="text-lifecycle-finished">✓</span> That it was
                  you who sent it
                </li>
              </ul>
            </div>
            <div className="space-y-3 rounded-[var(--radius)] border border-destructive/25 bg-destructive/5 p-5">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-destructive">
                They will never see
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2.5">
                  <span className="text-destructive">✕</span> Your reflection or
                  any journal text
                </li>
                <li className="flex gap-2.5">
                  <span className="text-destructive">✕</span> Your rating,
                  dates, or reading pace
                </li>
                <li className="flex gap-2.5">
                  <span className="text-destructive">✕</span> Your shelves,
                  library, or anything else you&rsquo;ve read
                </li>
              </ul>
              <p className="border-t border-destructive/15 pt-2.5 text-xs text-muted-foreground">
                There is no setting that turns these on. Sharing a book never
                shares a word you wrote.
              </p>
            </div>
          </div>

          {/* ── Exactly what lands ───────────────────────────────────── */}
          <div className="space-y-2.5 pb-2">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
              Exactly what lands in their account
            </p>
            <div className="flex items-center gap-5 rounded-[var(--radius)] border border-border bg-secondary/60 p-5">
              <div className="w-16 shrink-0">
                <BookCover
                  title={book.title}
                  author={book.author}
                  coverImage={book.coverImage}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-display text-lg text-foreground">
                  {book.title}
                </p>
                <p className="text-xs text-muted-foreground">{meta}</p>
                <p className="pt-0.5 text-xs text-muted-foreground/80">
                  Sent by you · no note attached
                </p>
              </div>
              <div className="hidden w-44 space-y-1.5 border-l border-border pl-5 sm:block">
                {["★★★★★", "", ""].map((stars, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {stars ? (
                      <span className="text-xs text-muted-foreground/50 line-through">
                        {stars}
                      </span>
                    ) : (
                      <span
                        className="h-1.5 rounded-full bg-muted"
                        style={{ width: i === 1 ? 96 : 72 }}
                      />
                    )}
                    <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                      withheld
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
