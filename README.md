# MrT — Daily Intelligence

An editorial daily workspace over the Rust API in [`backend/`](backend/).
The SPA lives at the repository root: React 18 + TypeScript + Vite, typed API
client, TanStack Query, Zod at the network boundary.

## Run it

```bash
# terminal 1 — API
cd backend
cp .env.example .env        # fill at least the DB + Anthropic keys
cargo run                   # http://localhost:8000

# terminal 2 — SPA
cp .env.example .env.local
pnpm install
pnpm dev                    # http://localhost:5173
```

Local auth defaults to the backend's dev token (`Authorization: Bearer dev`),
which only works when the backend has no identity provider configured. To use
Firebase, set `VITE_AUTH_MODE=firebase` and the `VITE_FIREBASE_*` values.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check + production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest contract + client tests |
| `pnpm preview` | Preview the production build |

## Shape

```
src/
├── App.tsx                 # Phase 1 smoke page (temporary)
├── lib/
│   ├── api/                # apiFetch, errors, Zod schemas, endpoint modules
│   ├── auth/               # Firebase token provider
│   └── query/              # TanStack Query client + cache keys
├── styles/                 # locked tokens, base, smoke page
└── tests/                  # MSW client tests, fixtures, wire contracts
```

The verified backend contract, drift corrections, and deferred gaps are in
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). The visual reference is
[`asset/screen.png`](asset/screen.png) with the build specification in
[`FRONTEND.md`](FRONTEND.md).

## Product rule

MrT proposes; the human decides. Capture and triage return proposals only.
Nothing reaches the task pool without an explicit accept.
