import type { ReactNode } from "react";

/**
 * Design §0 empty-state pattern: "Nothing here yet / One quiet sentence, one
 * clear action." Always one sentence and at most one action.
 */
export function EmptyState({
  title,
  line,
  action,
}: {
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <p className="font-display text-xl text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{line}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
