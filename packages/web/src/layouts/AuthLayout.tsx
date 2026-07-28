import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

/** Design A2 — the promise on the left, the form on the right. */
export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Design A2: the promise panel is ink-dark, cream type on #221D16. */}
      <aside className="hidden flex-col justify-between bg-foreground p-12 text-[#F5EFE3] lg:flex">
        <Link to="/" className="font-display text-2xl italic">
          Folio
        </Link>

        <blockquote className="max-w-md space-y-5">
          <p className="font-display text-[2.125rem] italic leading-[1.35]">
            “The library you keep for yourself is the truest record of who you
            are.”
          </p>
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[#B4A896]">
            A private reading journal
          </p>
        </blockquote>

        <p className="text-[0.8rem] text-[#8A7E6E]">
          No feeds · No followers · No public profiles
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <Link
            to="/"
            className="block font-display text-2xl italic text-foreground lg:hidden"
          >
            Folio
          </Link>

          <nav className="flex gap-6 border-b border-border">
            <AuthTab to="/login">Log in</AuthTab>
            <AuthTab to="/register">Create account</AuthTab>
          </nav>

          <Outlet />

          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            Your session is secured with httpOnly JWT cookies. Folio never posts
            anything, anywhere.
          </p>
        </div>
      </main>
    </div>
  );
}

function AuthTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "-mb-px border-b-2 pb-3 text-sm transition-colors",
          isActive
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}
