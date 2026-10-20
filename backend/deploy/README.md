# Deploy runbook — Growth Copilot backend on **Render** (Docker runtime)

> Fly dropped per decision 2026-10-20. Render hosts the long-running Axum
> service; Supabase stays the data plane (Postgres + RLS).

## 0. Secrets — leave `.env` behind

Secrets live in Render's environment, set via dashboard → service →
**Environment** (or the Blueprint prompts marked `sync: false`):

| Key | Where to get it |
|---|---|
| `GROWTH_DATABASE_URL` | Supabase → Project settings → Database → Connection string (pooler `:5432` URI) |
| `GROWTH_FIREBASE_PROJECT_ID` | Firebase console → Project settings (the SPA's project) |
| `GROWTH_ANTHROPIC_API_KEY` | Anthropic console (already in local `.env`) |
| `GROWTH_EMBEDDINGS_API_KEY` | OpenAI (unblocks RAG) |
| `GROWTH_GOOGLE_CLIENT_ID` / `..._SECRET` | Google Cloud → Credentials → OAuth web client |
| `GROWTH_GOOGLE_REDIRECT_URL` | `https://<service>.onrender.com/api/integrations/google/callback` — set in BOTH Render and the Google client's authorized redirect URIs |
| `GROWTH_TOKEN_ENC_KEY` | any 64-char hex string (`openssl rand -hex 32`) |
| `GROWTH_CRON_SECRET` | any random string — cron runner must send it as `x-cron-secret` |
| `GROWTH_CORS_ORIGINS` | your production SPA origin (Cloudflare Pages URL) |

Nothing secret ever enters git or the Docker image; runtime env only.

## 1. Deploy

Option A — **Blueprint** (uses `render.yaml`):
Dashboard → New → Blueprint → this repo. Render reads `backend/render.yaml`,
builds the Dockerfile, and prompts once for each `sync: false` secret.

Option B — **manual**: New → Web Service → Docker runtime →
root dir `backend` → Dockerfile path `./backend/Dockerfile`.

- Health check: `/healthz` (Render marks the service live once green).
- `autoDeploy: true` — pushes to the tracked branch ship automatically.
- Region: pick the Render region nearest your Supabase project (latency).

Local verification before shipping:

```bash
docker build -t growth-copilot .
docker run --rm -p 8000:8000 --env-file .env growth-copilot
curl -s localhost:8000/healthz
```

## 2. Cron on Render

The three jobs are external HTTP calls — schedule them with a Render **Cron
Job** service (or GitHub Actions, whichever you prefer):

Render cron (shell command, curl image):

```yaml
# in the Render dashboard: New → Cron Job
# Runtime: Bash image w/ curl (e.g. curlimages/curl)
0 6 * * *   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<service>.onrender.com/cron/briefing
0 7 * * 6   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<service>.onrender.com/cron/weekly
30 7 * * 6  curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<service>.onrender.com/cron/reweight
```

The secret lives in the Cron Job's env (`GROWTH_CRON_SECRET`); the tz aware
schedule drops straight into its Cron field.

GitHub Actions alternative (free, no Render cron):

```yaml
name: cron
on:
  schedule:
    - cron: "0 6 * * *"      # morning brief (UTC)
    - cron: "0 7 * * 6"      # weekly review, Saturday
    - cron: "30 7 * * 6"     # reweight right after
jobs:
  brief:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf -X POST -H "x-cron-secret: ${{ secrets.GROWTH_CRON }}" https://<service>.onrender.com/cron/briefing
```

Every cron route is idempotent by design (compose-or-reuse / upsert), so
double-fires cost nothing.

## 3. Migrations on deploy

Already applied to the live Supabase (0002–0008 on 2026-10-19/20). For a NEW
environment, run once:

```bash
cargo run --bin apply_migration -- migrations/0007_consolidated_baseline.sql
```

## 4. Observability

Structured logs to stdout (Render Log Stream). `anthropic.chat`,
`rag.ingest`, `rag.retrieve` are instrumented spans; widen via
`RUST_LOG=growth_copilot=debug,info` (Environment → add variable).

## 5. Google Console checklist

In the OAuth web client (the one backing calendar + gmail consent):
1. Authorized redirect URI → `https://<service>.onrender.com/api/integrations/google/callback`
2. Publish the app (or keep test users limited by design)
