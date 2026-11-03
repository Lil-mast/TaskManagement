# LeetCode Workspace — Remaining Build Tasks

> **Progress: 4 / 10 tasks complete.**
> Tasks 1–4 are done and committed. Pick up from Task 5.

---

## ✅ Completed

| # | Task | Key files |
|---|------|-----------|
| 1 | DB migration — `workspace_submissions` table | `backend/migrations/0011_workspace_submissions.sql` |
| 2 | Backend sandbox service — Docker execution | `backend/src/services/sandbox.rs`, `Cargo.toml` |
| 3 | Backend workspace routes (`/run` + `/debrief`) | `backend/src/routes/workspace.rs`, `lib.rs`, `config.rs` |
| 4 | Frontend API client + schemas | `src/lib/api/schemas/workspace.ts`, `endpoints/workspace.ts`, `query/keys.ts` |

---

## 🔲 Task 5 — CodeEditor component (CodeMirror 6)

**Status:** In progress — `src/components/CodeEditor.tsx` was started but not finished.

**What to build:**
- `src/components/CodeEditor.tsx` — controlled CodeMirror 6 editor
- Language switcher: 5 tab buttons (`PY · RS · JS · C · C++`) using `workspaceLanguages` from `schemas/workspace.ts`
- Custom theme matching app CSS tokens (`--canvas`, `--ink`, `--font-mono`, etc.) — no third-party theme
- Language extensions: `python()`, `rust()`, `javascript()`, `cpp()` (serves both C and C++)
- Keymaps: `defaultKeymap`, `historyKeymap`, `foldKeymap`, `indentWithTab`, `closeBracketsKeymap`
- Features: line numbers, fold gutter, bracket matching, active line highlight, draw selection
- Props: `{ value, onChange, language, onLanguageChange, disabled?, label? }`
- External value sync: apply `.dispatch({ changes })` without recreating the view
- Language change: destroy + recreate view (full grammar re-parse)
- `readOnly` synced via `EditorState.readOnly.reconfigure(disabled)`

**Packages already installed** (in `package.json`):
```
@codemirror/state
@codemirror/view
@codemirror/commands
@codemirror/language
@codemirror/lang-python
@codemirror/lang-rust
@codemirror/lang-javascript
@codemirror/lang-cpp
@codemirror/theme-one-dark   ← available but prefer custom token-based theme
```

**Verify:** `pnpm typecheck` exits 0. Component renders without crashing.

---

## 🔲 Task 6 — MrtSidebar component

**What to build:**
- `src/components/MrtSidebar.tsx`
- Props: `{ pattern?: string; stats?: PatternStat; sessionTip: BookIdeaItem; mrtLine: string; tone: 'hype' | 'mentor' }`
- Always-on sidebar showing:
  - MrT one-liner (tone-aware — hype vs mentor, see static table below)
  - Pragmatic Programmer tip in compact `BooksInspirationCard` (already exists)
  - Pattern stat mini-chart: attempts count + no-help rate as a CSS-only horizontal bar (no chart lib)
- Static MrT one-liners per tone:
  - `hype`: `"I pity the fool who gives up on this pattern! Keep grinding, sucker!"`
  - `mentor`: `"Spaced repetition compounds. Every rep builds the recall that matters under pressure."`
- Data sources:
  - `sessionTip`: from `booksApi.getDailyInspiration` (reuse existing query in BriefScreen) or random pick from `pragmatic_programmer.json`
  - `stats`: from `leetCodeApi.stats()` — pick the row matching the active pattern name
- Style: matches `.panel` conventions from `workspace.css` and the brief sidebar

---

## 🔲 Task 7 — SolveDebrief component

**What to build:**
- `src/components/SolveDebrief.tsx`
- Props:
  ```ts
  {
    result: RunResult;
    debrief?: DebriefResult;
    isLoadingDebrief: boolean;
    patterns: LeetCodePattern[];
    onLog: (input: LogAttemptInput) => void;
    onDismiss: () => void;
    isLoggingAttempt: boolean;
  }
  ```
- Always shows: stdout/stderr in `<pre>` (styled like `.drill__code`), exit code badge, time taken
- After debrief arrives:
  - MrT message block — crimson background for `hype` tone, ink background for `mentor`
  - Matched Pragmatic tip in compact `BooksInspirationCard`
  - Stat delta line: `"−4 min vs your avg · no help ✓"` (or equivalent)
- `"Log attempt"` section — inline mini-form:
  - Pattern selector (`<select>` from `patterns` prop)
  - Difficulty selector (`easy | medium | hard`)
  - Needed help checkbox
  - Notes textarea (optional)
  - Submit → calls `onLog`, then fires `workspaceApi.debrief`
- Rendered as a `<section>` below the editor (not a modal)
- Dismissable via `onDismiss`

---

## 🔲 Task 8 — WorkspaceScreen + route wiring

**What to build:**

### `src/screens/WorkspaceScreen.tsx`
- Two-column layout: editor + debrief (left, wider), `MrtSidebar` (right, narrower)
- Header: problem title `<input>` + LeetCode URL `<input>`
- Run button: calls `workspaceApi.run()` via `useMutation`, spinner on the editor rail during execution
- After run: renders `SolveDebrief` below editor
- After `onLog` in `SolveDebrief`: fires `workspaceApi.debrief()` mutation, passes result back to `SolveDebrief`
- MrtSidebar: fetches `leetCodeApi.stats()` on mount, `booksApi.getDailyInspiration()` for the tip
- Language state lives in `WorkspaceScreen` and is passed to `CodeEditor`
- Code state: starts from `defaultSnippets[language]`, resets to snippet when language changes

### `src/App.tsx`
```tsx
<Route path="/workspace" element={<WorkspaceScreen />} />
```
— inside the `Protected > Onboarded > AppShell` outlet (same level as `/brief`, `/tasks`, `/trash`)

### `src/components/AppShell.tsx`
- Add `WorkspaceIcon` to `src/components/icons.tsx`
- Add `<NavLink to="/workspace">` in the rail nav (between Tasks and Capture)
- Add a matching entry in the mobile bottom nav
- Update `pageTitle()` helper: `pathname.startsWith('/workspace') → 'Workspace'`

**Verify:** Navigating to `/workspace` renders without crashing. `pnpm typecheck` exits 0.

---

## 🔲 Task 9 — CSS: workspace screen styles

**What to build:**
- `src/styles/workspace-screen.css` — all workspace-specific styles
- Import it in `src/styles/app.css`

**Key class names to implement:**

| Class | Purpose |
|-------|---------|
| `.ws-layout` | Two-column grid: `minmax(0, 1fr)` editor + `minmax(18rem, 0.4fr)` sidebar |
| `.ws-header` | Problem title + URL inputs, horizontal layout |
| `.ws-editor-panel` | Wraps `CodeEditor`; has `border-top: 1px solid var(--ink)` |
| `.ws-run-btn` | Primary run button, full width, ink background |
| `.ws-run-btn--running` | Muted state while sandbox is executing |
| `.ws-output` | Output area below editor (hosts `SolveDebrief`) |
| `.ws-debrief` | Debrief section wrapper |
| `.ws-debrief--hype` | Crimson background for hype tone MrT message |
| `.ws-debrief--mentor` | Ink background for mentor tone MrT message |
| `.ws-mrt-sidebar` | Sidebar column container |
| `.ws-mrt-line` | MrT one-liner — large display font, crimson accent |
| `.mrt-stat-bar` | Pattern stat bar (attempts + no-help rate) |
| `.mrt-stat-bar__fill` | CSS width driven by inline style (no JS chart lib) |

**Rules:**
- All colors from existing CSS tokens — zero hardcoded hex values
- Responsive: single column below 900px; sidebar collapses below editor on mobile
- Typography: mono-labels, panel borders, and spacing consistent with `workspace.css` and `drill.css`

**Verify:** Workspace looks consistent with rest of app at 1440 / 1024 / 768 / 375px widths. No overflow.

---

## 🔲 Task 10 — Docker setup + env configuration

**What to do:**

### Pull language images
```bash
docker pull python:3.12-slim
docker pull rust:1.78-slim
docker pull node:20-slim
docker pull gcc:13
```

### `.env.example` additions (in `backend/.env.example`)
```
# --- Workspace (LeetCode code execution sandbox) ---
# Requires Docker. Set to true to enable /api/workspace/run.
GROWTH_WORKSPACE_ENABLED=false
# Hard timeout per sandbox execution (seconds). Default 10.
GROWTH_SANDBOX_TIMEOUT_SECS=10
```

### `backend/.env` (local dev)
Add same two vars with `GROWTH_WORKSPACE_ENABLED=true`.

### `backend/Dockerfile`
The backend container needs access to Docker to spawn sandbox containers.
Two options:
- **Bind-mount host socket** (simpler, works on Linux/Mac):
  ```
  docker run -v /var/run/docker.sock:/var/run/docker.sock ...
  ```
  Add a comment/note to `Dockerfile` and `backend/deploy/README.md`.
- **Add `docker` CLI** to the image:
  ```dockerfile
  RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*
  ```
  Then mount the socket at runtime.

### `backend/deploy/README.md`
Document the socket-mount approach and pre-pull requirement.

### `backend/README.md`
Add a "Workspace (code execution)" section explaining:
1. Requires Docker on the host
2. How to set `GROWTH_WORKSPACE_ENABLED=true`
3. Which images to pull
4. Security model (network-none, memory cap, read-only FS)

**Verify:** From inside the backend container, `docker run --rm python:3.12-slim python -c "print('ok')"` returns `ok`.

---

## Architecture reminder

```
WorkspaceScreen
 ├── CodeEditor (CodeMirror 6)          ← Task 5
 ├── MrtSidebar (always-on rail)        ← Task 6
 └── SolveDebrief (post-run section)    ← Task 7
      ├── stdout/stderr output
      ├── MrT debrief message (tone-aware)
      ├── BooksInspirationCard (matched Pragmatic tip)
      └── Log attempt mini-form → leetCodeApi.logAttempt → SM-2
```

**API flow:**
1. User writes code → hits **Run** → `POST /api/workspace/run` → Docker sandbox → `RunResult`
2. User fills log form → `leetCodeApi.logAttempt()` → SM-2 reschedule → review task in ledger
3. After logging → `POST /api/workspace/debrief` → Claude (MrT prompt) → `DebriefResult`

---

*Generated: November 2026 · TaskManagement / MrT project*
