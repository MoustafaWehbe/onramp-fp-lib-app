import { cn } from "../../lib/utils";

/** Spine colours drawn from the design's cover palette. */
const SPINE = ["#41553F", "#7A3B2E", "#39424E", "#6E6559", "#8C3F22"];

/** Stable per-title colour, so a book always gets the same generated cover. */
function spineFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return SPINE[hash % SPINE.length];
}

interface BookCoverProps {
  title: string;
  author: string;
  coverImage?: string | null;
  className?: string;
}

/**
 * A book cover. Design B6: "a typographic cover is generated otherwise" — when
 * there's no image we set the title in the display face over a stable colour
 * rather than showing a broken/placeholder image.
 */
export function BookCover({
  title,
  author,
  coverImage,
  className,
}: BookCoverProps) {
  const base = cn(
    "aspect-[2/3] w-full overflow-hidden rounded-[var(--radius)] border border-border/60",
    className,
  );

  if (coverImage) {
    return (
      <img
        src={coverImage}
        alt={`${title} by ${author}`}
        loading="lazy"
        className={cn(base, "object-cover")}
      />
    );
  }

  return (
    <div
      className={cn(base, "flex flex-col justify-between p-3 text-left")}
      style={{ backgroundColor: spineFor(title + author) }}
      aria-label={`${title} by ${author}`}
    >
      <span className="font-display text-[0.95rem] leading-tight text-[#FFFDF9]">
        {title}
      </span>
      <span className="font-sans text-[0.65rem] uppercase tracking-wide text-[#FFFDF9]/70">
        {author}
      </span>
    </div>
  );
}
