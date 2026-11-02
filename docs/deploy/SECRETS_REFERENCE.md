# Environment Secrets Reference Card

Print this or keep it open while deploying. All 8 secrets needed for Render deployment.

---

## 🔑 The 8 Secrets You Need

### 1. GROWTH_DATABASE_URL
```
Where: Supabase Console → Databases → Connection String
Tab: "Pooler" (NOT "Direct")
Format: postgresql://user:password@pooler.supabase.co:6543/postgres
Example: postgresql://postgres:abc123@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

### 2. GROWTH_FIREBASE_PROJECT_ID
```
Where: Firebase Console → Project Settings → General Tab
Format: Just the Project ID string (no special characters)
Example: growth-copilot-abc123
```

### 3. GROWTH_ANTHROPIC_API_KEY
```
Where: https://dashboard.anthropic.com → API Keys
Format: Starts with "sk-ant-", very long
Example: sk-ant-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6...
```

### 4. GROWTH_EMBEDDINGS_API_KEY
```
Where (Option A): AgentRouter Dashboard → API Keys
Format: sk-ar-...
Example: sk-ar-example123456789

Where (Option B): OpenAI API Keys (https://platform.openai.com/api-keys)
Format: sk-...
Example: sk-proj-...
```

### 5. GROWTH_GOOGLE_CLIENT_ID
```
Where: Google Cloud Console → OAuth 2.0 Client IDs
Format: Long alphanumeric string ending in .apps.googleusercontent.com
Example: 123456789012-abcdefg1234567890abcdefg123456.apps.googleusercontent.com
```

### 6. GROWTH_GOOGLE_CLIENT_SECRET
```
Where: Google Cloud Console → OAuth 2.0 Client Secrets
Format: 24-character alphanumeric string
Example: GCSQT_example123456abcd
```

### 7. GROWTH_TOKEN_ENC_KEY ⚙️ Generate This
```
Command: openssl rand -hex 32
Output: Copy the entire hex string (64 characters)
Example: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a

⚠️  Generate FRESH for production. Do NOT reuse examples above.
```

### 8. GROWTH_CRON_SECRET ⚙️ Generate This
```
Command: openssl rand -base64 24
Output: Copy the entire base64 string
Example: 7x8y9z0aB+cDefGhIjklMnopqrstuVW==

Alternative: Any random string (20+ characters works)
⚠️  Generate FRESH for production. Do NOT reuse examples above.
```

---

## 🚀 Render Dashboard Entry Steps

1. **Create service** → New → Blueprint → pick repo → Deploy
2. **Open service** → Click "growth-copilot" in dashboard
3. **Go to Environment tab**
4. **Click Add Secret** (repeat 8 times):

```
[First Entry]
Key:   GROWTH_DATABASE_URL
Value: (paste from Supabase pooler)
→ Save

[Second Entry]
Key:   GROWTH_FIREBASE_PROJECT_ID
Value: (paste Firebase project ID)
→ Save

[Third Entry]
Key:   GROWTH_ANTHROPIC_API_KEY
Value: (paste Anthropic key)
→ Save

[Fourth Entry]
Key:   GROWTH_EMBEDDINGS_API_KEY
Value: (paste AgentRouter or OpenAI key)
→ Save

[Fifth Entry]
Key:   GROWTH_GOOGLE_CLIENT_ID
Value: (paste Google Client ID)
→ Save

[Sixth Entry]
Key:   GROWTH_GOOGLE_CLIENT_SECRET
Value: (paste Google Client Secret)
→ Save

[Seventh Entry]
Key:   GROWTH_TOKEN_ENC_KEY
Value: (paste output from: openssl rand -hex 32)
→ Save

[Eighth Entry]
Key:   GROWTH_CRON_SECRET
Value: (paste output from: openssl rand -base64 24)
→ Save
```

5. **Wait** for service to reach **Live** status (2–3 minutes)
6. **Verify:** `curl https://growth-copilot.onrender.com/healthz`

---

## ✅ Verification

Expected response from health check:
```json
{
  "ok": true,
  "version": "0.1.0",
  "database": "ok",
  "anthropic": "ok",
  "auth_mode": "firebase",
  "llm_tokens_available": true
}
```

If any field is `false`:
- `database: false` → Double-check `GROWTH_DATABASE_URL` (use **Pooler**, not Direct)
- `anthropic: false` → Double-check `GROWTH_ANTHROPIC_API_KEY` is valid
- `llm_tokens_available: false` → Anthropic quota exceeded or key invalid

---

## 🔗 Quick Links

| Service | Link |
|---------|------|
| Supabase Console | https://app.supabase.com |
| Firebase Console | https://console.firebase.google.com |
| Anthropic Dashboard | https://dashboard.anthropic.com |
| AgentRouter | https://agentrouter.org |
| OpenAI API Keys | https://platform.openai.com/api-keys |
| Google Cloud Console | https://console.cloud.google.com |
| Render Dashboard | https://dashboard.render.com |

---

## 📋 Checklist Before Clicking "Save Changes"

- [ ] All 8 secrets are entered (count them)
- [ ] No typos in secret keys (exact names matter)
- [ ] Secret values have no extra spaces (paste-and-check)
- [ ] At least 2 secrets are the generated keys (Token + Cron)
- [ ] GROWTH_DATABASE_URL uses "Pooler" endpoint (not Direct)
- [ ] GROWTH_FIREBASE_PROJECT_ID matches frontend's Firebase config
- [ ] No secrets starting with `<` or `>` (example placeholders)

---

## 🆘 If Something Goes Wrong

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Build fails immediately | Missing dependency or bad Dockerfile | Check Logs tab; this is usually a compile error |
| Service crashes after start | Wrong or missing secret | Check Logs; verify the failing secret |
| Health check says `database: false` | Bad `GROWTH_DATABASE_URL` | Re-paste from Supabase (use Pooler tab) |
| Health check says `anthropic: false` | Bad `GROWTH_ANTHROPIC_API_KEY` | Test the key in Anthropic dashboard; re-paste |
| Can't connect from frontend | `GROWTH_CORS_ORIGINS` not set | After frontend deploys, update CORS_ORIGINS with CloudFront domain |
| Need to restart | Service hung or stuck loop | **growth-copilot** → Settings → Restart Service |

---

## 🎯 You're Done When:

1. ✅ Service is **Live** (green status)
2. ✅ Health check returns `ok: true`
3. ✅ All 8 secrets appear in Environment tab
4. ✅ No errors in Logs tab

**Your backend is now deployed on Render!** 🚀

Backend URL: `https://growth-copilot.onrender.com`

Next: Deploy frontend to AWS CloudFront, then update `GROWTH_CORS_ORIGINS`.

