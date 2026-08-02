import { Link, NavLink } from "react-router-dom";
import { usePendingInvites } from "../../hooks/useContributors";
import { UserMenu } from "./UserMenu";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/library", label: "Library" },
  { to: "/shelves", label: "Shelves" },
  { to: "/discover", label: "Discover" },
  { to: "/memory", label: "Memory" },
  { to: "/metrics", label: "Metrics" },
];

/** The design's top nav: Library · Shelves · Discover · Memory · Metrics (G19). */
export function TopNav() {
  const { data: invites } = usePendingInvites();
  const waiting = invites?.length ?? 0;

  return (
    <header className="border-b border-border/70 bg-background">
      <div className="mx-auto flex h-16 max-w-[84rem] items-center gap-4 px-4 sm:gap-8 sm:px-8 lg:px-12">
        <Link
          to="/library"
          className="font-display text-xl italic text-foreground"
        >
          Folio
        </Link>

        {/* Five items don't fit a phone; the nav scrolls inside itself
            rather than pushing the page wide. */}
        <nav className="flex h-16 items-stretch gap-5 overflow-x-auto whitespace-nowrap sm:gap-7">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center border-b-2 text-sm transition-colors",
                  isActive
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* Kept out of the main four so the design's nav stays intact, but a
              contributor still needs a way to find (and answer) an invite. */}
          <NavLink
            to="/shared"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 whitespace-nowrap text-sm transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <span className="sm:hidden">Shared</span>
            <span className="hidden sm:inline">Shared with you</span>
            {waiting > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-medium text-primary-foreground">
                {waiting}
              </span>
            )}
          </NavLink>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
