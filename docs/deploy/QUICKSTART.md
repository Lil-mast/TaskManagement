# Backend Deployment Quick Start

**Time to deploy:** ~15 minutes  
**No code changes needed.** Use existing `render.yaml` and `Dockerfile`.

---

## 1. Get Your Secrets Ready (5 min)

Gather these from your service dashboards:

| Secret | Where to Find | Looks Like |
|--------|---------------|-----------|
| **Database URL** | Supabase Console → Databases → Connection String (Pooler tab) | `postgresql://user:password@pooler.supabase.co:6543/postgres` |
| **Supabase Auth URL** | Supabase Dashboard → Project Settings → API | `https://project-ref.supabase.co` |
| **Anthropic Key** | dashboard.anthropic.com → API Keys | `sk-ant-...` (long) |
| **Embeddings Key** | AgentRouter dashboard or OpenAI API Keys | `sk-ar-...` or `sk-...` |
| **Google Client ID** | Google Cloud Console → OAuth 2.0 Client IDs | `...apps.googleusercontent.com` |
| **Google Secret** | Google Cloud Console → OAuth 2.0 Secrets | 24-char string |
| **Token Encryption Key** | Run: `openssl rand -hex 32` | 64-char hex string |
| **Cron Secret** | Run: `openssl rand -base64 24` | Random base64 string |

---

## 2. Deploy to Render (10 min)

### A. Create the Service from Blueprint

1. Log in to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Select this repository (`TaskManagement`)
4. Branch: `main`
5. Click **Deploy Blueprint**
   - Render reads `render.yaml` automatically
   - Service `growth-copilot` is created in draft state

### B. Add Your Secrets

Once the service appears in your dashboard:

1. Click on **growth-copilot**
2. Go to **Environment** tab
3. Click **Add Secret** for each of the 8 items:
   - `GROWTH_DATABASE_URL`
   - `GROWTH_SUPABASE_URL`
   - `GROWTH_ANTHROPIC_API_KEY`
   - `GROWTH_EMBEDDINGS_API_KEY`
   - `GROWTH_GOOGLE_CLIENT_ID`
   - `GROWTH_GOOGLE_CLIENT_SECRET`
   - `GROWTH_TOKEN_ENC_KEY`
   - `GROWTH_CRON_SECRET`
4. Paste the value from Step 1
5. Click **Save Changes**

Render starts building automatically. ☕ Grab coffee—this takes ~2 minutes.

### C. Verify It's Live

When status changes to **Live** (green):

```bash
curl https://growth-copilot.onrender.com/healthz
```

Should return:
```json
{ "ok": true, "database": "ok", "anthropic": "ok", ... }
```

---

## 3. Connect Frontend (After You Deploy Frontend)

Once your frontend is live on CloudFront:

1. Copy your CloudFront domain: `https://d1234567890.cloudfront.net`
2. In Render dashboard → **growth-copilot** → **Environment**
3. Update `GROWTH_CORS_ORIGINS` to that domain
4. Click **Save Changes**

Done! Backend now talks to frontend. 🎉

---

## Details & Troubleshooting

- **Full guide:** See `render-backend.md`
- **Step-by-step checklist:** See `RENDER_CHECKLIST.md`
- **Environment variables:** See `.env.example`

### Quick Fixes

| Problem | Fix |
|---------|-----|
| Service won't start | Check **Logs** tab for error; most likely: wrong secret or secret typo |
| Health check fails | Check which field is `false` (database/anthropic/auth); re-verify that secret |
| Distroless error | This is a build issue, not a runtime issue; check Logs for compile errors |
| Need to rollback | Render dashboard → **Deploys** tab → click **Redeploy** on previous version |

---

## Service URL

Your backend is now live at:

```
https://growth-copilot.onrender.com
```

Use this URL in your frontend `.env`:
```
VITE_API_BASE_URL=https://growth-copilot.onrender.com
```

---

**🚀 That's it! Your backend is deployed.**

For auto-deployment on push and cron job setup, see `render-backend.md`.

