# Deploy runbook — Growth Copilot backend

## 0. Secrets leave `.env` only via the platform secret manager

Nothing secret ever enters git or the image. Fly:

```bash
fly secrets set \
  GROWTH_DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres" \
  GROWTH_TOKEN_ENC_KEY="<hex-32>" \
  GROWTH_ANTHROPIC_API_KEY="<key>" \
  GROWTH_EMBEDDINGS_API_KEY="<key>" \
  GROWTH_GOOGLE_CLIENT_ID="<...>" \
  GROWTH_GOOGLE_CLIENT_SECRET="<...>" \
  GROWTH_GOOGLE_REDIRECT_URL="https://<app>.fly.dev/api/integrations/google/callback" \
  GROWTH_CRON_SECRET="<random>" \
  GROWTH_SUPABASE_URL="https://<ref>.supabase.co" \
  GROWTH_CORS_ORIGINS="https://<your-spa.pages.dev>"
```

`apply_migration` runs with the same secret set (one-off `fly ssh console` or a
local `dotenv`-free invocation).

## 1. Build & ship

```bash
docker build -t registry.fly.io/growth-copilot:latest .
docker push registry.fly.io/growth-copilot:latest   # fly auth docker first
fly deploy --image registry.fly.io/growth-copilot:latest
```

`/healthz` is the monitoring check (see `fly.toml`) — it reports which
subsystems are wired (health snapshot includes database + LLM status).

## 2. Cron on real host — system crontab

Phases 1/5 routes are invoked externally; schedule on the host itself:

```cron
# crontab -e  (on the host that reaches the app, or a GitHub Actions schedule)
0 6 * * *   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<app>.fly.dev/cron/briefing  >> /var/log/growth-cron.log 2>&1
0 7 * * 6   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<app>.fly.dev/cron/weekly   >> /var/log/growth-cron.log 2>&1
30 7 * * 6  curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" https://<app>.fly.dev/cron/reweight >> /var/log/growth-cron.log 2>&1
```

Every cron route is idempotent by design — briefing is compose-or-reuse,
weekly is an upsert — so double-fires cost nothing.

## 3. CORS — locked to the production SPA origin

`GROWTH_CORS_ORIGINS=https://<your-spa.pages.dev>` — the allow-list parser
accepts one origin per comma entry or a TOML-style list. Localhost dev
configuration stays local.

## 4. Migrations on deploy

Run `migrations/0007_consolidated_baseline.sql` once per environment (it is
idempotent; `apply_migration` prints OK per file):

```bash
./apply_migration migrations/0007_consolidated_baseline.sql
```

`0008_drop_spa_legacy.sql` is destructive — apply deliberately, only after the
review in `docs/phases/PHASE_6.md`.

## 5. Observability

`tracing_subscriber` writes structured, env-filterable logs (default `info`).
`anthropic.chat`, `rag.ingest`, and `rag.retrieve` are instrumented spans —
one line per stage per request, so a brief's lineage is directly readable.
Set `RUST_LOG=growth_copilot=debug,info` to widen.
