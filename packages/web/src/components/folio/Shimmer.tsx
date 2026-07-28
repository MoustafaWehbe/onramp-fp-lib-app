import { cn } from "../../lib/utils";

/**
 * Design §0: "Loading pattern — shimmer, never spinners." Renders a block in
 * the page's own shape so layout doesn't jump when real content arrives.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-[var(--radius)] bg-[linear-gradient(90deg,#EFE8DA_25%,#F7F2E8_45%,#EFE8DA_65%)] [background-size:500px_100%]",
        className,
      )}
    />
  );
}

/** A grid of book-shaped shimmers for the library/shelf views. */
export function BookGridShimmer({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Shimmer className="aspect-[2/3] w-full" />
          <Shimmer className="h-3 w-4/5" />
          <Shimmer className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
