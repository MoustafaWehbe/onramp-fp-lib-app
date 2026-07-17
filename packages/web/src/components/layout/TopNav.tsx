import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { usePendingInvites } from "../../hooks/useContributors";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/library", label: "Library" },
  { to: "/shelves", label: "Shelves" },
  { to: "/discover", label: "Discover" },
  { to: "/metrics", label: "Metrics" },
];

export function initialsOf(name?: string | null) {
  if (!name) return "··";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** The design's four-item top nav: Library · Shelves · Discover · Metrics. */
export function TopNav() {
  const { user } = useAuth();
  const { data: invites } = usePendingInvites();
  const waiting = invites?.length ?? 0;

  return (
    <header className="border-b border-border/70 bg-card/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
        <Link
          to="/library"
          className="font-display text-xl italic text-primary"
        >
          Folio
        </Link>

        <nav className="flex items-center gap-6">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "text-sm transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
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
                "flex items-center gap-1.5 text-sm transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            Shared with you
            {waiting > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-medium text-primary-foreground">
                {waiting}
              </span>
            )}
          </NavLink>

          <Link
            to="/settings"
            title={user?.name ?? "Account"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[0.7rem] font-medium text-accent-foreground"
          >
            {initialsOf(user?.name)}
          </Link>
        </div>
      </div>
    </header>
  );
}
