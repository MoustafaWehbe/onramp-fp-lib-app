import { cn } from "../../lib/utils";
import { STATUS_DOT, STATUS_LABEL, type ReadingStatus } from "../../lib/types";

/** Lifecycle pill — a colour dot plus the design's wording for the state. */
export function StatusBadge({
  status,
  className,
}: {
  status: ReadingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
