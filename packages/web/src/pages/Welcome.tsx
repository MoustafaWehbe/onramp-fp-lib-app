import { Link } from "react-router-dom";
import { BookCover } from "../components/folio/BookCover";
import { buttonVariants } from "../components/ui/button";

const PROMISES = [
  {
    title: "No feeds, no followers",
    line: "Your activity is never broadcast. There is nothing to perform for.",
  },
  {
    title: "Your journal stays yours",
    line: "Notes, ratings, and reflections are visible to exactly one person: you.",
  },
  {
    title: "Share a shelf, not your life",
    line: "Invite one person to a single shelf. Everything else stays private.",
  },
];

/** Decorative — the generated covers doing the talking, as on the design. */
const SHELF = [
  { title: "The Winter Orchard", author: "Sofia Lindqvist" },
  { title: "Salt & Ember", author: "J. R. Okafor" },
  { title: "The Peregrine Notebooks", author: "R. F. Caldwell" },
  { title: "Blue Hours", author: "M. Adeyemi" },
];

/** Design A1 — "private by design". */
export function Welcome() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-6">
        <span className="font-display text-xl italic text-primary">Folio</span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Sign in
          </Link>
          <Link to="/register" className={buttonVariants({ size: "sm" })}>
            Start your library
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="space-y-6">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Private by design
            </p>
            <h1 className="font-display text-[2.75rem] leading-[1.1] text-foreground sm:text-[3.25rem]">
              A reading life, kept quietly.
            </h1>
            <p className="max-w-md text-[1.05rem] leading-relaxed text-muted-foreground">
              Folio is a personal archive for what you read and what you thought
              of it. No feed. No followers. No audience.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/register" className={buttonVariants()}>
                Start your library
              </Link>
              <Link
                to="/login"
                className={buttonVariants({ variant: "outline" })}
              >
                I have an account
              </Link>
            </div>
          </div>

          <div
            className="grid grid-cols-4 gap-3"
            aria-hidden="true"
          >
            {SHELF.map((book, i) => (
              <BookCover
                key={book.title}
                title={book.title}
                author={book.author}
                className={i % 2 === 0 ? "translate-y-4" : ""}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-8 border-t border-border py-16 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="space-y-2">
              <h2 className="font-display text-lg text-foreground">
                {promise.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {promise.line}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs text-muted-foreground">
          Folio · a reading life, kept quietly.
        </p>
      </footer>
    </div>
  );
}
