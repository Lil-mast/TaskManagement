# Database Migrations

## Overview

This project uses **SQL migration files** to version-control database schema changes. Each migration is a `.sql` file that defines the changes to apply, and they're applied using the `apply_migration` Rust binary.

## Why Migrations?

Migrations ensure:
- 🔗 Schema is version-controlled alongside code (in git)
- 📦 Database state is reproducible (dev, staging, production all match)
- 🛡️ Changes are applied safely with validation at every step
- 📝 The migration file **is** the documentation of what changed

## Migration Files Location

```
backend/migrations/
├── 0001_phase0_schema.sql          (archived)
├── 0002_phase2_rag.sql             (archived)
├── ...
├── 0010_neon_fresh_start.sql
├── 0011_workspace_submissions.sql  (latest)
└── archive/                         (historical migrations)
```

## How to Apply a Migration

### Single Migration

```bash
cd backend
cargo run --bin apply_migration -- migrations/0011_workspace_submissions.sql
```

### Multiple Migrations

```bash
cargo run --bin apply_migration -- \
  migrations/0012_thing.sql \
  migrations/0013_another.sql
```

## What Happens When You Run It

The `apply_migration` binary does this:

1. **Reads `.env`** → Extracts `GROWTH_DATABASE_URL`
2. **Connects to database** → Uses sqlx to create a connection pool
3. **Reads SQL file** → Loads the migration from disk
4. **Executes SQL** → Sends it to PostgreSQL for parsing & execution
5. **Exits with code 0** → Success, or non-zero on failure

**Exit codes tell you everything:**
- `0` = Migration applied successfully ✅
- `non-zero` = Something failed ❌ (check the error output)

## Example: Latest Migration (0011_workspace_submissions)

```sql
-- Stores code-execution runs from the /workspace screen
CREATE TABLE IF NOT EXISTS workspace_submissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  language      TEXT        NOT NULL,
  code          TEXT        NOT NULL,
  stdout        TEXT        NOT NULL DEFAULT '',
  stderr        TEXT        NOT NULL DEFAULT '',
  exit_code     INT         NOT NULL DEFAULT 0,
  time_ms       INT         NOT NULL DEFAULT 0,
  attempt_id    UUID        REFERENCES leetcode_attempts(id) ON DELETE SET NULL,
  problem_title TEXT,
  problem_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT workspace_submissions_language_check
    CHECK (language = ANY (ARRAY['python','rust','javascript','c','cpp']))
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ws_submissions_user_at
  ON workspace_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ws_submissions_user
  ON workspace_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_ws_submissions_attempt
  ON workspace_submissions (attempt_id) WHERE attempt_id IS NOT NULL;
```

**What this table does:**
- Stores every code execution from the workspace sandbox
- Links to LeetCode attempts when user logs their solution
- Tracks language, code, output, exit codes, timing
- Enforces language constraints (only python, rust, js, c, cpp)

## Creating a New Migration

When you need to add/modify database schema:

1. **Create file:** `backend/migrations/00XX_description_of_change.sql`
   - Use next sequential number
   - Use descriptive, lowercase name
   - Example: `0012_add_user_streak_table.sql`

2. **Write SQL:**
   ```sql
   -- ============================================================================
   -- 0012 — ADD USER STREAK TRACKING
   -- ============================================================================
   
   CREATE TABLE IF NOT EXISTS user_streaks (
     user_id TEXT PRIMARY KEY,
     current_streak INT NOT NULL DEFAULT 0,
     best_streak INT NOT NULL DEFAULT 0,
     last_activity_date DATE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   
   CREATE INDEX idx_streaks_best ON user_streaks (best_streak DESC);
   ```

3. **Apply it:**
   ```bash
   cd backend
   cargo run --bin apply_migration -- migrations/0012_add_user_streak_table.sql
   ```

4. **Commit to git:**
   ```bash
   git add migrations/0012_add_user_streak_table.sql
   git commit -m "migration: add user streak tracking table"
   ```

## Troubleshooting

### Error: `GROWTH_DATABASE_URL not set`

Your `.env` file is missing. Make sure `backend/.env` has:
```env
GROWTH_DATABASE_URL=postgresql://user:pass@host:port/db
```

### Error: `permission denied` or `user does not have permission`

Your database user doesn't have permission to create tables. Check:
- Is the user the database owner?
- Are there role restrictions?

### Error: `relation already exists`

The table was already created. This is usually fine because migrations use `CREATE TABLE IF NOT EXISTS`. Re-run to verify.

### Error: `constraint violation`

Your SQL has an error. Check:
- Column types match constraints
- Foreign key references exist
- Naming is consistent

## Applying Migrations in Production

On Neon PostgreSQL (your current setup):

1. Run locally first to test:
   ```bash
   cd backend
   cargo run --bin apply_migration -- migrations/00XX_thing.sql
   ```

2. Verify in your dev database that it worked

3. Then apply to production by running the same command against `GROWTH_DATABASE_URL` pointing to production (be careful!)

Or use Neon's SQL editor to manually run the migration if you prefer.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Overall system design
- [backend/Cargo.toml](../Cargo.toml) — Dependencies (includes sqlx)
- [src/bin/apply_migration.rs](../src/bin/apply_migration.rs) — The migration binary source code
