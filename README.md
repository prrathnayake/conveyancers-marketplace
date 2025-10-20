# Conveyancers Marketplace (AU)

> A simulation-focused starter kit for exploring conveyancing workflows with seeded data, SQLite persistence, and optional C++ microservice mocks.

This repository now reflects the code that actually ships in the main applications: two Next.js 14 projects (public marketplace + admin portal) that share a SQLite database and deliver the documented user journeys through API routes. The C++ services that were part of the original brief remain in the tree as standalone HTTP demos, but the production UI relies on the Node.js stack instead of delegating to those processes. Docker Compose is provided to wire Nginx, the Next.js apps, and the demo services together for local exploration.

## Who is this starter for?

- **Digital conveyancing startups** that need a production-quality baseline aligned with Australian regulation from day one.
- **Innovation teams** inside established firms that want to prototype new customer journeys without rebuilding commodity capabilities.
- **Delivery partners** or consultants who need a demo-ready environment to validate integrations and workflows before implementing them inside a client’s tenancy.

If you are evaluating whether this starter is a fit, scan the [feature report](docs/feature-report.md) for an end-to-end capability checklist rooted in the implemented code and the [system requirements](docs/System%20Requirements%20for%20Australian%20Conveyancer%20Marketplace.pdf) for the original aspirational brief.

## Tech stack at a glance

| Layer | Primary tooling | Notes |
|-------|-----------------|-------|
| Web experience | Next.js 14 (public marketplace) | Pages router + API routes backed by SQLite and shared session helpers. |
| Operations UI | Next.js 14 (admin portal) | Shares libraries with the public app for authentication, auditing, and notifications. |
| Data persistence | SQLite via `better-sqlite3` | Stored in `data/app.db` (or `PLATFORM_DATA_DIR`), seeded on demand for demos. |
| Backend demos | C++20 + `cpp-httplib` | Mock identity/jobs/payments services exposed over HTTP at `https://api.localhost`. |
| Infrastructure | Docker Compose, Nginx | TLS termination for `localhost`, `admin.localhost`, and `api.localhost`; reverse proxies to the apps. |
| Observability | Structured logging helpers | Request correlation IDs + metrics endpoints provided by app middleware. |
| Tooling | Docker Compose, CMake, npm workspaces | `tooling/load-env.js` helper for sourcing `.env` files. |

The architecture is intentionally modular: the admin portal and the public marketplace can be deployed independently, and the gRPC layer cleanly separates domain logic so additional surfaces (e.g. partner APIs or mobile applications) can be added without reworking core services.

---

## Table of contents

1. [Who is this starter for?](#who-is-this-starter-for)
2. [Tech stack at a glance](#tech-stack-at-a-glance)
3. [Solution highlights](#solution-highlights)
4. [Architecture overview](#architecture-overview)
5. [Repository layout](#repository-layout)
6. [Quick start](#quick-start)
7. [Environment configuration](#environment-configuration)
8. [Developer workflows](#developer-workflows)
9. [Testing strategy](#testing-strategy)
10. [Compliance & data residency](#compliance--data-residency)
11. [Operations & observability](#operations--observability)
12. [Troubleshooting & FAQ](#troubleshooting--faq)
13. [Extending the platform](#extending-the-platform)
14. [Documentation index](#documentation-index)
15. [Contributing](#contributing)
16. [Community & support](#community--support)
17. [License](#license)

---

## Solution highlights

### Frontend (Next.js 14 + TypeScript)
- Server-side rendering (app router) optimised for SEO.
- Tailwind CSS design system with DaisyUI components.
- WebSocket-powered chat for real-time matter updates.
- Admin console with feature toggles and operational tooling.
- ConveySafe policy banners that detect off-platform contact attempts to preserve the evidentiary trail.

### Backend (C++ demos)
- **Gateway service** that exposes a simple REST façade and forwards to in-memory demo services.
- **Identity/Jobs/Payments services** implement seeded data and business rules for exploration but persist everything in process memory.
- Shared security helpers provide request IDs, role enforcement, and metrics endpoints for each service.【F:backend/common/security.h†L300-L356】

### Infrastructure (Docker Compose)
- PostgreSQL and SQLite storage for the Next.js apps, plus an Nginx reverse proxy with TLS termination.
- Optional C++ demo services reachable at `https://api.localhost` when the compose stack is running.【F:infra/docker-compose.yml†L119-L186】
- TLS helper script for regenerating certificates with SANs covering `localhost`, `admin.localhost`, and `api.localhost`.【F:infra/tls/dev_certs.sh†L1-L36】

---

## Architecture overview

```text
                  ┌─────────────────────┐
                  │      Browsers       │
                  └──────────┬──────────┘
                             │ HTTPS
                     ┌───────▼───────┐
                     │   Nginx TLS   │
                     └───────┬───────┘
               ┌─────────────┴─────────────┐
               │                           │
   ┌───────────▼──────────┐     ┌──────────▼──────────┐
   │ Next.js marketplace │     │ Next.js admin portal│
   │  (frontend service) │     │  (operations UI)    │
   └───────────┬──────────┘     └──────────┬──────────┘
               │                           │
               └────────────┬──────────────┘
                            │
                   ┌────────▼────────┐
                   │   SQLite data   │
                   │  (`data/app.db`)│
                   └────────┬────────┘
                            │
         ┌──────────────────▼───────────────────┐
         │ Optional C++ demo services (HTTP)    │
         │ identity/jobs/payments at api.localhost │
         └──────────────────────────────────────┘
```

The UIs call their own Next.js API routes backed by SQLite. The C++ services can be explored independently (for example through `https://api.localhost`) but are not wired into the production flows without additional integration work.

---

## Repository layout

```text
├── backend/           # C++ services, protobuf contracts, cmake build
│   ├── gateway/       # REST façade, auth middleware, request routing
│   ├── services/      # identity/, jobs/, payments/ microservices
│   └── sql/           # migrations and seed data
├── docs/              # Deployment and compliance guidance
├── frontend/          # Next.js 14 app (app router + components + tests)
├── infra/             # Docker compose, TLS scripts, environment templates
└── README.md          # You are here
```

---

## Prerequisites

Before you begin, make sure your local environment has the following tools installed:

- **Docker Desktop 4.24+** (or Docker Engine with Compose v2) for orchestrating the local stack.
- **Node.js 20 LTS** and **npm 10+** for working with the Next.js frontends.
- **CMake 3.26+** and a modern C++20 compiler (Clang 15 or GCC 12) for building the backend services.
- **OpenSSL** for certificate generation scripts under `infra/tls/`.

> On macOS, Homebrew packages (`brew install docker cmake openssl@3 node`) provide the required tooling. On Windows, ensure WSL2
> integration is enabled so Docker Desktop can provision the Linux containers used throughout the stack.

---

## Quick start

The quickest way to experience the stack locally is via Docker Compose.

```bash
# 1. Create the shared environment file used by every component
cp .env.example .env

# 2. Map the TLS-enabled hostnames to 127.0.0.1 (macOS/Linux example)
printf "127.0.0.1 localhost admin.localhost api.localhost\n" | sudo tee -a /etc/hosts

# 3. Generate self-signed TLS certificates for the local nginx proxy
bash infra/tls/dev_certs.sh

# 4. Build and start the stack (Next.js apps + optional C++ demos)
docker compose --env-file .env -f infra/docker-compose.yml up -d --build

# 5. (Optional) Install dependencies if you plan to run a Next.js dev server locally
(cd frontend && npm install)

# 6. Sign in with the seeded administrator account using ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD
#    (passwords shorter than 12 characters are accepted for local use but log a warning)

# 7. Access the stack
# Public marketplace: https://localhost
# Admin portal:       https://admin.localhost
# Demo gateway:       https://api.localhost (C++ mocks; not used by the Next.js apps)
```

> **Tip:** Only PostgreSQL is provisioned by default; Redis, MinIO, ClamAV, and the observability stack from the original brief were removed because the running code does not reference them.

To stop everything cleanly:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

---

## Environment configuration

| File | Purpose |
|------|---------|
| `.env` | Central configuration for frontend, admin portal, backend services, and Docker Compose. |
| `.env.local` | Optional developer-specific overrides loaded after the shared `.env`. |
| `backend/services/*/.env.example` | Service-specific overrides (PSP API keys, KYC provider IDs, DocuSign credentials). |

All example files are safe defaults. Replace placeholders before deploying to a shared environment. Never commit secrets—use your platform’s secret store.

---

## Developer workflows

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev    # Dev server with hot reload (port 5173)
npm run build  # Production build used by Docker
npm run start  # Serve the built app on port 3000
```

### Admin portal (Next.js)

```bash
cd admin-portal
npm install
npm run dev    # Dev server with hot reload (port 5300)
npm run build
npm run start  # Serve the built app on port 4300
```

> The first administrator account is provisioned from `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD{,_HASH}` in your environment. Set the same `JWT_SECRET` for both the public site and the admin portal so that sessions are shared.

Backend API routes emit structured JSON log lines to the repository-level `logs/` directory (override with `LOG_DIRECTORY`). The “System logs” view inside the admin portal surfaces the most recent entries so operators can review workflow interactions without shell access.【F:frontend/lib/observability.ts†L1-L60】【F:admin-portal/pages/system-logs.tsx†L1-L196】

### Backend (C++ services)

```bash
cd backend
cmake -S . -B build
cmake --build build
ctest --test-dir build
```

Run individual services locally by supplying the generated `.env` files or export the required environment variables before launching the binaries located in `build/bin/`.

### Infrastructure utilities

- `infra/tls/dev_certs.sh` – regenerate local certificates for the nginx proxy.
- `infra/docker-compose.yml` – runnable profile for the Next.js apps and demo services.
- `tooling/load-env.js` – inspect the merged `.env` configuration that each runtime consumes.

### Local development tips

- **Resetting the demo data** – Delete `data/app.db` (or the path referenced by `PLATFORM_DATA_DIR`) to reseed the SQLite database on the next request.【F:frontend/lib/db.ts†L1-L118】
- **Inspecting logs** – API routes append structured entries to `logs/api-observability.log`. Configure `LOG_DIRECTORY` in `.env` to write elsewhere.【F:frontend/lib/observability.ts†L1-L61】
- **Verifying notifications** – Provide working SMTP/Twilio credentials; otherwise helpers warn and skip delivery to avoid test spam.【F:frontend/lib/notifications.ts†L15-L66】

---

## Testing strategy

Automated test suites have not been implemented yet for the Next.js applications or the C++ demo services. Add regression coverage before extending the stack into production (for example with Vitest/Jest for API routes and GoogleTest for the C++ binaries), and wire those checks into CI alongside linting and container builds.

---

## Compliance & data residency

The repository focuses on demonstrable guardrails rather than fully-automated regulator integrations:

- Conveyancers registered in QLD or ACT remain hidden unless they are verified or the viewer has elevated privileges, keeping jurisdictional restrictions visible in the demo flows.【F:frontend/pages/api/profiles/[id].ts†L7-L148】
- Admin actions invoke a shared audit helper that records the actor, entity, and metadata inside the SQLite database for traceability.【F:frontend/lib/audit.ts†L1-L13】
- All persisted data lives inside the SQLite file controlled by `PLATFORM_DATA_DIR`, so relocate the database to compliant storage before handling production records.【F:frontend/lib/db.ts†L1-L118】

Refer to [`docs/compliance.md`](docs/compliance.md) for the broader regulatory commentary that accompanied the original brief.

---

## Operations & observability

- **Application logs** – Every API route uses `withObservability`, producing structured entries with correlation IDs inside `logs/api-observability.log`. Point `LOG_DIRECTORY` elsewhere for shared environments.【F:frontend/lib/observability.ts†L1-L60】
- **Demo service health checks** – The C++ gateway and services expose `/healthz` for liveness along with `/metrics` guarded by role checks for ad-hoc Prometheus scraping.【F:backend/gateway/src/main.cpp†L44-L55】【F:backend/common/security.h†L318-L356】
- **Admin portal views** – The dashboard surfaces recent log lines so operators can triage issues without shell access.【F:admin-portal/pages/system-logs.tsx†L1-L196】

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for production hardening guidance (autoscaling, secret management, WAF, SSO, backups).

---

## Troubleshooting & FAQ

**Services fail to start in Docker Compose**  
Check for port collisions (`lsof -i :443`) and confirm your `.env` file has been created from `.env.example`. Compose will log missing variables during startup—run `docker compose --env-file .env -f infra/docker-compose.yml logs -f gateway` to tail service output in real time.

**Certificates appear invalid in the browser**
Regenerate them with `bash infra/tls/dev_certs.sh` and trust `infra/tls/dev.crt` (the SAN covers `localhost`, `admin.localhost`, and `api.localhost`). Some browsers require a restart after importing the certificate.

**Backend changes are not reflected**  
If you rebuilt locally without pruning old artifacts, clear the `build/` directory under `backend` or run `cmake --build build --target clean` before compiling again. When running inside Docker, add `--build` to your compose invocation to ensure the service image is refreshed.

**Where do I find aggregated errors?**
Tail `logs/api-observability.log` or point `LOG_DIRECTORY` at a shared location. The admin portal’s “System logs” panel shows the latest entries without shell access.【F:frontend/lib/observability.ts†L1-L60】【F:admin-portal/pages/system-logs.tsx†L1-L196】

---

## Extending the platform

1. **Swap in real integrations** – Replace the seeded workflows in the Next.js API routes (for example `admin-portal/pages/api/users.ts`) with calls to your production services or vendor SDKs.【F:admin-portal/pages/api/users.ts†L1-L120】
2. **Evolve the data model** – Extend the SQLite schema inside `frontend/lib/db.ts` or migrate to an external database before onboarding real customers.【F:frontend/lib/db.ts†L61-L158】
3. **Optional service tier** – The C++ demos under `backend/services/*` expose HTTP endpoints that you can either harden or replace with your preferred language stack.【F:backend/services/jobs/main.cpp†L2037-L2058】
4. **Automate validation** – Add unit and integration tests so regressions are caught automatically when expanding the platform.

---

## Documentation index

- [`docs/DEPLOY.md`](docs/DEPLOY.md) – Deployment strategies, production hardening checklist.
- [`docs/compliance.md`](docs/compliance.md) – Australian regulatory references and process notes.
- [`docs/conveysafe.md`](docs/conveysafe.md) – Trust, compliance, and lock-in narrative for the ConveySafe assurance layer.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) – Contribution guidelines for internal and external collaborators.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) – Expected behaviour in community channels.
- [`SECURITY.md`](SECURITY.md) – Vulnerability disclosure process.

---

## Contributing

We welcome pull requests that enhance functionality, documentation, or developer experience. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for details on branching strategy, coding conventions, and review expectations before submitting changes.

---

## Community & support

- **Issues:** Use GitHub Issues to report bugs or request features.
- **Security:** Follow the instructions in [`SECURITY.md`](SECURITY.md) to responsibly disclose vulnerabilities.
- **Commercial enquiries:** Contact the maintainers via the details shared in your onboarding pack or sales agreement.

---

## License & legal notices

This project is distributed under a proprietary license. Usage is restricted to authorized
collaborators with written permission from the repository owners. See the
[`LICENSE`](LICENSE) file for the full text and review the [`LEGAL_NOTICE`](LEGAL_NOTICE.md)
for patent and confidentiality information.
