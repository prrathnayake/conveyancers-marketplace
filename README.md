# Conveyancers Marketplace (AU)

> A production-ready starter kit for launching an Australian conveyancing marketplace with escrow-style milestone payments, licence-aware workflows, secure document exchange, and rich observability baked in.

This repository brings together a full-stack reference implementation spanning a Next.js 14 frontend, a modern C++ services backend, and a Docker Compose infrastructure layer that mirrors an enterprise-ready topology. It is intended to give founders and platform teams a compliant baseline that they can extend with vendor integrations (PSP, KYC, e-signature, etc.) and bespoke product features.

---

## Table of contents

1. [Solution highlights](#solution-highlights)
2. [Architecture overview](#architecture-overview)
3. [Repository layout](#repository-layout)
4. [Quick start](#quick-start)
5. [Environment configuration](#environment-configuration)
6. [Developer workflows](#developer-workflows)
7. [Testing strategy](#testing-strategy)
8. [Compliance & data residency](#compliance--data-residency)
9. [Operations & observability](#operations--observability)
10. [Extending the platform](#extending-the-platform)
11. [Documentation index](#documentation-index)
12. [Contributing](#contributing)
13. [Community & support](#community--support)
14. [License](#license)

---

## Solution highlights

### Frontend (Next.js 14 + TypeScript)
- Server-side rendering (app router) optimised for SEO.
- Tailwind CSS design system with DaisyUI components.
- WebSocket-powered chat for real-time matter updates.
- Admin console with feature toggles and operational tooling.
- ConveySafe policy banners that detect off-platform contact attempts to preserve the evidentiary trail.

### Backend (Modern C++)
- **Gateway service** that exposes a REST façade for the frontend and delegates to gRPC services.
- **Identity service** for authentication, profile management, KYC webhook handling, and ConveySafe licence/insurance verification with digital badges.
- **Jobs service** for job listings, milestone tracking, chat, document exchange (via signed URLs + AV scans), and dispute resolution.
- **Payments service** that orchestrates escrow holds, releases, refunds, third-party PSP webhooks with idempotency safeguards, and ConveySafe loyalty pricing for trusted conveyancers.
- Shared protobuf contracts, request validation, and centralised logging/audit middleware.

### Infrastructure (Docker Compose)
- Postgres, Redis, MinIO (S3-compatible object storage), ClamAV, Nginx reverse proxy with TLS termination.
- Observability stack: OpenTelemetry Collector, Prometheus, Loki, Grafana (pre-configured dashboards).
- Makefile helpers and shell scripts for bootstrapping certificates and migrations.

---

## Architecture overview

```text
┌────────────┐      ┌─────────┐      ┌────────────┐
│  Frontend  │◀────▶│ Gateway │◀────▶│  Services  │
│ (Next.js)  │ HTTPS│  (C++)  │ gRPC │ Identity   │
└────────────┘      └─────────┘      │ Jobs       │
       ▲                ▲            │ Payments   │
       │                │            └────────────┘
       │                │                   ▲
       │                │                   │
       │           ┌────┴────┐    ┌─────────┴─────────┐
       │           │  Nginx  │    │  Postgres / Redis │
       │           └────┬────┘    └─────────┬─────────┘
       │                │                  ...
       ▼                ▼
   Browsers         Observability
                    (Prometheus, Grafana, Loki, OTel)
```

Each service communicates through well-defined gRPC APIs while the gateway offers a developer-friendly REST/JSON surface. Domain events (e.g. milestone funded) are captured and emitted for downstream analytics or automation hooks.

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

# 2. Generate self-signed TLS certificates for the local nginx proxy
bash infra/tls/dev_certs.sh

# 3. Build and start the full stack (frontend, backend, and infra)
docker compose --env-file .env -f infra/docker-compose.yml up -d --build

# 4. (Optional) Install dependencies if you plan to run the Next.js dev server locally
(cd frontend && npm install)

# 5. Sign in with the seeded administrator account using ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD
#    (passwords shorter than 12 characters will be accepted for local use but will log a warning)

# 6. Access the stack
# Frontend: https://localhost
# Admin portal: http://localhost:5300
# Grafana:  https://localhost/grafana (admin / admin)
```

> **Tip:** The compose file exposes the Postgres and MinIO ports so you can connect with preferred desktop tooling during development.

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
npm run dev           # Dev server with hot reload
npm run lint          # ESLint + TypeScript checks
npm run test          # Vitest component/API tests
```

### Admin portal (Next.js)

```bash
cd admin-portal
npm install
npm run dev           # Runs the dashboard on http://localhost:5300
```

> The first administrator account is provisioned from `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD{,_HASH}` in your environment. Set the same `JWT_SECRET` for both the public site and the admin portal so that sessions are shared.

Backend services emit structured JSON log lines to the repository-level `logs/` directory (override with the `LOG_DIRECTORY`
environment variable). The “System logs” view inside the admin portal surfaces the most recent entries per service so operators
can review workflow interactions without shell access. A consolidated `logs/errors.log` file now collects every error-level
event across services to simplify post-incident reviews.

### Backend (C++ services)

```bash
cd backend
cmake -S . -B build
cmake --build build
ctest --test-dir build
```

Run individual services locally by supplying the generated `.env` files or export the required environment variables before launching the binaries located in `build/bin/`.

### Infrastructure utilities

- `infra/tls/dev_certs.sh` – regenerate local certificates.
- `infra/docker-compose.yml` – runnable profile for local development.
- `infra/migrate.sh` – helper for running database migrations inside the compose stack.

---

## Testing strategy

| Layer | Tools | Notes |
|-------|-------|-------|
| Frontend | Vitest, Playwright (optional) | UI components, hooks, API client smoke tests. |
| Backend | GoogleTest, gRPC contract tests | Service unit tests, integration suites via dockerised dependencies. |
| End-to-end | Postman collection / k6 scripts | Exercise job lifecycle, escrow flows, and document uploads. |

CI pipelines should run linting, unit tests, and container builds. Load and security testing are recommended before production launches.

---

## Compliance & data residency

The Australian conveyancing context requires careful handling of trust money, licence coverage, and document retention. This starter includes:

- Guardrails for state-based licence requirements (e.g. only solicitors in QLD/ACT).
- Hooks for PSP escrow so the platform never directly holds trust money.
- Audit logging and immutable trails for regulatory reviews.
- References to NSW PI insurance obligations and ARNECC rules—see [`docs/compliance.md`](docs/compliance.md).

Always engage local counsel before production launches and configure region-aware storage for customer documents.

---

## Operations & observability

- **Metrics** via Prometheus with pre-made Grafana dashboards.
- **Logs** aggregated through Loki and accessible in Grafana’s Explore view.
- **Tracing** supported end-to-end via OpenTelemetry exporters embedded in each service.
- **Health checks** exposed on `/healthz` for REST and gRPC services to integrate with orchestrators.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for production hardening guidance (autoscaling, secret management, WAF, SSO, backups).

---

## Extending the platform

1. **Integrate vendors:** Implement the adapter interfaces in `backend/services/*/adapters` for your chosen PSP, KYC provider, and e-signature vendor.
2. **Custom business rules:** Extend domain models and protobuf definitions, regenerate stubs, and update the gateway mapping layer.
3. **Workflow automation:** Use the event bus hooks to push updates into CRMs, analytics platforms, or case management tools.
4. **Mobile & partner APIs:** Expose select gRPC methods through the gateway or stand up a dedicated partner API surface with OAuth scopes.

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
