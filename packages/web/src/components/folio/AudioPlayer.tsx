import { useEffect, useRef, useState } from "react";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { BookCover } from "./BookCover";
import { cn } from "../../lib/utils";
import type { Book } from "../../lib/types";
import type { ReaderStatus } from "../../pages/library/Reader";

/** Position writes go out roughly this often while playing, and on pause. */
const PERSIST_INTERVAL_MS = 10_000;

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

interface AudioPlayerProps {
  book: Book;
  /** Resume position: seconds stored as a string, or null. */
  initialPosition: string | null;
  /** Reports position + percent up to the chrome bar. */
  onStatus?: (s: ReaderStatus) => void;
}

/**
 * The listening surface: the book, then the transport. Cover, title and
 * author in the reading register (Newsreader, quiet metadata), a real
 * scrubber with elapsed and remaining time, skip 30s both ways, playback
 * speed. The element itself stays native — the browser seeks with byte
 * ranges against the 206 endpoint, so nothing downloads in full.
 */
export function AudioPlayer({
  book,
  initialPosition,
  onStatus,
}: AudioPlayerProps) {
  const bookId = book.id;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const saveProgress = useSaveProgress(bookId);
  // The latest position, readable from the interval without re-arming it.
  const positionRef = useRef({ time: 0, duration: 0 });

  // Resume once metadata arrives (seeking needs the duration known).
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoaded = () => {
      setDuration(el.duration);
      const at = Number(initialPosition);
      if (Number.isFinite(at) && at > 0 && at < el.duration) {
        el.currentTime = at;
      }
    };
    el.addEventListener("loadedmetadata", onLoaded);
    return () => el.removeEventListener("loadedmetadata", onLoaded);
    // initialPosition is a mount-time snapshot; re-running on its change
    // would yank the playhead back mid-listen after each save round-trip.
  }, []);

  function persist() {
    const { time: t, duration: d } = positionRef.current;
    if (d <= 0) return;
    saveProgress.mutate({
      position: String(Math.floor(t)),
      percent: Math.round((t / d) * 1000) / 10,
    });
  }

  // Persist every ~10s while playing, and once more on unmount.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(persist, PERSIST_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(
    () => () => {
      if (positionRef.current.time > 0) persist();
    },
    [],
  );

  function seekBy(delta: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(
      0,
      Math.min(el.duration || Infinity, el.currentTime + delta),
    );
    // Keep the persisted position in step with the seek — a pause right
    // after skipping must save the new position, not the pre-seek one.
    positionRef.current = { time: el.currentTime, duration: el.duration };
  }

  // Space toggles play; arrows skip — the transport from the keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const el = audioRef.current;
      if (!el) return;
      if (e.key === " ") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if (e.key === "ArrowRight") seekBy(30);
      else if (e.key === "ArrowLeft") seekBy(-30);
      else if (e.key === "Home") el.currentTime = 0;
      else if (e.key === "End" && Number.isFinite(el.duration))
        el.currentTime = Math.max(0, el.duration - 5);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const remaining = Math.max(0, duration - time);

  if (failed) {
    return (
      <div className="space-y-2 py-16 text-center">
        <p className="font-display text-xl text-foreground">
          This audio wouldn&rsquo;t play.
        </p>
        <p className="text-sm text-muted-foreground">
          The book and your journal are untouched — the file just couldn&rsquo;t
          be read. Try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-background px-4">
      <audio
        ref={audioRef}
        src={bookFileUrl(bookId, "AUDIO")}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persist();
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          positionRef.current = { time: a.currentTime, duration: a.duration };
          setTime(a.currentTime);
          if (Number.isFinite(a.duration) && a.duration > 0) {
            onStatus?.({
              label: `${fmt(a.currentTime)} of ${fmt(a.duration)}`,
              percent: (a.currentTime / a.duration) * 100,
            });
          }
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
        onEnded={() => {
          setPlaying(false);
          persist();
        }}
      />

      <div className="w-full max-w-md space-y-7 py-8">
        {/* The book, in the reading register. */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="w-40 sm:w-48">
            <BookCover
              title={book.title}
              author={book.author}
              coverImage={book.coverImage}
            />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-2xl text-foreground">
              {book.title}
            </h1>
            <p className="text-sm text-muted-foreground">{book.author}</p>
          </div>
        </div>

        {/* Scrubber: elapsed left, remaining right. */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={1}
            value={Math.min(time, duration || 0)}
            onChange={(e) => {
              // The ref is read at event time — a render-time capture is
              // null on the first paint and goes stale after remounts.
              const at = Number(e.target.value);
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = at;
                positionRef.current = { time: at, duration: audio.duration };
              }
              setTime(at);
            }}
            aria-label="Seek"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${
                duration > 0 ? (time / duration) * 100 : 0
              }%, hsl(var(--border)) 0)`,
            }}
          />
          <div className="flex justify-between font-mono text-xs text-muted-foreground">
            <span>{fmt(time)}</span>
            <span>−{fmt(remaining)}</span>
          </div>
        </div>

        {/* Transport — 44px touch targets. */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={() => seekBy(-30)}
            aria-label="Back 30 seconds"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            ↺30
          </button>
          <button
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (audio.paused) void audio.play();
              else audio.pause();
            }}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground transition-colors hover:bg-accent-foreground"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => seekBy(30)}
            aria-label="Forward 30 seconds"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            30↻
          </button>
        </div>

        <div className="flex items-center justify-center gap-1">
          <span className="pr-1 text-xs text-muted-foreground">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSpeed(s);
                const audio = audioRef.current;
                if (audio) audio.playbackRate = s;
              }}
              className={cn(
                "min-h-[44px] rounded-full px-2.5 text-xs font-medium transition-colors",
                speed === s
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
