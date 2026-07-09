import { Link } from "react-router-dom";
import { buttonVariants } from "../components/ui/button";

export function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl">Page not found</p>
      {/* The Button component renders a native <button> and has no asChild/Slot
          support, so style the router Link directly with buttonVariants —
          shadcn's documented pattern for a link that looks like a button. */}
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Go home
      </Link>
    </div>
  );
}
