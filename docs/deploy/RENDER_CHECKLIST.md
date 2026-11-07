# Render Backend Deployment Checklist

Quick reference for deploying Growth Copilot backend to Render. Follow in order.

---

## Pre-Deployment Prep (5 min)

- [ ] Have Supabase database running; copy **Pooler** connection string
- [ ] Have Neon Auth project URL and configure its GitHub provider
- [ ] Have Anthropic API key (dashboard.anthropic.com → API Keys)
- [ ] Have Google OAuth credentials:
  - Client ID
  - Client Secret
  - Redirect URI: `https://growth-copilot.onrender.com/api/integrations/google/callback`
- [ ] Have AgentRouter or OpenAI API key for embeddings

### Generate Required Keys

Run these commands locally and save the output:

```bash
# Generate GROWTH_TOKEN_ENC_KEY (64-char hex)
openssl rand -hex 32
# Example output:
# a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1

# Generate GROWTH_CRON_SECRET (random string)
openssl rand -base64 24
# Example output:
# 7x8y9z0aB+cDefGhIjklMnopqrstuVW==
```

---

## Render Setup (10 min)

### Step 1: Create Blueprint Service

1. Go to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Select this GitHub repository (TaskManagement)
4. Confirm branch is `main`
5. Click **Deploy Blueprint**
   - Render reads `backend/render.yaml`
   - Service name auto-set to `growth-copilot`
   - Runtime auto-set to Docker

### Step 2: Wait for Service Creation

Watch the dashboard—you should see **growth-copilot** service appear in draft state. Click on it to open the service details.

### Step 3: Set 8 Environment Secrets

In the service details, go to **Environment** tab and add these 8 secrets:

```
Key: GROWTH_DATABASE_URL
Value: postgresql://user:password@...pooler.supabase.co:6543/postgres
(copy from Supabase Console → Databases → Connection String)

Key: GROWTH_NEON_AUTH_BASE_URL
Value: https://your-project-ref.supabase.co
(from Neon Console → Auth)

Key: GROWTH_ANTHROPIC_API_KEY
Value: sk-ant-...
(from Anthropic Dashboard → API Keys)

Key: GROWTH_EMBEDDINGS_API_KEY
Value: sk-ar-... or sk-...
(from AgentRouter or OpenAI)

Key: GROWTH_GOOGLE_CLIENT_ID
Value: ...apps.googleusercontent.com
(from Google Cloud Console → OAuth 2.0 Client IDs)

Key: GROWTH_GOOGLE_CLIENT_SECRET
Value: ...
(from Google Cloud Console → OAuth 2.0 Client Secrets)

Key: GROWTH_TOKEN_ENC_KEY
Value: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
(output from: openssl rand -hex 32)

Key: GROWTH_CRON_SECRET
Value: 7x8y9z0aB+cDefGhIjklMnopqrstuVW==
(output from: openssl rand -base64 24)
```

After pasting each, click **Add Secret** → repeat for all 8.

### Step 4: Save & Deploy

1. Click **Save Changes**
2. Render automatically starts building the Docker image
3. Watch **Logs** tab for build progress

---

## Verify Deployment (5 min)

### Wait for "Live" State

Service status should change from **Building** → **Live** (typically 2–3 minutes).

### Health Check

Once **Live**, open a terminal and run:

```bash
curl https://growth-copilot.onrender.com/healthz
```

**Expected response:**
```json
{
  "ok": true,
  "version": "0.1.0",
  "database": "ok",
  "anthropic": "ok",
  "auth_mode": "supabase",
  "llm_tokens_available": true
}
```

If any field is `false` or missing:
1. Check **Logs** tab for error messages
2. Verify the failing secret is correct (e.g., `database: false` → check `GROWTH_DATABASE_URL`)
3. Re-paste the secret and save

---

## Post-Deployment (After Frontend is Live)

Once your frontend is deployed on AWS CloudFront:

1. Note your CloudFront domain: `https://d1234567890.cloudfront.net`
2. In Render dashboard, open **growth-copilot** → **Environment**
3. Find `GROWTH_CORS_ORIGINS` and update its value:
   ```
   https://d1234567890.cloudfront.net
   ```
4. Click **Save Changes** → Render redeploys

---

## Troubleshooting

### Build Fails
- Check **Logs** for error messages (usually missing dependencies or syntax errors)
- Verify `backend/Dockerfile` and `backend/Cargo.toml` are valid
- If distroless error: ensure the Rust binary is linked against libc (run `ldd ./target/release/growth-copilot` locally to verify)

### Service Starts Then Crashes
- Check **Logs** for panic or error messages
- Most common: missing secret or wrong secret value
- Verify each secret matches the table above exactly (no extra spaces, correct format)

### Health Check Returns Error
- `database: false` → `GROWTH_DATABASE_URL` is wrong (test with `psql` locally)
- `anthropic: false` → `GROWTH_ANTHROPIC_API_KEY` is invalid (test on Anthropic dashboard)
- `auth_mode: unconfigured` → set `GROWTH_NEON_AUTH_BASE_URL` on the backend

### Manual Restart
If the service is stuck:
1. **growth-copilot** → **Settings** → **Restart Service**
2. Render will restart the container

---

## Auto-Deploy Behavior

Every push to `main` will trigger:
1. Render pulls latest code
2. Rebuilds Docker image
3. Starts new container (with existing secrets)
4. Health check passes → old container stops

To disable auto-deploy, edit `render.yaml`:
- Change `autoDeploy: true` to `autoDeploy: false`
- Commit and push
- Future deploys must be manual via dashboard

---

## Success Criteria

- [ ] Service is **Live** (green status in dashboard)
- [ ] `curl /healthz` returns `ok: true`
- [ ] All 8 secrets appear in **Environment** tab
- [ ] Logs show no errors
- [ ] Frontend can reach backend at `https://growth-copilot.onrender.com`

**✅ Backend is deployed!**

---

## Service URL Reference

After deployment, your backend is live at:

```
https://growth-copilot.onrender.com
```

Use this URL in:
1. Frontend `.env`: `VITE_API_BASE_URL=https://growth-copilot.onrender.com`
2. Frontend `render.yaml` after frontend is deployed: `GROWTH_CORS_ORIGINS=https://growth-copilot.onrender.com`

