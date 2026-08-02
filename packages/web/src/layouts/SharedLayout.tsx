import { Link, Outlet } from "react-router-dom";
import { UserMenu } from "../components/layout/UserMenu";

/**
 * Design E17 — "note the reduced nav". A shared shelf is the contributor's whole
 * world here: no Library, Shelves, Discover or Metrics, because none of the
 * owner's are theirs to browse. The shrunken nav *is* the privacy boundary,
 * made visible.
 */
export function SharedLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex h-16 max-w-[84rem] items-center gap-6 px-12">
          <Link
            to="/library"
            className="font-display text-xl italic text-foreground"
          >
            Folio
          </Link>
          <span className="flex h-16 items-center border-b-2 border-primary text-sm font-semibold text-foreground">
            Shared with you
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Contributor view
            </span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[84rem] flex-1 px-12 py-10">
        <Outlet />
      </main>
    </div>
  );
}
