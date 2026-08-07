import { useEffect, useRef, useState } from "react";
import { bookFileUrl, useSaveProgress } from "../../hooks/useBooks";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

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
  bookId: string;
  /** Resume position: seconds stored as a string, or null. */
  initialPosition: string | null;
}

/**
 * The listening surface. A native <audio> element against the Range endpoint
 * — the browser seeks with byte ranges, so nothing downloads in full before
 * playing. No library: play/pause, seek, speed, skip 30s is exactly what the
 * element already does.
 */
export function AudioPlayer({ bookId, initialPosition }: AudioPlayerProps) {
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

  const el = audioRef.current;

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
    <div className="space-y-5 rounded-[var(--radius)] border border-border bg-card p-5 sm:p-7">
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
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
        onEnded={() => {
          setPlaying(false);
          persist();
        }}
      />

      {/* Scrubber — a native range input styled by the token set. */}
      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const at = Number(e.target.value);
            if (el) el.currentTime = at;
            setTime(at);
          }}
          aria-label="Seek"
          className="w-full accent-primary"
        />
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>{fmt(time)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (el) el.currentTime = Math.max(0, el.currentTime - 30);
          }}
          aria-label="Back 30 seconds"
        >
          ↺ 30
        </Button>
        <Button
          size="lg"
          onClick={() => {
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          aria-label={playing ? "Pause" : "Play"}
          className="min-w-[6rem]"
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (el)
              el.currentTime = Math.min(
                el.duration || Infinity,
                el.currentTime + 30,
              );
          }}
          aria-label="Forward 30 seconds"
        >
          30 ↻
        </Button>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <span className="text-xs text-muted-foreground">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSpeed(s);
              if (el) el.playbackRate = s;
            }}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
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
  );
}
