# Developer Onboarding Guide

Welcome to the Conveyancers Marketplace codebase. This guide orients new engineers, highlights the moving parts of the stack, and points to the workflows and tooling you will touch most frequently during day-to-day development.

## 1. Solution Overview
- **Public marketplace (`frontend/`)** – Next.js 14 app that serves conveyancer discovery, customer journeys, messaging, and verification flows. Relies on PostgreSQL via the shared `frontend/lib/db.ts` adapter and emits structured audit logs.
- **Operations console (`admin-portal/`)** – Next.js 14 app for compliance teams. Reuses the frontend’s libraries for authentication, data access, and logging. Surfaces audit trails, trust accounts, and system telemetry.
- **C++ gateway and demo services (`backend/`)** – Lightweight HTTP services (gateway, identity, jobs, payments) that simulate downstream integrations. The gateway exposes REST endpoints consumed by the Next.js apps and forwards to the demo services. Migrations and seed data live under `backend/sql/`.
- **Shared infrastructure (`infra/`)** – Docker Compose stack with Nginx, PostgreSQL, Redis, MinIO, ClamAV, and the application containers. TLS tooling sits in `infra/tls/`.
- **Reference material (`docs/`, `templates/`, `data/`)** – Deployment runbooks, compliance notes, seeded data extracts, and document templates for product specialists.

## 2. Repository Layout at a Glance
| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app, API routes, libs, Jest tests, and Tailwind UI components. |
| `admin-portal/` | Admin Next.js app, API routes, admin-specific components, Jest tests. |
| `frontend/lib/` | Shared TypeScript libraries (DB wrapper, observability, auth, OTP, KYC, trust accounts, notifications). Most backend logic for both apps lives here. |
| `backend/` | C++ sources: `gateway/`, `services/{identity,jobs,payments}/`, GoogleTest suites in `tests/`, common helpers in `common/`. |
| `infra/` | Docker Compose definition, Nginx config, TLS helper scripts. |
| `tooling/` | Utility scripts such as `load-env.js` for inspecting merged `.env` values. |
| `logs/` | Default location for aggregated service logs when `LOG_DIRECTORY` is configured to the repo root. |
| `docs/` | Feature reports, runbooks, compliance guidance, ERD diagrams. |
| `templates/` | Word templates for settlement workflows, useful for demos and tests. |

## 3. Environment & Configuration
1. **Prerequisites**
   - Node.js 20 LTS + npm 10
   - Docker Desktop 4.24+ (WSL2 enabled on Windows) or Docker Engine with Compose v2
   - CMake 3.26+ and Clang 15/GCC 12 for the C++ services (required when working on `backend/`)
   - OpenSSL for generating TLS assets (`infra/tls/dev_certs.sh`)

2. **Environment files**
   - Copy `.env.example` → `.env` and tailor credentials (Postgres, Redis, Twilio, SMTP, seed admin account).
   - Use `.env.local` to hold developer-specific overrides. `tooling/load-env.js` prints the final merged configuration consumed by the apps.
   - Critical secrets:
     - `JWT_SECRET` – shared across frontend + admin portal to keep sessions valid.
     - `CHAT_ENCRYPTION_KEY` – 32-byte base64/hex key for encrypting chat payloads (`frontend/lib/secure.ts`).
     - `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD{,_HASH}` – bootstrap the first admin user (`frontend/lib/adminSeed.ts`).
     - `DB_URL` – points to the Postgres instance (defaults to `postgres://app:change-me@localhost:5432/convey`).

3. **Log directory**
   - Set `LOG_DIRECTORY` to a shared path (for example `logs/` at the repo root) to keep frontend/admin/system logs aligned. Without this override, `withObservability` defaults to a package-local `logs/` subdirectory.

## 4. Running the Stack
### 4.1 Docker Compose (recommended for parity)
```bash
cp .env.example .env
bash infra/tls/dev_certs.sh          # Generate local certificates
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```
- Nginx proxies `https://localhost` (marketplace), `https://admin.localhost` (admin console), and `https://api.localhost` (C++ services).
- Postgres is seeded on first boot via `backend/sql/`.
- Logs are mounted into `./logs` (configure `LOG_DIRECTORY` accordingly for the Node services).

### 4.2 Frontend-only workflow
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```
- Uses the local Postgres URL from `.env`.
- API routes live in `frontend/pages/api/**` and share logic from `frontend/lib/**`.
- Sample flows: authentication (`/api/auth/login.ts`), messaging (`/api/chat`), verification (`/api/verification`).

### 4.3 Admin portal workflow
```bash
cd admin-portal
npm install
npm run dev          # http://localhost:5300
```
- Depends on the same Postgres schema. Import utilities from `frontend/lib/` for trust accounts, reviews, audit log, etc.
- System telemetry UI pulls from `/api/system-logs` (ensure log paths match).

### 4.4 C++ services
```bash
cd backend
cmake -S . -B build
cmake --build build
ctest --test-dir build
```
- `gateway/` exposes `/api/*` routes and proxies to `services/identity`, `services/jobs`, and `services/payments` using `httplib`.
- Service binaries are emitted to `build/bin/` and respect environment variables (`IDENTITY_HOST`, `PSP_PROVIDER`, etc.).
- Postgres migrations and seeds for the C++ services live in `backend/sql/`.

## 5. Data & Persistence
- **Primary store** – PostgreSQL accessed through `frontend/lib/db.ts`, which runs SQL migrations (`frontend/lib/migrations/`) and seeds demo content (customer profiles, conveyancer badges, product reviews, content pages).
- **Seed helpers** – `frontend/lib/adminSeed.ts` provisions the first admin; messaging/conversation helpers auto-create records. Trust account data is enriched via `frontend/lib/trustAccounts.ts`.
- **C++ schema** – `backend/sql/1_schema.sql` defines UUID-based models for the demo services; `2_seed.sql` populates identity, jobs, and payment fixtures.
- **Migrations** – new SQL should be added to `frontend/lib/migrations/` (Next.js apps) or `backend/sql/` (C++ services). Bump migration IDs lexicographically.

## 6. Authentication & Sessions
- JWT-based sessions are issued in `frontend/lib/session.ts`. Cookies default to `SameSite=Lax`, `HttpOnly`, and are named `session_token`/`refresh_token` (admin equivalents prefixed with `admin_`).
- Refresh token lifecycle lives in `frontend/lib/authTokens.ts` and is surfaced via `/api/auth/token`.
- Identity service fallback logic in `frontend/lib/services/identity.ts` allows offline/local authentication when the C++ identity microservice is unavailable.

## 7. Observability & Operations
- **API correlation** – Wrap handlers with `withObservability` to automatically log request metadata and correlation IDs.
- **Server logs** – `frontend/lib/serverLogger.ts` writes structured JSON logs per service. The admin console at `/system-logs` reads from `LOG_DIRECTORY`.
- **Metrics** – Admin API `/api/metrics` aggregates database counts and fetches gateway payment metrics (`admin-portal/lib/admin-metrics.ts`).
- **Notifications** – `frontend/lib/notifications.ts` integrates with SMTP and Twilio. Missing credentials raise `NotificationError` and emit structured log entries.
- **Security hooks** – File uploads (`frontend/pages/api/chat/upload.ts`) run through `frontend/lib/fileScanning.ts` for extension/mime/pattern checks; chat payloads are encrypted via `frontend/lib/secure.ts`.

## 8. Testing & Quality Gates
- **Frontend/admin** – Jest runs API-level tests under `__tests__/api/**`. Use `npm run test` in each project. `jest.setup.ts` configures common mocks. Consider adding component tests via Playwright or React Testing Library where helpful.
- **C++ services** – GoogleTest suites in `backend/tests/*.cpp`. Execute with `ctest --test-dir build`. Extend suites when changing gateway routing, persistence, or business logic.
- **Linting & formatting** – The codebase follows a semicolon-free, two-space TypeScript style. Configure your editor to respect `.editorconfig` and Prettier defaults. Use `clang-format` for C++ (see `backend/.clang-format`).
- **CI expectations** – Ensure database-dependent tests run against Postgres (Compose setup is the canonical environment). Document any new setup steps in `README.md` or this guide.

## 9. Common Workflows & Tips
- **Seeding admin access** – Update `ADMIN_SEED_*` in `.env`, restart the app, and check `users` table for the seeded admin row. Password hashes shorter than 12 chars are accepted for local development but log a warning.
- **Inspecting the database** – Use `psql "$DB_URL"` or DBeaver. The `customer_profiles` and `conveyancer_profiles` tables are auto-populated during `ensureInitialized()`.
- **Working with logs** – Align `LOG_DIRECTORY` across services so the admin console shows marketplace, admin, gateway, and nginx logs. When running locally without Docker, you can tail `frontend/logs/api-observability.log`.
- **Rotating secrets** – `tooling/load-env.js` is handy when debugging which secret a container sees. Update Compose, restart the relevant container, and verify via `/api/system-logs` or metrics.
- **External integrations** – The C++ payments service expects `PSP_PROVIDER` and `PSP_SECRET`; Redis/MinIO/ClamAV are stubbed via containers but can be pointed at real infrastructure for staging.

## 10. Deployment Pointers
- Production hardening notes live in `docs/DEPLOY.md`. Highlights: managed Postgres, TLS termination at Nginx, WAF + rate limiting, secrets rotation via your platform’s vault, and SIEM shipping for logs.
- Reference runbooks for signatures (`docs/signature-integration-runbook.md`), compliance (`docs/compliance.md`), and the feature matrix (`docs/feature-report.md`).
- When promoting builds:
  1. Ensure migrations are backwards compatible.
  2. Capture test evidence (Jest, `ctest`, smoke tests via Docker Compose).
  3. Update documentation if schema or workflow changes.

## 11. Where to Ask & Next Steps
- `CONTRIBUTING.md` covers branching and PR etiquette.
- `SECURITY.md` explains how to report vulnerabilities.
- Capture architectural questions or integration plans in `docs/` – feel free to add ADRs or runbooks.
- Pair up with an existing contributor to walk through the admin portal’s trust account and KYC flows; they touch the majority of the shared libraries.

Keep this guide close as you ramp – it links the code you will modify most frequently with the infrastructure and operational context that keeps Conveyancers Marketplace running smoothly.
