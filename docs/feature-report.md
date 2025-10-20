# Feature Gap Assessment

This report summarises the functionality that actually ships in the repository and highlights areas that still rely on simulation or manual intervention. It supersedes the aspirational matrix that accompanied the original brief.

## Architecture snapshot

- The public marketplace and admin portal are both Next.js applications that share authentication, audit helpers, and the same SQLite database for persistence.【F:frontend/lib/db.ts†L1-L118】【F:admin-portal/pages/api/users.ts†L1-L120】
- Demo C++ services (gateway, identity, jobs, payments) run as standalone HTTP servers with in-memory state. They expose `/healthz` and `/metrics` endpoints but are not wired into the production UI flows.【F:backend/gateway/src/main.cpp†L44-L88】【F:backend/services/jobs/main.cpp†L2037-L2058】
- Docker Compose provisions Nginx for TLS termination, the two Next.js apps, PostgreSQL (for future expansion), and the optional demo services. Legacy dependencies such as Redis, MinIO, ClamAV, and the observability stack have been removed from the default profile because nothing in the code consumes them.【F:infra/docker-compose.yml†L8-L186】【F:.env.example†L43-L52】

## Feature matrix

| Area | Status | Notes |
| --- | --- | --- |
| Authentication & session management | Available | `/api/auth/login` issues session + refresh cookies backed by hashed refresh tokens, and seeds an admin account on first use.【F:frontend/pages/api/auth/login.ts†L1-L57】【F:frontend/lib/authTokens.ts†L1-L44】 |
| Profile discovery & compliance gating | Available | Search endpoints filter conveyancers, while profile payloads enforce QLD/ACT restrictions unless the viewer is verified or an admin.【F:frontend/pages/api/profiles/search.ts†L1-L86】【F:frontend/pages/api/profiles/[id].ts†L7-L148】 |
| Secure messaging & invoice tracking | Available | Chat APIs encrypt/decrypt messages, flag off-platform hints, and maintain escrow-style invoice records per conversation.【F:frontend/pages/api/chat/messages.ts†L1-L143】【F:frontend/pages/api/chat/messages.ts†L144-L236】 |
| Admin operations & audit logging | Available | Admin APIs manage users, capture audit events, and surface operational logs inside the dashboard.【F:admin-portal/pages/api/users.ts†L1-L120】【F:frontend/lib/audit.ts†L1-L13】【F:admin-portal/pages/system-logs.tsx†L1-L196】 |
| Trust accounts & reconciliation | Available | Admin endpoints register and reconcile trust accounts while persisting hashed payout reports for later verification.【F:admin-portal/pages/api/trust-accounts.ts†L1-L60】【F:frontend/lib/trustAccounts.ts†L1-L84】 |
| Notifications & alerts | Partial | Email/SMS helpers exist but silently no-op when SMTP or Twilio credentials are absent, so production alerting requires additional hardening.【F:frontend/lib/notifications.ts†L15-L66】 |
| Observability | Partial | API routes append structured logs with correlation IDs, and demo services expose metrics endpoints, but there is no bundled log aggregation or alerting pipeline.【F:frontend/lib/observability.ts†L1-L60】【F:backend/common/security.h†L318-L356】 |
| External integrations (PSP, KYC, e-signature) | Missing | Workflows are fully simulated inside the Next.js codebase; no network calls to vendors are present, so deploying to production requires implementing real adapters.【F:admin-portal/pages/api/signatures.ts†L1-L80】 |

## Key recommendations

1. Wire real email and SMS providers by supplying credentials and surfacing delivery failures instead of silently skipping sends.【F:frontend/lib/notifications.ts†L15-L66】
2. Introduce automated test suites (API, UI, and C++ demos) before extending the platform to catch regressions early.【F:README.md†L239-L241】
3. Replace the simulated integrations under `frontend/pages/api` and `admin-portal/pages/api` with adapters to your production systems so compliance workflows rely on real data rather than seeded fixtures.【F:admin-portal/pages/api/users.ts†L1-L120】【F:frontend/pages/api/profiles/[id].ts†L7-L148】
4. Add centralised logging/monitoring if you plan to operate the optional C++ services beyond demos; today only file-based logs and authenticated metrics endpoints are provided.【F:frontend/lib/observability.ts†L1-L60】【F:backend/common/security.h†L318-L356】
