/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Reading-lifecycle accents (design §0, "Lifecycle states").
        lifecycle: {
          want: "#8A7A45",
          reading: "#A34E2C",
          finished: "#3E5C46",
          abandoned: "#9A9086",
        },
        // The admin console (design F18) is deliberately its own dark mode
        // with a fixed palette — not the themeable reader-app tokens.
        admin: {
          bg: "#191713",
          panel: "#201D18",
          strip: "#221E18",
          line: "#2E2A24",
          row: "#262219",
          ink: "#E7DFD0",
          body: "#C9C1B2",
          dim: "#8A8378",
          note: "#A79E8F",
          amber: { DEFAULT: "#D9A268", bg: "#3A2E22" },
          green: "#6FA37A",
          red: "#D98B68",
          avatar: { DEFAULT: "#3A3630", ink: "#D6CEC0" },
          bar: "#4A4336",
        },
      },
      fontFamily: {
        // Newsreader for display/headings, Instrument Sans for UI text,
        // JetBrains Mono for numerals + metadata — the design's type scale.
        display: ["Newsreader", "Georgia", "serif"],
        sans: ["'Instrument Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Design 0M — the motion tokens, pasted from the frame's config line.
      // Three durations (a set, not a continuum) and two curves: settle for
      // every entrance, retire for every exit.
      transitionDuration: {
        instant: "80ms",
        short: "140ms",
        considered: "220ms",
      },
      transitionTimingFunction: {
        settle: "cubic-bezier(.32,.72,0,1)",
        retire: "cubic-bezier(.4,0,1,1)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        // 0M pattern 1 · Settling — content replacing a placeholder.
        "settle-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // 0M pattern 2 · Arriving — a surface that owns the screen.
        "arrive-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "scrim-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "retire-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(4px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        settle: "settle-in 140ms cubic-bezier(.32,.72,0,1) both",
        // 0M pattern 3 · Acknowledging — the result fades in exactly where it
        // belongs: opacity only (scrim-in), no travel, short/140ms settle.
        acknowledge: "scrim-in 140ms cubic-bezier(.32,.72,0,1) both",
        arrive: "arrive-in 220ms cubic-bezier(.32,.72,0,1) both",
        sheet: "sheet-in 220ms cubic-bezier(.32,.72,0,1) both",
        scrim: "scrim-in 140ms cubic-bezier(.32,.72,0,1) both",
        retire: "retire-out 140ms cubic-bezier(.4,0,1,1) both",
      },
    },
  },
  plugins: [],
};
