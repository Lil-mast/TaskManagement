# Growth Copilot backend — multi-stage build targeting distroless.
#
#   docker build -t growth-copilot:latest .
#   docker run --rm -p 8000:8000 --env-file .env growth-copilot:latest
#
# Secrets are never baked into the image — they arrive from the platform
# secret manager at runtime (`fly secrets set`, Railway variables, etc.).

ARG RUST_VERSION=1.87

# ---------------------------------------------------------------------------
# Stage 1: build (deps cached via the two dummy-main trick)
# ---------------------------------------------------------------------------
FROM rust:${RUST_VERSION}-slim AS build
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
# Stage 2: runtime — distroless (no shell, no package manager, ~50MB surface)
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app

COPY --from=build /build/target/release/growth-copilot ./growth-copilot
COPY --from=build /build/target/release/apply_migration ./apply_migration
COPY --from=build /build/data ./data

ENV GROWTH_PORT=8000
EXPOSE 8000

# distroless has no shell — the binary IS the container entrypoint
ENTRYPOINT ["./growth-copilot"]
