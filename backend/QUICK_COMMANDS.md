# Quick Commands Reference

## Development Server

```bash
# Start backend (http://localhost:8000)
cargo run

# Run with logging enabled
RUST_LOG=debug cargo run

# Start with custom port
GROWTH_PORT=9000 cargo run
```

## Database Migrations

```bash
# Apply a single migration
cargo run --bin apply_migration -- migrations/0011_workspace_submissions.sql

# Apply multiple migrations
cargo run --bin apply_migration -- \
  migrations/0012_new_table.sql \
  migrations/0013_another_table.sql

# Query the database directly
cargo run --bin db_query -- "SELECT table_name FROM information_schema.tables LIMIT 5;"

# Check if a table exists
cargo run --bin db_query -- "SELECT * FROM workspace_submissions LIMIT 1;"
```

## Testing

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_name -- --nocapture

# Run tests with output visible
cargo test -- --nocapture
```

## Docker & Deployment

```bash
# Build Docker image (production, no sandbox)
docker build -t growth-copilot:latest .

# Build Docker image (with sandbox support)
docker build --build-arg SANDBOX_BUILD=1 -t growth-copilot:sandbox .

# Run in Docker with env file
docker run --rm -p 8000:8000 --env-file .env growth-copilot:latest

# Run sandbox variant with Docker socket mount
docker run --rm \
  -p 8000:8000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  --env-file .env \
  growth-copilot:sandbox
```

## Health & Debugging

```bash
# Check server health
curl localhost:8000/healthz | jq .

# Test workspace execution (requires GROWTH_WORKSPACE_ENABLED=true)
curl -X POST http://localhost:8000/api/workspace/run \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"Hello!\")"}' | jq .

# Check database connectivity
cargo run --bin db_query -- "SELECT NOW();"
```

## Building & Compilation

```bash
# Check for errors without building
cargo check

# Build release binary (optimized)
cargo build --release

# Clean build artifacts
cargo clean

# Build and run in one command
cargo run --release
```

## Formatting & Linting

```bash
# Format code
cargo fmt

# Check formatting
cargo fmt -- --check

# Run clippy (linter)
cargo clippy

# Run clippy with fixes
cargo clippy --fix
```

## When Something Goes Wrong

```bash
# Full build from scratch
cargo clean && cargo build

# Rebuild after .env changes (restart server manually)
# Note: .env is only read at startup

# Check if port is in use
lsof -i :8000

# Kill process on port 8000
kill -9 $(lsof -ti:8000)
```

## Common Workflows

### Fresh database setup

```bash
# 1. Ensure .env has GROWTH_DATABASE_URL
# 2. Apply baseline migration
cargo run --bin apply_migration -- migrations/0007_consolidated_baseline.sql

# 3. Verify tables exist
cargo run --bin db_query -- "SELECT COUNT(*) FROM tasks;"

# 4. Start server
cargo run
```

### Add a new table

```bash
# 1. Create migration file (e.g., 0012_my_table.sql)
# 2. Apply it
cargo run --bin apply_migration -- migrations/0012_my_table.sql

# 3. Verify
cargo run --bin db_query -- "SELECT * FROM my_table LIMIT 0;"

# 4. Commit
git add migrations/0012_my_table.sql
git commit -m "migration: add my_table"
```

### Test the workspace sandbox

```bash
# 1. Ensure .env has GROWTH_WORKSPACE_ENABLED=true
# 2. Ensure Docker is running and images are pulled:
docker pull python:3.12-slim rust:1.78-slim node:20-slim gcc:13

# 3. Start server
cargo run

# 4. Make a request
curl -X POST http://localhost:8000/api/workspace/run \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(42)"}' | jq .
```

## See Also

- [MIGRATIONS.md](docs/MIGRATIONS.md) — Detailed migration guide
- [README.md](README.md) — Full documentation
- [Cargo.toml](Cargo.toml) — Dependencies and project config
