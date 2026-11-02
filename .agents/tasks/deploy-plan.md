# MrT Deployment Implementation Plan

**Task:** Deploy MrT app with frontend on AWS (S3 + CloudFront) and backend on Render.

**Project Context:**
- Frontend: React SPA + Vite, TypeScript
- Backend: Rust Axum service, containerized via multi-stage Dockerfile → distroless
- Existing backend: Already configured for Render (render.yaml exists), Dockerfile proven
- Frontend build output: Vite → `dist/` (SPA with index.html)
- Authentication: Firebase (SPA signs in via Firebase, sends ID token to backend)
- Environment: Render uses `oregon` region; AWS region → `us-west-2` (closest US West coast)

**Key Decisions:**
1. **Terraform over CDK:** IaC-as-code for reproducibility and revision control; Terraform 1.9+
2. **CloudFront OAC (Origin Access Control):** Modern AWS standard for S3 access (replaces OAI), enforces private S3 bucket
3. **Terraform module structure:** Separate files for readability (main.tf, variables.tf, outputs.tf)
4. **Route53 optional:** Document both CNAME-only and Route53 approaches
5. **GitHub Actions for CI/CD:** Free tier, native secrets integration, matrix for environment parity
6. **Render backend:** render.yaml already correct structure; only CORS_ORIGINS placeholder needs updating
7. **Secrets strategy:** GitHub Secrets for frontend build-time injection; Render environment for runtime secrets

**Gaps/Assumptions:**
- AWS account exists with credentials in `~/.aws/` (required before Terraform apply)
- GitHub Secrets already populated (or documented for manual entry)
- Render account/project created before running Blueprint
- Firebase project created and configured (frontend .env.example already references it)
- Domain DNS already registered (Route53 assumes NS records delegated)
- No backend migration needed — render.yaml targets existing service name `growth-copilot`

---

## Implementation Plan

- [ ] **1. Create Terraform infrastructure files for AWS S3 + CloudFront**
      
      Implement core IaC with S3 (private, versioned), CloudFront distribution (OAC, SPA 404→index.html routing, security headers), Route53 optional records, and outputs.
      
      Files to create:
      - `infra/aws/main.tf` — S3 bucket, CloudFront distribution, CloudFront cache policies, OAC, security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
      - `infra/aws/variables.tf` — domain_name, environment, enable_route53, certificate_arn, tags
      - `infra/aws/outputs.tf` — s3_bucket_name, cloudfront_distribution_id, cloudfront_domain_name, route53_record_fqdn (conditional)
      - `infra/aws/terraform.tfvars` — environment-specific values (example/template)
      
      Decisions recorded in files:
      - SPA fallback routing: CloudFront error caching rule (404 → /index.html, cache 300s)
      - Security headers set via CloudFront cache policy (X-Content-Type-Options: nosniff, X-Frame-Options: DENY, HSTS: max-age=31536000)
      - CSP header: Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://firebase.googleapis.com
      - OAC: prevents direct S3 access, CloudFront-only path
      - Route53: document CNAME alias vs. Terraform route53_record option
      
      Verify: `terraform validate` succeeds; `terraform plan` shows S3 bucket + CloudFront with correct origins/headers

- [ ] **2. Create GitHub Actions workflow for frontend CI/CD**
      
      Implement automated build, test, and deployment on push to `main`.
      
      Files to create:
      - `.github/workflows/deploy-frontend.yml` — trigger on main push, checkout → Node setup (20.x) → pnpm install → typecheck → build → S3 sync → CloudFront invalidation
      
      Decisions recorded:
      - Environment variable injection: VITE_API_BASE_URL (backend Render URL), VITE_AUTH_MODE=firebase, VITE_FIREBASE_* (all 6 vars from .env.example)
      - Build inject via `env:` section mapping GitHub Secrets to VITE_* vars
      - S3 sync: `aws s3 sync dist/ s3://${{ secrets.AWS_S3_BUCKET }}/ --delete` (atomic, removes deleted local files from S3)
      - CloudFront invalidation: `aws cloudfront create-invalidation --distribution-id ${{ secrets.AWS_CF_DIST_ID }} --paths "/*"` (cache bust all objects)
      - Secrets required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_CF_DIST_ID, VITE_API_BASE_URL, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
      - Error handling: `set -e` to fail fast; if any step fails, workflow stops
      
      Verify: `act -j deploy` (local GitHub Actions runner) runs workflow; check that secrets are properly substituted into build env

- [ ] **3. Review and document Render backend render.yaml + environment secrets**
      
      Audit existing render.yaml and create deployment documentation identifying all secrets, their sources, and format.
      
      Files to create/document:
      - `docs/deploy/render-backend.md` — audit of render.yaml + complete secret mapping table
      
      Decisions recorded:
      - Service name: `growth-copilot` (verified in render.yaml; NO renaming needed; keep as-is)
      - CORS_ORIGINS placeholder: Update render.yaml to use CloudFront domain (template: `https://<cloudfront-domain>` where domain comes from Terraform outputs)
      - Secret table: Document every `sync: false` env var with: name, description, where to get it, example format
        * GROWTH_DATABASE_URL: Supabase pooler URI (postgresql://... format)
        * GROWTH_FIREBASE_PROJECT_ID: Firebase console project id string
        * GROWTH_ANTHROPIC_API_KEY: API key from Anthropic dashboard
        * GROWTH_EMBEDDINGS_API_KEY: OpenAI API key (or AgentRouter if using)
        * GROWTH_GOOGLE_CLIENT_ID / _SECRET: OAuth client from Google Cloud console
        * GROWTH_TOKEN_ENC_KEY: 64-char hex string (openssl rand -hex 32)
        * GROWTH_CRON_SECRET: random string, used in cron request headers
      - CORS_ORIGINS: set to CloudFront domain once deployed (e.g., https://d1234.cloudfront.net)
      - Health check: /healthz returns {ok, version, database, anthropic, auth_mode, llm_tokens_available}
      - Auto-deploy: true (pushes to repo auto-deploy to Render)
      
      Verify: All `sync: false` keys documented in render.yaml; cross-reference against backend/.env.example to ensure no keys missed

- [ ] **4. Create unified pre-flight deployment checklist**
      
      Step-by-step instructions for executing the complete deployment (AWS → GitHub Secrets → Render → smoke test).
      
      Files to create:
      - `docs/deploy/CHECKLIST.md` — pre-flight checklist with exact commands and verification points
      
      Sections:
      1. **AWS Account Setup** — create IAM user with S3 + CloudFront permissions, generate access key, store in `~/.aws/credentials`
      2. **Terraform Apply** — clone repo, cd infra/aws, `terraform init`, `terraform apply`, capture outputs (bucket name, distribution ID)
      3. **GitHub Secrets Wiring** — add 11 secrets to repo (AWS_*, VITE_*) from Terraform outputs and Firebase config
      4. **Backend Render Blueprint** — push render.yaml, deploy via Render dashboard or Blueprint, set 8 backend secrets, capture service URL
      5. **Smoke Test** — curl backend /healthz, verify frontend loads at CloudFront domain, check auth redirect to Firebase, test one end-to-end task creation
      6. **Cron Jobs** — schedule 3 jobs (morning brief, weekly review, reweight) on Render or GitHub Actions
      7. **Rollback Plan** — how to revert Terraform, delete Render service, disable GitHub Actions
      
      Verify: Checklist is complete and all commands are copy-paste ready (no placeholder config needed)

- [ ] **5. Create environment variable deployment guides**
      
      Separate guides for local dev (.env files) and production (GitHub Secrets + Render environment).
      
      Files to create:
      - `docs/deploy/ENV_GUIDE.md` — two-section guide: local dev + production
      
      **Local Development Section:**
      - Copy `.env.example` to `.env` and `.env.local` (Vite loads .env.local)
      - Frontend .env.local: Set VITE_API_BASE_URL=http://localhost:8000, VITE_AUTH_MODE=dev (or firebase if testing auth), VITE_DEV_TOKEN=dev, VITE_FIREBASE_* (leave blank for dev mode)
      - Backend backend/.env: Set GROWTH_ANTHROPIC_API_KEY (required), GROWTH_CORS_ORIGINS=http://localhost:5173, other vars optional for local testing
      - Run: `pnpm dev` (frontend) + `cargo run` (backend in backend/ dir)
      
      **Production Section:**
      - GitHub Secrets (11 vars for CI/CD): AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_CF_DIST_ID, VITE_API_BASE_URL, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
      - Render environment (backend, set via Render dashboard or render.yaml `sync: false`): 8 secrets (DATABASE_URL, FIREBASE_PROJECT_ID, ANTHROPIC_API_KEY, EMBEDDINGS_API_KEY, GOOGLE_CLIENT_ID/SECRET, TOKEN_ENC_KEY, CRON_SECRET, CORS_ORIGINS)
      - Notes: Secrets never committed, never baked into Docker images, set at runtime only
      - Troubleshooting: If build fails with "undefined VITE_*", check GitHub Secrets are named exactly as referenced in workflow
      
      Verify: Examples in both sections match actual .env.example files; no secrets accidentally included as examples

---

## File Structure Summary

```
TaskManagement/
├── .github/workflows/
│   └── deploy-frontend.yml                    # NEW: CI/CD for frontend
├── infra/aws/
│   ├── main.tf                                # NEW: S3 + CloudFront + OAC
│   ├── variables.tf                           # NEW: input variables
│   ├── outputs.tf                             # NEW: terraform outputs
│   └── terraform.tfvars                       # NEW: example config (template)
├── docs/deploy/
│   ├── CHECKLIST.md                          # NEW: step-by-step pre-flight checklist
│   ├── ENV_GUIDE.md                          # NEW: local dev + production env vars
│   └── render-backend.md                     # NEW: audit + secret mapping for Render
├── backend/
│   ├── render.yaml                           # AUDIT: CORS_ORIGINS placeholder → real domain
│   └── deploy/README.md                      # EXISTING: Render runbook (kept as-is)
└── [existing frontend files unchanged]
```

## Implementation Order & Dependencies

1. **Terraform IaC** (Step 1) — must complete first; produces AWS resource IDs
2. **GitHub Secrets + Workflow** (Step 2) — depends on Step 1 outputs (bucket name, distribution ID)
3. **Render Documentation** (Step 3) — independent; audits existing config
4. **Checklist** (Step 4) — depends on Steps 1–3; ties them together
5. **Environment Guides** (Step 5) — independent; documents all env vars

## Blockers & Risks

- **AWS Account Missing:** If no AWS account/credentials, Step 1 will fail. User must create account + IAM user first.
- **Terraform State:** `.terraform/` will be created locally; `.tfstate` file should NOT be committed (add to .gitignore). Consider moving to Terraform Cloud/S3 backend later.
- **Domain DNS:** If using Route53, NS records must be delegated from domain registrar. Document both CNAME and Route53 paths to avoid this blocker.
- **Firebase Project ID Mismatch:** If frontend and backend Firebase project IDs differ, auth will fail. Checklist must verify they match.
- **Rate Limiting:** Render starter plan is single instance; scale-up needed for high traffic. Document in monitoring section.

## Verification Summary

Each step leaves the project buildable and testable:
1. `terraform validate` + `terraform plan` ✓
2. `act -j deploy` (local GH Actions runner) or manual workflow run ✓
3. Manual review of render.yaml + documentation completeness ✓
4. Checklist is internally consistent and references all prior outputs ✓
5. ENV_GUIDE matches actual .env.example files ✓

Full end-to-end verification happens in the **Checklist smoke test** step.

---

## Next Steps for Implementer

Read all files in this order:
1. This plan file (you are here)
2. `backend/render.yaml` — understand current Render config
3. `backend/.env.example` — understand all backend secrets
4. `.env.example` — understand all frontend secrets
5. `vite.config.ts` — confirm build output is `dist/`

Then implement items 1–5 in order. Each commit should close one item.
