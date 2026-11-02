# Books Inspiration Daily Feature - Implementation Plan

## Overview
Add a daily books inspiration feature that displays a randomly shuffled book idea each day. The same idea shows all day; a different one appears on a new calendar day. A client-side shuffle button allows previewing other ideas without persisting changes.

---

## Backend Implementation

### 1. Create `/api/books/daily-inspiration` endpoint
**What to do:** Create a new route module at `backend/src/routes/books.rs` with a GET endpoint that loads all JSON files from `backend/data/books/`, uses a date-based deterministic seed (days since epoch) to pick a weighted-random entry, and returns it. This ensures the same entry all day, different on new day. Return JSON with: `{ book, chapter, idea, application, tags }`. The endpoint requires **no authentication** (public landing page feature).

**Rationale:** A date-based seed ensures deterministic randomization per calendar day without server state. The endpoint is public to avoid forcing users to auth before seeing inspiration. Weighted selection respects the `weight` field in book JSON files.

**Files:**
- `backend/src/routes/books.rs` (create)
- `backend/src/routes/mod.rs` (modify to add `pub mod books;` and mount `/api/books`)

**Verify:** 
- `cargo build` — compiles without errors
- `cargo test` — all tests pass (if any exist)
- `curl http://localhost:8000/api/books/daily-inspiration` — returns valid JSON with expected fields

---

### 2. Parse and load book JSON files from disk
**What to do:** In `books.rs`, implement a helper function that reads all `*.json` files from `backend/data/books/` (or `GROWTH_BOOKS_DIR` env var, defaulting to `data/books`). Parse each as an array of items matching the shape: `{ book, chapter, idea, application, tags, weight }`. Collect all items into a single flat list. Handle file I/O errors gracefully (log and skip malformed files; return 500 if dir doesn't exist or is unreadable).

**Rationale:** Mirrors the pattern used in `routes/knowledge.rs` for the knowledge ingest endpoint. Reuses existing book data format and directory structure.

**Files:**
- `backend/src/routes/books.rs`

**Verify:** 
- Files load correctly: `cargo test` or manual curl
- Malformed JSON is skipped: add a corrupt JSON file to `data/books/` and verify endpoint still works

---

### 3. Implement weighted-random selection with date-based seed
**What to do:** Implement a function that:
1. Calculates days since Unix epoch from today's UTC date (integer seed)
2. Seeds a deterministic RNG with this integer
3. Performs weighted-random selection: sum all weights, pick a random value in [0, total_weight), iterate items summing weights until exceeding the pick
4. Returns the selected item
5. Validates the data is not empty

**Rationale:** Deterministic RNG seeded by date ensures same item all day, different each day. Weighted selection respects the importance/frequency field in the data. Using days-since-epoch is simpler than parsing dates and works across time zones (UTC is canonical).

**Files:**
- `backend/src/routes/books.rs`

**Verify:**
- Same item returned for the same calendar day: make two requests on the same day, confirm identical response
- Different item returned on different days: mock system time or use `GROWTH_BOOKS_DIR=data/books_test` with limited data, verify day change triggers different pick
- Weighted selection works: data with heavily weighted items should appear more frequently over many days (spot-check, not exhaustive)

---

## Frontend Implementation

### 4. Create `BooksInspirationCard` component
**What to do:** Create a new component at `src/components/BooksInspirationCard.tsx` that displays a single book idea. Layout:
- Book title and chapter (metadata, muted color, Space Mono font, small)
- Idea quote (larger, ink color, Epilogue font)
- Application (practical how-to, muted color)
- Tags (small labels, Space Mono, comma-separated or as pill buttons)
- Client-side shuffle button (labeled "Shuffle", non-persisting)

**Rationale:** Follows existing MrT design language (tokens.css: canvas #F2EDE4, ink #181716, crimson #BD2E24, muted #5F5A53, Space Mono for metadata, Epilogue for headlines). Separated component enables reuse and testing.

**Files:**
- `src/components/BooksInspirationCard.tsx` (create)
- `src/components/BooksInspirationCard.css` (create for component-scoped styles, or inline in existing landing.css if small)

**Verify:**
- Component renders without error: `npm run build` or dev server
- Props are correctly typed with TypeScript
- Styling matches design tokens (run visual inspection against landing page)

---

### 5. Create `booksApi` client endpoint
**What to do:** Create `src/lib/api/endpoints/books.ts` following the existing pattern (e.g., `health.ts`):
- Export `booksApi` object with `getDailyInspiration()` method
- Call `/api/books/daily-inspiration` with `auth: false`
- Parse response against a Zod schema (create `src/lib/api/schemas/books.ts`)
- Return typed `BookIdea` with fields: `book`, `chapter`, `idea`, `application`, `tags` (array of strings)

**Rationale:** Mirrors existing API client pattern. Zod validation ensures type safety on the wire. Public auth ensures no sign-in required.

**Files:**
- `src/lib/api/endpoints/books.ts` (create)
- `src/lib/api/schemas/books.ts` (create)
- `src/lib/api/index.ts` (modify to export `booksApi` and schema)

**Verify:**
- `npm run typecheck` — no TypeScript errors
- Schema parsing: unit test or manual dev server test with network mock

---

### 6. Integrate into `LandingScreen`
**What to do:** In `src/screens/LandingScreen.tsx`:
1. Use `useQuery` from `@tanstack/react-query` to call `booksApi.getDailyInspiration()` with query key `queryKeys.inspiration` (add key to `src/lib/query/keys.ts` if needed)
2. Place `<BooksInspirationCard>` component in the landing hero section (e.g., in a new card next to or below the edition preview)
3. Pass the API result + a shuffle callback to the card
4. Handle loading and error states (show skeleton or fallback text)

**Rationale:** Integrates inspiration seamlessly into landing page without breaking existing layout. React Query handles caching (same call won't refetch today). Card component is stateless, shuffle is client-side only (no mutation).

**Files:**
- `src/screens/LandingScreen.tsx` (modify)
- `src/lib/query/keys.ts` (modify to add `inspiration` key if not present)
- `src/styles/landing.css` (modify to add grid/layout for inspiration card if needed)

**Verify:**
- Dev server loads without errors: `npm run dev`
- Landing page displays inspiration card
- Shuffle button updates displayed idea without page reload or API call
- Same idea persists across page refresh (API returns same idea for same day)

---

### 7. Implement client-side shuffle logic
**What to do:** In `BooksInspirationCard.tsx`, add state to track:
- `displayedIdea` (starts as the API-returned idea)
- `allIdeas` (cache of all ideas from API response OR fetch additional ideas from backend)
- On shuffle button click: pick a random *different* idea from cache, update `displayedIdea`

**Approach options:**
- **Option A (simpler):** Modify backend to return top 5-10 ideas (API returns array, we display first, shuffle cycles through)
  - Pro: Single fetch, simple client logic
  - Con: Changes API contract
- **Option B (current plan):** Backend returns only today's idea, client shuffles by re-fetching with new seed (requires backend change to accept optional seed override)
  - Pro: Clean, stateless
  - Con: More complex, needs backend param
- **Option C (lightweight):** Backend returns today's idea, client can make N additional calls with sequential seeds or offset parameter to get alternatives
  - Pro: Stateless, minimal API change
  - Con: Multiple requests

**Chosen:** **Option A** — modify backend to return an array of `BooksIdea[]` (top ideas for the day, sorted by weight). Client shuffles through them locally. Simplest and most responsive.

**Backend modification:**
- Change response type to `{ ideas: BooksIdea[], selected_index: number }` where `selected_index` is today's pick (first in list would be index 0 if we return sorted by pick weight)
- OR simpler: return all ideas (10-20), client displays the first (date-seeded one), shuffle cycles through others

**Rationale:** Single fetch, instant shuffle, no network latency. All data is available upfront.

**Files:**
- `backend/src/routes/books.rs` (modify to return Vec instead of single item)
- `src/lib/api/schemas/books.ts` (update schema)
- `src/components/BooksInspirationCard.tsx` (implement shuffle state + handler)

**Verify:**
- `npm run build && cargo build` — both compile
- Shuffle cycles through ideas without API call
- Reload page: same idea displays (deterministic per day)
- New day: different idea (manual clock change or test with limited data set)

---

## Summary of Changes

### Backend
1. Create `backend/src/routes/books.rs` with:
   - `GET /api/books/daily-inspiration` (no auth required)
   - Load all books from `data/books/*.json`
   - Date-based weighted random selection
   - Return array of ideas (or top N)
2. Register route in `backend/src/routes/mod.rs`

### Frontend
1. Create `src/components/BooksInspirationCard.tsx` — UI component
2. Create `src/lib/api/endpoints/books.ts` + schema — API client
3. Update `src/lib/api/index.ts` — export new API
4. Update `src/screens/LandingScreen.tsx` — integrate card
5. Add CSS for component layout and styling

### Data
- No changes needed; existing `backend/data/books/` directory and JSON files are used as-is

---

## Dependencies & Assumptions
- **Book JSON files exist** at `backend/data/books/` with shape: `{ book, chapter, idea, application, tags: string[], weight: f64 }`
- **Zod** already in frontend for schema validation
- **@tanstack/react-query** already in frontend for data fetching
- **Axum + Rust stdlib** (serde, rand, chrono) sufficient for backend; no new deps needed
- **Design tokens** (colors, fonts) already defined in `src/styles/tokens.css`

---

## Testing Strategy
1. **Backend:**
   - Unit test: date seed produces consistent results for same day, different for new day
   - Unit test: weighted selection respects weights
   - Manual test: `curl http://localhost:8000/api/books/daily-inspiration` returns valid JSON
2. **Frontend:**
   - Dev server renders component without error
   - Inspect that daily idea does not change on page refresh (same day)
   - Mock API response in MSW if needed for isolated testing
   - Visual inspection of styling against tokens

---

## Notes
- No authentication required; this is a public landing page feature
- Shuffle button does NOT call the API; it's purely client-side (state in component)
- Date seed uses UTC to avoid timezone confusion
- Empty or missing books directory is a 500 error (logged); graceful degradation not implemented (show empty state or fallback text if needed later)
