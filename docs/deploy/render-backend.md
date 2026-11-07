# Render Backend Deployment Guide

**Service:** Growth Copilot backend (Rust Axum + Distroless Docker)  
**Platform:** [Render.com](https://render.com)  
**Region:** Oregon  
**Health Check:** `GET /healthz` (monitoring + readiness probe)  
**Auto-Deploy:** Enabled (pushes to `main` branch auto-trigger redeploy)

---

## Render Blueprint Structure

The backend uses Render's **Blueprint** feature (`render.yaml`) for infrastructure-as-code deployment. The Blueprint is automatically read when you connect this repository to Render.

### Key Configuration

```yaml
Type: Web Service (long-running HTTP server)
Runtime: Docker (multi-stage Dockerfile → distroless)
Dockerfile Path: ./backend/Dockerfile
Docker Context: ./backend
Plan: Starter (single instance, suitable for MVP/testing)
Region: Oregon
Health Check: /healthz
Auto-Deploy: true (connected branch auto-deploys on push)
Environment Variables: 8 secrets (sync: false) + 3 public values
```

---

## Environment Secrets (8 Required)

All secrets must be set in the Render dashboard **before the first deploy** or on the initial Blueprint run. Render will prompt for values marked with `sync: false`.

### Secret Reference Table

| Key | Source | Format | Example | Purpose |
|-----|--------|--------|---------|---------|
| **GROWTH_DATABASE_URL** | Supabase Console → Databases → Connection String (Pooler) | `postgresql://user:password@pooler.supabase.co:6543/postgres` | Supabase Postgres pooler URI | Database connection |
| **GROWTH_SUPABASE_URL** | Supabase Dashboard → Project Settings → API | URL (e.g., `https://project-ref.supabase.co`) | Your Auth project URL | JWT verification, auth backend |
| **GROWTH_ANTHROPIC_API_KEY** | Anthropic Dashboard → API Keys | `sk-ant-...` (67+ chars) | Your Anthropic API key | LLM inference (Claude) |
| **GROWTH_EMBEDDINGS_API_KEY** | AgentRouter Dashboard → API Keys OR OpenAI API Keys | `sk-ar-...` (AgentRouter) or `sk-...` (OpenAI) | AgentRouter or OpenAI key | Text embeddings for RAG |
| **GROWTH_GOOGLE_CLIENT_ID** | Google Cloud Console → OAuth 2.0 Client IDs | Long alphanumeric string + `.apps.googleusercontent.com` | Your Google OAuth client ID | Calendar & Gmail OAuth |
| **GROWTH_GOOGLE_CLIENT_SECRET** | Google Cloud Console → OAuth 2.0 Client Secrets | 24-char string | Your Google OAuth secret | Calendar & Gmail OAuth |
| **GROWTH_TOKEN_ENC_KEY** | Generated locally with openssl | 64-char hex (32-byte key) | See below | AES-GCM encryption for stored OAuth tokens |
| **GROWTH_CRON_SECRET** | Generated locally (random string) | Any unpredictable string (20+ chars) | See below | Guard for `/cron/*` endpoints |

### Generating Required Keys

#### GROWTH_TOKEN_ENC_KEY (64-char hex)
```bash
openssl rand -hex 32
# Output: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```
Copy the output exactly and paste into Render dashboard.

#### GROWTH_CRON_SECRET
Generate any random string (20+ characters). Options:
```bash
# Using openssl
openssl rand -base64 24

# Or using Python
python3 -c "import secrets; print(secrets.token_urlsafe(24))"

# Or using bash (simple)
tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24
```

### Public Values (Already in render.yaml)

| Key | Current Value | Usage |
|-----|---------------|-------|
| `GROWTH_RATE_LIMIT_RPM` | `20` | Requests per minute (global LLM rate limit) |
| `GROWTH_RATE_LIMIT_CONCURRENCY` | `3` | Max concurrent LLM calls |
| `GROWTH_GOOGLE_REDIRECT_URL` | `https://growth-copilot.onrender.com/api/integrations/google/callback` | OAuth callback URL (set for Render domain) |
| `GROWTH_CORS_ORIGINS` | `https://<your-spa.pages.dev>` | **Must be updated** to your frontend CloudFront domain after frontend deploys |

---

## Deployment Steps

### 1. Prerequisites
- [ ] Supabase project created with database running
- [ ] Supabase Auth GitHub provider configured
- [ ] Anthropic API key generated (no free tier; requires payment method)
- [ ] Google Cloud OAuth 2.0 credentials created:
  - Authorized redirect URI: `https://growth-copilot.onrender.com/api/integrations/google/callback`
  - Save Client ID and Client Secret
- [ ] AgentRouter or OpenAI API key for embeddings
- [ ] GitHub account connected to Render (OAuth)
- [ ] This repository pushed to GitHub on the `main` branch

### 2. Create Render Service from Blueprint

**Option A: Via Render Dashboard (Recommended for first-time setup)**

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Select this GitHub repository
4. Confirm the branch is `main`
5. Render will read `render.yaml` and auto-populate:
   - Service name: `growth-copilot`
   - Runtime: Docker
   - Region: Oregon
6. Click **Deploy Blueprint**
7. Render will create the service and immediately prompt for environment secrets

**Option B: Via Render CLI**

```bash
render deploy --repo <repo-name>
```

### 3. Set Environment Secrets in Render Dashboard

After Blueprint creation, the service will appear in your Render dashboard.

1. Open **growth-copilot** service
2. Navigate to **Environment** tab
3. For each secret marked `sync: false` in the table above, click **Add Secret** and paste:
   - `GROWTH_DATABASE_URL` → Supabase pooler connection string
   - `GROWTH_SUPABASE_URL` → Supabase Auth project URL
   - `GROWTH_ANTHROPIC_API_KEY` → Anthropic key
   - `GROWTH_EMBEDDINGS_API_KEY` → AgentRouter or OpenAI key
   - `GROWTH_GOOGLE_CLIENT_ID` → Google OAuth client ID
   - `GROWTH_GOOGLE_CLIENT_SECRET` → Google OAuth client secret
   - `GROWTH_TOKEN_ENC_KEY` → Generated hex key (from `openssl rand -hex 32`)
   - `GROWTH_CRON_SECRET` → Generated random string
4. Click **Save Changes**

Render will automatically redeploy the service with the new secrets.

### 4. Verify Deployment

**Wait for the service to be in "Live" state** (check service dashboard for deployment progress).

Once live, verify health:

```bash
# Replace <service-url> with your Render service URL (found in dashboard)
curl https://growth-copilot.onrender.com/healthz

# Expected response:
# {
#   "ok": true,
#   "version": "0.1.0",
#   "database": "ok",
#   "anthropic": "ok",
#   "auth_mode": "supabase",
#   "llm_tokens_available": true
# }
```

### 5. Update Frontend CORS Origin (After Frontend Deployment)

Once your frontend is deployed on AWS CloudFront:

1. Note your CloudFront domain (e.g., `https://d1234567890.cloudfront.net`)
2. In Render dashboard → **growth-copilot** → **Environment**
3. Update `GROWTH_CORS_ORIGINS` to your CloudFront domain:
   ```
   GROWTH_CORS_ORIGINS=https://d1234567890.cloudfront.net
   ```
4. Click **Save Changes** → Render will redeploy

---

## Docker Build & Runtime

### Multi-Stage Dockerfile Breakdown

**Stage 1: Builder** (`rust:${RUST_VERSION}-slim`)
- Compiles Rust code in release mode
- Uses cargo dependency caching (dummy-main trick for layer reuse)
- ~2GB during build (only intermediate)

**Stage 2: Runtime** (`distroless/cc-debian12:nonroot`)
- Minimal distroless image: no shell, no package manager
- Only contains libc (required by Rust) and the compiled binary
- Final image size: ~50MB
- Runs as non-root user (security best practice)
- No shell = cannot exec into container (immutable)

### Local Build & Test

```bash
# Build locally
cd backend
docker build -t growth-copilot:latest .

# Run with env file
docker run --rm -p 8000:8000 --env-file .env growth-copilot:latest

# Test health check from another terminal
curl http://localhost:8000/healthz
```

### Render Runtime

Render automatically:
1. Clones this repository
2. Builds the Docker image using the Dockerfile in `render.yaml` path
3. Runs the image with environment secrets injected at startup
4. Routes HTTP traffic on port 8000
5. Monitors `/healthz` endpoint for health checks
6. Auto-restarts on crash

---

## Monitoring & Logs

### Access Logs in Render Dashboard

1. Open **growth-copilot** service
2. Click **Logs** tab
3. Real-time service output (stdout/stderr) appears here
4. Use **Search** to filter by keyword (errors, requests, etc.)

### Common Issues & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Missing Secret** | `error: GROWTH_ANTHROPIC_API_KEY not found` in logs | Check Render **Environment** tab, paste secret exactly (no spaces), save & redeploy |
| **Database Connection Failed** | `connection refused` or `timeout` in logs | Verify `GROWTH_DATABASE_URL` is the pooler (not the direct URL); test locally with `psql` |
| **Supabase Auth Failed** | `invalid_jwt` or `failed to verify token` | Verify `GROWTH_SUPABASE_URL` matches frontend's project URL; check JWT signing configuration |
| **Distroless Image Error** | `exec: not found` | Render is using distroless correctly; ensure binary linked against libc (check `ldd` output locally) |
| **Out of Memory** | Service crashes, restart loop | Scale up to **Standard** plan (more RAM); optimize Anthropic requests |

---

## Auto-Deployment & CI/CD

### How It Works

- `autoDeploy: true` in `render.yaml` means: any push to `main` automatically triggers a new deploy
- Render watches this GitHub repository for commits
- On new commit to `main`:
  1. Render pulls the latest code
  2. Rebuilds the Docker image (using render.yaml config)
  3. Injects environment secrets at startup
  4. Runs health check (`GET /healthz`)
  5. Routes traffic to the new container

### Disable Auto-Deploy

If you want manual deploys only:

1. Edit `render.yaml`: change `autoDeploy: true` to `autoDeploy: false`
2. Commit and push
3. Render will still track the repo but won't auto-deploy
4. Manual deploy: **growth-copilot** → **Manual Deploy** button in dashboard

---

## Cron Jobs (Future: Phase 1)

The backend includes two cron jobs guarded by `GROWTH_CRON_SECRET`:

- `POST /cron/briefing` — Morning briefing (7 AM)
- `POST /cron/weekly-review` — Weekly review (Sundays 6 PM)

To enable cron jobs on Render, use a third-party cron service:

**Option A: GitHub Actions (Free)**
```yaml
# .github/workflows/cron-briefing.yml
on:
  schedule:
    - cron: '0 7 * * *'  # Every day at 7 AM UTC
jobs:
  briefing:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST \
            https://growth-copilot.onrender.com/cron/briefing \
            -H "Authorization: Bearer ${{ secrets.GROWTH_CRON_SECRET }}"
```

**Option B: External Service (e.g., EasyCron, AWS EventBridge)**
- Set webhook: `https://growth-copilot.onrender.com/cron/briefing`
- Header: `Authorization: Bearer <GROWTH_CRON_SECRET>`
- Schedule as desired

---

## Troubleshooting Checklist

- [ ] Service is in **Live** state (not deploying/failed)
- [ ] `curl /healthz` returns `{ok: true}`
- [ ] All 8 secrets are set in **Environment** tab (no typos)
- [ ] `GROWTH_CORS_ORIGINS` includes your frontend domain
- [ ] Supabase Auth URL matches frontend's config
- [ ] Database URL is the **pooler** endpoint (not direct URL)
- [ ] Anthropic API key is valid (test in Anthropic dashboard)
- [ ] Render logs show no `panic` or `error` messages

---

## Rollback & Recovery

### Rollback to Previous Deploy

If a deploy introduces issues:

1. In Render dashboard, open **growth-copilot** → **Deploys** tab
2. Find the previous successful deploy
3. Click **Redeploy** next to it
4. Render will roll back to that Docker image

### Manual Restart

If the service is stuck:

1. **growth-copilot** → **Settings** → **Restart Service** button
2. Render will gracefully restart the container

### Delete Service (if needed)

1. **growth-copilot** → **Settings** → **Delete Service**
2. This deletes the Render service only; GitHub repo remains untouched

---

## Next Steps

1. ✅ Ensure all 8 secrets are set in Render **Environment** tab
2. ✅ Verify health check: `curl https://growth-copilot.onrender.com/healthz`
3. ✅ Deploy frontend to AWS CloudFront
4. ✅ Update `GROWTH_CORS_ORIGINS` with CloudFront domain
5. ✅ Run end-to-end smoke test (frontend → backend → database)

---

## References

- **Render Docs:** https://render.com/docs
- **Render Blueprint:** https://render.com/docs/infrastructure-as-code
- **Distroless Images:** https://github.com/GoogleContainerTools/distroless
- **Axum (Rust framework):** https://github.com/tokio-rs/axum
- **Supabase Connection Pooling:** https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler

