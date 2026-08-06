import rateLimit from "express-rate-limit";

// 100 requests per window is right for production and wrong for a demo: every
// page fires several queries and react-query retries multiply them, so a
// reviewer clicking through the app at normal pace goes dark after a few
// minutes with no hint why (found during the cold-clone rehearsal — the walk
// itself tripped it three times). The headroom is an EXPLICIT opt-in:
// NODE_ENV must say development or test (.env.example sets it), so a
// deployment that forgets NODE_ENV gets the strict ceiling, not the loose one.
const relaxed =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000, // 15 minutes
  max: relaxed ? 2_000 : 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10, // stricter limit for auth endpoints
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
});
