# Deploy MrT Frontend to AWS Amplify

This guide walks through deploying the MrT React SPA to AWS Amplify, connected to a Render backend.

## 0. Prerequisites

Before starting, ensure you have:

- **AWS account** with appropriate permissions (ability to create Amplify apps, manage environment variables, and configure custom domains)
- **GitHub repository** containing this project and push access
- **Supabase Auth project** with the GitHub provider enabled
- **Render backend** already deployed and running (the Amplify frontend will call this backend's API)
- **Local tooling**: Node 22+ and pnpm installed (optional, for local production build verification)

## 1. Create the Amplify App

1. Go to the [AWS Amplify Console](https://console.aws.amazon.com/amplify/apps)
2. Click **"New app"** → **"Host web app"**
3. Select **GitHub** as the repository provider
4. Authorize the Amplify GitHub App (click the button and complete the authorization flow)
5. Select your repository and the branch to deploy (e.g., `main`)
6. Click **"Save and deploy"**

Amplify will detect the project as a React app and auto-configure the build settings based on the presence of `vite.config.ts` and `package.json`.

## 2. Configure Build Settings

Amplify auto-detects the Vite framework, but the build settings may need adjustment. Navigate to **App settings** → **Build settings** and verify or update the settings to match:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - corepack enable
        - corepack prepare pnpm@latest --activate
        - pnpm install --frozen-lockfile
    build:
      commands:
        - pnpm build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

**Important:** Set the **Build image settings** to use **Node.js 22** (the version specified in `package.json`). This can be found in the same settings area or in a separate "Build image settings" dropdown.

**Note on corepack:** The project uses `packageManager: pnpm@12.4.1` defined in `package.json`. The preBuild commands enable corepack and prepare the exact version of pnpm, ensuring consistency across environments.

## 3. Set Environment Variables

Amplify needs all the variables the app requires at build time. These are injected as `VITE_*` variables (which are embedded in the built JavaScript).

In **App settings** → **Environment variables**, add all of the following:

| Variable | Value | Required | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | `https://your-backend.onrender.com` | Yes | **No trailing slash.** Replace with your actual Render backend URL. |
| `VITE_AUTH_MODE` | `supabase` | Yes | Enables Supabase Auth. |
| `VITE_SUPABASE_URL` | Supabase Project Settings → API | Yes | Same project URL configured as `GROWTH_SUPABASE_URL` on the backend. |
| `VITE_SUPABASE_ANON_KEY` | Supabase Project Settings → API | Yes | Public browser key; never use a service-role key here. |

**DO NOT set `VITE_DEV_TOKEN` in production.** This is a development-only fallback.

In Supabase, configure GitHub under **Authentication → Sign In / Providers**.
Register `https://<project-ref>.supabase.co/auth/v1/callback` as the GitHub
OAuth app callback, and add the Amplify origin to Supabase's allowed redirect
URLs.

## 4. SPA Routing — Rewrite Rule

Vite builds a single-page application. Without a rewrite rule, deep links (e.g., `/brief`, `/tasks`, `/login`) will return 404 errors when accessed directly or refreshed.

In **App settings** → **Rewrites and redirects**, add a single rule:

- **Source:** `</^[^.]+$|\.((?!css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)[^.])+$/>`
- **Target:** `/index.html`
- **Type:** `200 (Rewrite)`

This regex pattern matches any request that doesn't have a file extension (like `/brief`, `/tasks`) or has an unrecognized extension, and rewrites it to serve `index.html` (which React Router then handles).

**Alternative:** If configuring via `amplify.yml`, add to the `redirects` section:
```yaml
redirects:
  - source: "</^[^.]+$|\\.((?!css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)[^.])+$/>"
    target: "/index.html"
    status: "200"
```

## 5. Deploy

After saving the build settings and environment variables:

1. Amplify automatically runs a build for the connected branch
2. Monitor the build progress in the **Deployments** tab
3. Watch the three phases: **preBuild** (install dependencies), **Build** (run `pnpm build`), **Deploy** (upload to CDN)

### Common build failures

| Symptom | Cause | Fix |
|---|---|---|
| Build fails in preBuild phase | pnpm version mismatch or corepack issue | Ensure `packageManager: pnpm@12.4.1` is set in `package.json`; check Node.js version is 22 |
| Build succeeds but app errors at runtime | Missing environment variables | Verify `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL` are set in Amplify console |
| `VITE_API_BASE_URL` is undefined | Variable not set or typo in name | Check for exact spelling: `VITE_API_BASE_URL` (case-sensitive) |

## 6. Add a Custom Domain (Optional)

If you want to serve the app from a custom domain (e.g., `mrt.example.com`):

1. In the Amplify console, go to **Domain management** → **Add domain**
2. Enter your domain (or subdomain)
3. Amplify handles SSL certificate provisioning automatically via AWS Certificate Manager
4. If using **Route 53** as your DNS provider, Amplify creates the records automatically
5. For other DNS providers, follow the **CNAME** instructions displayed in the console

Once the domain is active, update your backend CORS allowlist (see section 8).

## 7. Supabase Auth Redirect URLs

Add the Amplify origin and any custom app domain to the Supabase project's
Authentication redirect URL allowlist. GitHub redirects first to the Supabase
callback URL, then Supabase returns the user to the allowed app origin.

## 8. CORS on the Render Backend

The Amplify frontend will make API requests to the Render backend. Ensure the backend's CORS allowlist includes the Amplify origin.

Update your Render backend's CORS configuration to allow:
- The Amplify default domain: `https://main.xxxxxx.amplifyapp.com`
- Your custom domain (if configured): `https://mrt.example.com`

If the backend rejects requests with a CORS error, check:
1. The backend's CORS allowlist
2. The exact domain name (including `https://` protocol)
3. That there's no trailing slash

## 9. Verify the Deployment

After the build completes and the app is live, follow the **POST_DEPLOY_CHECKLIST.md** in this folder to verify all functionality.

---

## Troubleshooting

**Build logs are unclear:** Check the individual phase logs in the Amplify console. Each phase (preBuild, Build, Deploy) has its own log stream.

**App loads but shows errors:** Open browser DevTools → Console. Common issues:
- "Cannot find module" or an auth configuration error → missing environment variable
- CORS errors → backend doesn't allow the Amplify domain
- "Unauthorized" on API calls → Supabase Auth not configured or token invalid

**Need to rebuild manually:** In the Amplify console, go to **Deployments** → (most recent deployment) → **Redeploy this version**.

For more details, see the [AWS Amplify documentation](https://docs.amplify.aws/).
