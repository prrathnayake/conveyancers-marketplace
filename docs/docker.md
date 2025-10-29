# Docker Reference Guide

This guide explains how the Conveyancers Marketplace stack is containerised, the
runtime services available via Docker Compose, and how to work with and extend
the supplied images.

## Build contexts & base images

| Component | Language/tooling | Dockerfile | Base image |
|-----------|------------------|------------|------------|
| Public marketplace (Next.js) | Node.js 20 + TypeScript | `frontend/Dockerfile` | `node:20-alpine3.20` |
| Admin portal (Next.js) | Node.js 20 + TypeScript | `admin-portal/Dockerfile` | `node:20-alpine3.20` |
| API gateway demo | C++20 + CMake | `backend/gateway/Dockerfile` | `debian:bookworm-slim` |
| Identity demo service | C++20 + CMake | `backend/services/identity/Dockerfile` | `debian:bookworm-slim` |
| Jobs demo service | C++20 + CMake | `backend/services/jobs/Dockerfile` | `debian:bookworm-slim` |
| Payments demo service | C++20 + CMake | `backend/services/payments/Dockerfile` | `debian:bookworm-slim` |

All C++ services compile inside a dedicated build stage (`cmake -S . -B build`)
and copy only the resulting binary into a slim runtime stage that includes the
minimum shared libraries (libpq, libpqxx, OpenSSL, libstdc++) and the `tini`
entrypoint for signal handling. The runtime stage health checks probe the HTTP
`/health` endpoints exposed by each service using the canonical service port.

The Next.js applications share a multi-stage layout: dependencies are resolved
with `npm ci` in the `deps` stage, static assets are compiled in the `builder`
stage, and the production runtime copies only the compiled `.next` output,
`node_modules`, and key configuration files. `dumb-init` is used as PID 1 to
ensure clean shutdown semantics, and the images run as the unprivileged `node`
user by default.

## Docker Compose topology

The `infra/docker-compose.yml` file coordinates the full stack for local
exploration. The compose file wires the following services together:

- **nginx** – TLS terminator and reverse proxy for `localhost`,
  `admin.localhost`, and `api.localhost`, backed by the official 1.27 Alpine
  image. Self-signed certificates are generated automatically when missing.
- **postgres** – PostgreSQL 16 on Alpine with SCRAM auth, seeded via the SQL
  migrations under `backend/sql/`.
- **frontend** – Public marketplace Next.js service built from `frontend/`.
- **admin-portal** – Operations UI built from `admin-portal/`, sharing runtime
  logs through the `logs/` bind mount.
- **gateway / identity / jobs / payments** – C++ demo services exposing REST
  endpoints for identity, background jobs, and PSP integrations.
- **redis** – In-memory data store secured with a password and persistence
  snapshotting enabled.
- **minio** – Object storage compatible with the AWS S3 API.
- **clamav** – Antivirus daemon used by the jobs service for file scanning.
- **otel** – OpenTelemetry collector fan-in for traces and metrics.
- **loki** – Log aggregation backing Grafana dashboards.
- **prometheus** – Metrics scraping with a bind-mounted configuration file.
- **grafana** – Visualisation layer with pre-provisioned admin credentials.

Shared configuration (such as database credentials, JWT secrets, and service
ports) comes from the project-wide `.env` file referenced by the `x-common-env`
anchor. Volume mounts persist PostgreSQL, MinIO, Loki, Prometheus, and Grafana
state across restarts, while TLS assets and application logs are surfaced via
bind mounts for easy inspection.

## Local workflows

### Build the containers

```bash
# Build all bespoke images (Next.js apps + C++ services)
docker compose --env-file .env -f infra/docker-compose.yml build
```

Compose automatically pulls updated upstream images (nginx, postgres, redis,
etc.) whenever their tags change. Building after modifying any Dockerfile or
application code will reuse cached layers for dependencies thanks to the staged
layouts described above.

### Launch the stack

```bash
# Start the entire stack in the background
docker compose --env-file .env -f infra/docker-compose.yml up -d

# Tail logs for a particular service
docker compose --env-file .env -f infra/docker-compose.yml logs -f gateway
```

Once all health checks report healthy, browse to `https://localhost` for the
public marketplace or `https://admin.localhost` for the admin portal. The demo
API endpoints are exposed behind `https://api.localhost`.

### Run automated tests prior to container builds

Before building fresh images, run the repository test suites locally to catch
regressions earlier than the Docker build step:

```bash
# Frontend marketplace
(cd frontend && npm ci && npm test -- --runInBand)

# Admin portal
(cd admin-portal && npm ci && npm test -- --runInBand)

# C++ services
cmake -S backend -B backend/build
cmake --build backend/build
ctest --test-dir backend/build --output-on-failure
```

The C++ build generates service binaries and runs the unified test target defined
by the backend CMake project. The resulting `backend/build` directory can be
reused by Docker BuildKit through bind mounts or remote caches if desired.

## Keeping images current

- Update the `NODE_IMAGE` argument in both Next.js Dockerfiles when a new Node
  20 LTS patch lands. Release tags follow the pattern `node:20-alpine3.20`.
- The C++ services centralise their Debian base image through the
  `DEBIAN_IMAGE` build argument. Pinning this argument to a digest makes supply
  chain audits deterministic.
- Review upstream service tags (`nginx`, `postgres`, `redis`, `minio`,
  `clamav`, `otel`, `loki`, `prometheus`, `grafana`) when applying security
  updates. The compose file declares each tag in a single location to simplify
  change management.
- Leverage the health checks baked into every container to confirm readiness
  during roll-outs. Compose will delay service dependencies until the upstream
  reports healthy, reducing race conditions during local launches.

With these conventions, the repository ships production-aligned Docker
artifacts that are easy to upgrade, audit, and extend.
