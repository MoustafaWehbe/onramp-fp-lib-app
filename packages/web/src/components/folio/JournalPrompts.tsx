import { useState } from "react";
import { useJournalPrompts } from "../../hooks/useBooks";
import { Shimmer } from "./Shimmer";
import { cn } from "../../lib/utils";

/** Dismissal is per book and remembered — client-side only, nothing is logged. */
const dismissKey = (bookId: string) => `folio:journal-prompts:dismissed:${bookId}`;

function ThinkDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-end gap-1", className)} aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="animate-think h-[5px] w-[5px] rounded-full bg-primary"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

interface JournalPromptsProps {
  bookId: string;
  onPick: (prompt: string) => void;
}

/**
 * Design B8a — "A few ways in, if you want one." The prompts never take the
 * writing field: loading, failure, and dismissal all degrade to the plain
 * empty textarea underneath.
 */
export function JournalPrompts({ bookId, onPick }: JournalPromptsProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissKey(bookId)) === "1",
  );
  const [hiddenPrompts, setHiddenPrompts] = useState<string[]>([]);
  const [errorHidden, setErrorHidden] = useState(false);

  const { data, isLoading, isError, refetch } = useJournalPrompts(
    bookId,
    !dismissed,
  );

  function dismissAll() {
    localStorage.setItem(dismissKey(bookId), "1");
    setDismissed(true);
  }

  function bringBack() {
    localStorage.removeItem(dismissKey(bookId));
    setHiddenPrompts([]);
    setDismissed(false);
  }

  if (dismissed) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Prompts hidden for this book.</span>
        <button
          onClick={bringBack}
          className="font-medium text-primary underline hover:text-accent-foreground"
        >
          Bring them back
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <ThinkDots />
          <span className="text-xs text-muted-foreground">
            Thinking of a few openings…
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Shimmer className="h-9 w-64 rounded-full" />
          <Shimmer className="h-9 w-48 rounded-full" />
          <Shimmer className="h-9 w-36 rounded-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    if (errorHidden) return null;
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 px-3.5 py-2.5">
        <span className="flex-1 text-xs text-destructive">
          Prompts aren&rsquo;t available right now.
        </span>
        <button
          onClick={() => refetch()}
          className="text-xs font-medium text-primary underline hover:text-accent-foreground"
        >
          Retry
        </button>
        <button
          onClick={() => setErrorHidden(true)}
          aria-label="Dismiss"
          className="text-xs text-muted-foreground/70 hover:text-foreground"
        >
          ✕
        </button>
      </div>
    );
  }

  const prompts = (data ?? []).filter((p) => !hiddenPrompts.includes(p));
  if (prompts.length === 0) return null;

  function hidePrompt(prompt: string) {
    const next = [...hiddenPrompts, prompt];
    setHiddenPrompts(next);
    // Waving away the last chip means "not today" — remember it like a dismiss.
    if ((data ?? []).every((p) => next.includes(p))) dismissAll();
  }

  return (
    // 0M Settling — the chips replace their shimmer pills as one region.
    <div className="animate-settle space-y-3">
      <p className="text-xs text-muted-foreground">
        A few ways in, if you want one. Tap to start writing from it.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {prompts.map((prompt) => (
          <span
            key={prompt}
            className="flex items-center gap-1 rounded-full border border-border bg-card py-2 pl-4 pr-2 transition-colors hover:border-primary"
          >
            <button
              onClick={() => onPick(prompt)}
              className="font-display text-[0.85rem] italic text-foreground/85"
            >
              {prompt}
            </button>
            <button
              onClick={() => hidePrompt(prompt)}
              aria-label={`Dismiss prompt: ${prompt}`}
              className="px-1.5 text-xs text-muted-foreground/60 hover:text-foreground"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
