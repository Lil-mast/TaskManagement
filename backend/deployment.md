# Deploy the backend to Render

This guide deploys the Rust/Axum API as one **Render Web Service** connected to
Neon Postgres and Neon Auth. The existing production image is built from
`backend/Dockerfile`.

## Recommended run model

Run one long-lived Web Service for the API. The process serves normal API
requests, OAuth callbacks, and `/healthz`; it should stay in the foreground so
Render can monitor and restart it. Do not run `cargo run` as a shell task or
background the process with `&` in production.

Keep the existing Docker runtime for the first deployment. It compiles a
release binary, runs as a non-root user in a small distroless image, and keeps
the build/runtime environment consistent. Render also offers a native Rust
runtime, which is a reasonable alternative if you later remove the Docker
image, but it would need its own build and start commands. See Render's
[native runtime](https://render.com/docs/native-runtimes) and
[Docker guidance](https://render.com/docs/docker).

If switching the Blueprint to Render's native Rust runtime, set the service
root directory to `backend`, use runtime `rust`, and configure:

```text
Build Command: cargo build --release --bin growth-copilot
Start Command: ./target/release/growth-copilot
```

The Rust `main` reads Render's `PORT`, so the listener still binds to the right
port. Pick one runtime for a service; don't run the Docker entrypoint and a
separate native start command together.

Use a paid, always-on instance for production. A free web service sleeps after
15 minutes without traffic and can take about a minute to wake, which makes API
requests and OAuth callbacks unpredictable. Keep `numInstances: 1` initially:
the request and LLM rate limits are in memory per process. Add replicas only
after moving those limits to shared storage. Render's [free instance
limits](https://render.com/docs/free) describe the sleep behavior.

The workspace code runner is intentionally disabled on Render. The managed
container cannot access the host Docker socket needed to start untrusted code
containers. Keep `GROWTH_WORKSPACE_ENABLED=false`; move code execution to a
separate isolated host if that feature is needed in production.

## 1. Prepare the service

1. Push the project to a Git repository connected to Render.
2. In Render, choose **New → Blueprint** and select the repository. Render
   should find the root `render.yaml`.
3. Before creating the service, edit `backend/render.yaml`:
   - Set `region` close to the Neon project. The current Neon project is in
     `us-east-1`; choose Render **Virginia** for a new service.
   - Replace the placeholder `GROWTH_CORS_ORIGINS` value with the exact SPA
     origin, such as `https://app.example.com` (no path or trailing slash).
   - Check `GROWTH_GOOGLE_REDIRECT_URL` against the final Render service name.
4. Review the Blueprint plan and create the service. Keep one instance for the
   initial deployment.

Render does not currently let you move an existing service between regions. If
the service already exists in Oregon, leave it there for now or create a new
Virginia service and switch the frontend after verifying it. See Render's
[regions guide](https://render.com/docs/regions).

The Blueprint uses `backend/Dockerfile` as the image and `backend` as the build
context. Its `ENTRYPOINT` starts the compiled `growth-copilot` binary; no
separate dashboard start command is needed. Render injects `PORT` and expects
the server to bind to `0.0.0.0`. This app honors that variable, falling back to
`GROWTH_PORT` (8000) for local runs. Render's [web service port
requirements](https://render.com/docs/web-services#port-binding) explain the
port contract.

## 2. Set Render environment variables

Add these under the Render service's **Environment** page. Use Render's secret
fields for credentials. Do not commit `.env` files or put secrets in Docker
build arguments.

| Variable | Required | Value |
|---|---:|---|
| `GROWTH_DATABASE_URL` | Yes | Neon connection string for the production branch. Use the pooled URL (`-pooler` hostname) for the running API and keep `sslmode=require`. |
| `GROWTH_NEON_AUTH_BASE_URL` | Yes | Base URL shown under the Neon project's Auth settings. |
| `GROWTH_NEON_AUTH_JWKS_URL` | Yes | The matching Neon Auth JWKS endpoint. Copy it from Neon Auth status/settings; don't construct it from another project's URL. |
| `GROWTH_ALLOWED_EMAILS` | Yes | Comma-separated verified user emails allowed to use the API. |
| `GROWTH_CORS_ORIGINS` | Yes | Exact production SPA origin(s), comma-separated if needed. |
| `GROWTH_ALLOW_DEV_AUTH` | Yes | `false` in production. |
| `GROWTH_GOOGLE_CLIENT_ID` | For Gmail/calendar | Google OAuth Web client ID. |
| `GROWTH_GOOGLE_CLIENT_SECRET` | For Gmail/calendar | Matching Google OAuth Web client secret. |
| `GROWTH_GOOGLE_REDIRECT_URL` | For Gmail/calendar | `https://<render-service>.onrender.com/api/integrations/google/callback`. |
| `GROWTH_TOKEN_ENC_KEY` | For Gmail/calendar | A 32-byte key encoded as 64 hex characters. Generate with `openssl rand -hex 32`; keep it stable across deployments. |
| `GROWTH_ANTHROPIC_API_KEY` | For briefs and triage | Anthropic API key. |
| `GROWTH_DAILY_DEV_TOKEN` | For brief feed data | daily.dev personal access token. |
| `GROWTH_EMBEDDINGS_API_KEY` | Optional | AgentRouter embedding key for knowledge/RAG features. |
| `GROWTH_CRON_SECRET` | Optional | Random secret for scheduled `/cron/*` requests. Leave unset to keep those routes unavailable. |
| `GROWTH_WORKSPACE_ENABLED` | Yes | `false` on Render. |

Neon's pooled hostname typically includes `-pooler`. The API keeps up to eight
SQLx connections in its local pool; Neon's pooled endpoint is appropriate for
the service and limits direct Postgres connections. See Neon's
[connection pooling guide](https://neon.com/docs/connect/connection-pooling).

Set the frontend's production build variables separately:

```dotenv
VITE_API_BASE_URL=https://<render-service>.onrender.com
VITE_AUTH_MODE=neon
VITE_NEON_AUTH_URL=<the-same-Neon-Auth-base-URL>
```

Do not set `VITE_DEV_TOKEN` or use `VITE_AUTH_MODE=dev` in production. Neon
Auth's GitHub provider must also be configured in Neon, and the GitHub OAuth
app's callback must match the callback URL Neon displays. The SPA origin must
be accepted by Neon Auth's redirect URL settings.

### Google callback setup

Gmail and calendar consent use a separate Google OAuth client; this does not
enable Google sign-in. Add the exact value of `GROWTH_GOOGLE_REDIRECT_URL` to
the Google Cloud OAuth client's **Authorized redirect URIs**. After changing
the Render service name or domain, update both places to match exactly.

## 3. Prepare the Neon schema

For a new Neon database, apply the consolidated baseline once from the
`backend` directory using a direct Neon connection string in `backend/.env`:

```bash
cargo run --bin apply_migration -- migrations/0007_consolidated_baseline.sql
```

The baseline is idempotent. Do not run migrations against the production
branch just because the backend is being redeployed; first confirm which
migrations that branch already has. `0008_drop_spa_legacy.sql` drops legacy
tables and is a separate, destructive migration—review its contents and data
impact before applying it.

## 4. Deploy and verify

Render builds the Docker image and starts the service when the Blueprint is
created. For later releases, push to the configured branch or use **Manual
Deploy** in Render. Watch **Events** and **Logs** until the service is live.

Verify the public health endpoint:

```bash
curl -fsS https://<render-service>.onrender.com/healthz
```

Expect `ok: true`, `database: "configured"`, and `auth_mode: "neon"`. The
health route reports configuration, not a complete database/authentication
round trip. Then verify a real GitHub sign-in in the deployed SPA and confirm
an invited account can load an authenticated API route.

Check logs for these startup states:

- `listening addr=0.0.0.0:<PORT>` — web server bound to Render's port.
- `auth="neon"` — Neon Auth configuration was loaded.
- `database: true` in the health snapshot — database pool initialized.
- `gmail triage integration enabled` — Google client and token encryption key
  are configured.

## 5. Scheduled work

The API service does not need a second copy for cron. If scheduled work is
enabled, create separate Render **Cron Jobs** that call the existing endpoints
with the `x-cron-secret` header. Schedule in UTC and set the same
`GROWTH_CRON_SECRET` on the job and Web Service. Do not start another
long-running `growth-copilot` process as a cron service.

## 6. Local run and troubleshooting

For development, use the Rust runner from `backend`:

```bash
cp .env.example .env
# Fill the local values, then:
cargo run
```

This is a foreground development process on port 8000 by default. Stop it with
Ctrl+C. Do not use local `.env` values in Render; configure production values
in Render's Environment page.

| Symptom | Check |
|---|---|
| Deploy fails to detect a port | Confirm the process binds `0.0.0.0` and honors Render's `PORT`. |
| `/healthz` shows `database: false` or startup fails connecting | Check `GROWTH_DATABASE_URL`, SSL mode, Neon branch state, and that the Render region can reach Neon. |
| `/api` returns 401 | Check both Neon Auth URLs and that the SPA sends the Neon session token. |
| `/api/auth/me` says not invited | Add the verified account email to `GROWTH_ALLOWED_EMAILS` (or deliberately configure an admin). |
| Browser reports CORS | Set `GROWTH_CORS_ORIGINS` to the exact SPA origin and redeploy. |
| Google callback returns an error | Compare the Render redirect URL, Google Authorized redirect URI, and the actual deployed service domain character-for-character. |
| Gmail tokens cannot be decrypted after redeploy | Restore the original `GROWTH_TOKEN_ENC_KEY`; changing it invalidates saved Google tokens. |
| Workspace execution is unavailable | Expected on Render while `GROWTH_WORKSPACE_ENABLED=false`; the managed service cannot use the host Docker socket. |

## References

- [Render Web Services](https://render.com/docs/web-services)
- [Render Docker](https://render.com/docs/docker)
- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Environment Variables](https://render.com/docs/configure-environment-variables)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon Auth JWTs](https://neon.com/docs/auth/guides/plugins/jwt)
