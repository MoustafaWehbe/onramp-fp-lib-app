# Designed-state coverage audit

Source: `planning-reference/design/folio-v2.html` (81 frames). Every frame whose label
marks a state — empty, loading, failed, unavailable, thinking, or too-thin — checked
against the code on `feature/design-v2-memory-and-ai` as of the Part 1.5 sweep.

Status legend: **built** (state exists and matches the frame's intent) ·
**built*** (exists with a noted deviation) · **missing** (not in code) ·
**n/a** (out of scope for #25 by the brief).

## Section B — catalog & library

| Frame | State | Status | Where |
|---|---|---|---|
| B4 Library empty | empty | built | `Library.tsx` — A3 first-run and filtered-empty are separate screens, as designed |
| B4 Library loading | loading | built | `Library.tsx` `BookGridShimmer` |
| B6a Upload idle | empty | built | `CoverDropzone.tsx` |
| B6a Upload dragging | loading-adjacent | built | `CoverDropzone.tsx` |
| B6a Upload uploading | loading | built | `CoverDropzone.tsx`, real progress |
| B6a Upload attached | — | built | `CoverDropzone.tsx` |
| B6a Upload error | failed | built | `CoverDropzone.tsx` — size/type/failed upload share the treatment |
| B6a Search loading | loading | built | `CatalogSearch.tsx` |
| B6a Search empty | empty | built | `CatalogSearch.tsx`, "Enter it manually" |
| B6a Search unavailable | unavailable | built | `CatalogSearch.tsx` — search collapses, form never blocks |
| B7a Similar loading | loading | built | `SimilarBooks.tsx` |
| B7a Similar too-thin | too-thin | built | `SimilarBooks.tsx` (< 5 embedded books) |
| B7a Similar unavailable | unavailable | built | `SimilarBooks.tsx`, retry |
| B8a Prompts loading | loading | built | `JournalPrompts.tsx` think-dots + shimmer pills |
| B8a Prompts dismissed | — | built | `JournalPrompts.tsx`, per-book, remembered client-side |
| B8a Prompts failed | failed | built | `JournalPrompts.tsx`, dismissible, never blocks typing |

## Section C — collections & metrics

| Frame | State | Status | Where |
|---|---|---|---|
| C11 Shelf empty | empty | built | `ShelfDetail.tsx` — "An empty shelf is a promise." |

C9 (shelf list) and C12 (metrics) carry their empty treatments inside the main frames —
both built (`Shelves.tsx` dashed create tile + EmptyState; `Metrics.tsx` EmptyState and
"No finished books yet").

## Section D — discovery

| Frame | State | Status | Where |
|---|---|---|---|
| D13 Discovery empty | empty | built | `Discover.tsx` progress meter; try-anyway failure now renders in place (Part 1.5) |
| D15 Thinking | loading | built | `Discover.tsx` generate.isPending section |
| D16 Mood thinking | loading | built | `MoodShelf.tsx` bars + estimate + cancel |
| D16 Mood thin data | too-thin | built | `MoodShelf.tsx`, "Build one anyway" |
| D16 Mood unavailable | unavailable | built | `MoodShelf.tsx` "The shelf-builder is asleep." |

Deviation noted at build time: D16's "Swap a book out" affordance is not implemented
(the results grid links through to book detail instead).

## Section E — sharing

| Frame | State | Status | Where |
|---|---|---|---|
| E18 Nothing shared | empty | built | `SharedShelves.tsx` sent-books empty state |
| E18 Sending | loading | built | `ShareBookDialog.tsx` think-dots row, button disabled, modal stays open |
| E18 Send failed | failed | built | `ShareBookDialog.tsx` — server message + nothing-was-shared framing |

## Section F — administration (deferred to #26 by the main brief)

| Frame | State | Status | Where |
|---|---|---|---|
| F18 Status states | nominal/degraded/failed | missing | status strip exists; the three designed registers do not (Task 6c) |
| F18 Audit empty | empty | missing | Task 6d |
| F18 Usage no data | empty | missing | Task 6d |
| F18 Loading | loading | built* | skeleton exists; failed-stats now states itself (`8fed526`), but the designed loading frame's layout is not matched (Task 6d) |
| F18 Unreachable | unavailable | missing | Task 6d |
| F18 Mobile overview / Mobile audit log | — | missing | Task 6e |
| F18a Audit log / Accounts / Delete confirm | — | missing | Tasks 6a/6b |

## Section G — memory & retrospective

| Frame | State | Status | Where |
|---|---|---|---|
| G19 Memory empty | empty | built | `Memory.tsx` hero with counts |
| G19 Memory searching | loading | built | `Memory.tsx` shimmer cards |
| G19 Memory no matches | empty | built | `Memory.tsx`, suggestion chips |
| G19 Memory no writing yet | empty | built | `Memory.tsx` |
| G19 Memory unavailable | unavailable | built* | server answers `mode:"exact"` → offline banner over word-search results. The frame additionally restyles the search box with an "exact match" badge; the banner carries the message instead. A request that never reaches the server is a separate, stated failure (Part 1.5) |
| G20 Generating | loading | built | `YearInReading.tsx` |
| G20 Too early | too-thin | built | `YearInReading.tsx` (<10 finished before December) |
| G20 Unavailable | unavailable | built | `YearInReading.tsx` — counts render, narrative states its absence |

## Out of scope / reference frames

| Frame | Status | Note |
|---|---|---|
| 0 Style Guide, 0M ×2 | n/a | reference; 0M lands with Part 2 Task 5 |
| G21 Page turn | n/a | untouched by design brief and by code |
| Mobile frames (B6a, D16 ×2, E18 sheet, G19 ×2, G20) | built | Part 1 Task 3; these are layouts, not states |

## Designed-but-unframed failures (built in Part 1.5 to the F18 idiom)

The canvas has no failure frame for the pre-v2 pages. Per the brief, these follow the
F18 idiom — one plain statement, one retry, existing tokens (`EmptyState`):

`Library`, `Shelves`, `ShelfDetail`, `Metrics`, `BookDetail`, `Journal`,
`AddBook` (edit mode), `SharedShelves` (page + per-section sent/received lines),
`SharedShelfDetail`, `Memory` (failed search). `Discover`'s failure renders inside its
designed empty state.

## Gaps to decide for #25 vs deferral

1. **Section F states** — all missing here; the main brief assigns them to #26 (Task 6).
2. **G19 exact-match input badge** — the frame's in-box "exact match" treatment; the
   offline banner covers the message today.
3. **D16 "Swap a book out"** — absent; deliberate at build time, listed for a decision.
4. **B6a mobile sheet chrome** — the frame draws Cancel / Add a book / Save as a sheet
   header bar; the build keeps the form's own buttons.
