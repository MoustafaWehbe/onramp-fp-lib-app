import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
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

        <Link
          to="/settings"
          title={user?.name ?? "Account"}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[0.7rem] font-medium text-accent-foreground"
        >
          {initialsOf(user?.name)}
        </Link>
      </div>
    </header>
  );
}
