# Growth Copilot backend — multi-stage build targeting distroless.
#
#   docker build -t growth-copilot:latest .
#   docker run --rm -p 8000:8000 --env-file .env growth-copilot:latest
#
# Secrets are never baked into the image — they arrive from the platform
# secret manager at runtime (`fly secrets set`, Railway variables, etc.).
#
# ── Workspace / sandbox mode ────────────────────────────────────────────────
# The /api/workspace/run endpoint spawns Docker containers on the host to
# execute user code. This requires:
#
#   1. GROWTH_WORKSPACE_ENABLED=true in the runtime env
#   2. The host Docker socket bind-mounted into this container:
#        docker run ... -v /var/run/docker.sock:/var/run/docker.sock ...
#   3. Language images pre-pulled on the host:
#        docker pull python:3.12-slim rust:1.78-slim node:20-slim gcc:13
#
# For a self-hosted machine with Docker socket access, build the optional
# sandbox-capable image explicitly with --target sandbox-runtime:
#
#   docker build --target sandbox-runtime -t growth-copilot:sandbox .
#   docker run --rm -p 8000:8000 \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     --env-file .env \
#     growth-copilot:sandbox
#
# The default final stage is the slim distroless production image; it does not
# include Docker or the workspace code-execution capability.
# ---------------------------------------------------------------------------

# Cargo.lock includes dependencies with an MSRV of Rust 1.89 (for example
# uuid 1.28.0). Keep the build image at or above the lockfile's MSRV.
ARG RUST_VERSION=1.89
ARG RUST_DEBIAN_VARIANT=bookworm

# ---------------------------------------------------------------------------
# Stage 1: build (deps cached via the two dummy-main trick)
# ---------------------------------------------------------------------------
FROM rust:${RUST_VERSION}-slim-${RUST_DEBIAN_VARIANT} AS build
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cache deps: compile a stub main twice, only the second touches app source
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src/bin && \
    echo "fn main() {}" > src/main.rs && \
    echo "fn main() {}" > src/bin/apply_migration.rs && \
    echo "fn main() {}" > src/bin/db_query.rs && \
    cargo build --release --bin growth-copilot --bin apply_migration && \
    rm -rf src target/release/growth-copilot target/release/apply_migration

COPY src ./src
COPY migrations ./migrations
# books data re-seeds the corpus; keep it available to the runtime image
COPY data ./data

RUN cargo build --release --bin growth-copilot --bin apply_migration

# ---------------------------------------------------------------------------
# Stage 2 (optional): sandbox-capable runtime — Debian + Docker CLI
# This stage is before the default final stage so ordinary Docker/Render builds
# never install Docker-in-Docker tooling. Select it explicitly with
# `docker build --target sandbox-runtime ...` on a host that supports a Docker
# socket mount.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS sandbox-runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/target/release/growth-copilot ./growth-copilot
COPY --from=build /build/data ./data

ENV GROWTH_PORT=8000
EXPOSE 8000

# Non-root user for the process; Docker socket access requires the container
# to be run with --group-add "$(stat -c '%g' /var/run/docker.sock)" or
# --user root. See deploy/README.md for the recommended run command.
ENTRYPOINT ["./growth-copilot"]

# ---------------------------------------------------------------------------
# Stage 3: production runtime (the default/final stage)
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /app

COPY --from=build /build/target/release/growth-copilot ./growth-copilot
COPY --from=build /build/target/release/apply_migration ./apply_migration
COPY --from=build /build/data ./data

ENV GROWTH_PORT=8000
EXPOSE 8000

# Distroless has no shell — the binary is the container entrypoint.
ENTRYPOINT ["./growth-copilot"]
