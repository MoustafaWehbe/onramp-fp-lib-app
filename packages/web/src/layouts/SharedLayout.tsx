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
      <header className="border-b border-border/70 bg-card/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <Link to="/library" className="font-display text-xl italic text-primary">
            Folio
          </Link>
          <span className="text-sm text-foreground">Shared with you</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Contributor view
            </span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
