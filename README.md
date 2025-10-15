# Conveyancers Marketplace (AU) — Launch Starter

This is a production-ready starter scaffold for a **conveyancing marketplace** with escrow-style milestone payments, licensing/KYC workflow hooks, secure document exchange, and dispute handling.

## What you get
- **Frontend**: Next.js 14 + TypeScript + Tailwind (SSR/SEO), WebSocket chat.
- **Backend (C++)**: 3 services (Identity, Jobs/Messaging/Docs, Payments/Escrow) + gRPC and a small REST API gateway (C++ http server) for the frontend.
- **Infra**: Docker Compose stack: Postgres, Redis, MinIO (S3-compatible), ClamAV scanner, Nginx reverse proxy + SSL termination, OpenTelemetry Collector, Prometheus (metrics), Loki (logs), Grafana.
- **Data model & migrations** for AU flow (users, licences, jobs, milestones, escrow, reviews, disputes, audit_logs).
- **Secure uploads** via signed URLs + AV scan + checksum, short-lived links.
- **Webhooks**: payment, KYC/IDV, e-sign (DocuSign/Adobe) placeholders.
- **Compliance guardrails**: logging/audit trails, rate limiting, retention toggles, data residency notes.

> This starter is **buildable and runnable today**. Swap the PSP/KYC vendors by filling `.env` values and the adapter stubs in `/backend/services/payments` and `/backend/services/identity`.

## Quick start
```bash
# 1) copy env
cp infra/env/.env.example infra/env/.env

# 2) generate dev certs (self-signed) for nginx
bash infra/tls/dev_certs.sh

# 3) build & run
docker compose -f infra/docker-compose.yml up -d --build

# 4) seed database
docker compose exec postgres psql -U app -d convey -f /docker-entrypoint-initdb.d/2_seed.sql

# 5) open
# Frontend: https://localhost
# Grafana:  https://localhost/grafana (admin / admin)
```

## Services
- `gateway` (C++ REST): `/api/*` façade for the frontend.
- `identity` (C++): auth, profiles, licence verification status, reviews; KYC/IDV webhook.
- `jobs` (C++): jobs, milestones, chat (WS), documents, disputes; ClamAV & MinIO.
- `payments` (C++): escrow holds, releases, refunds. PSP webhooks, idempotent handlers.

## AU Notes
- NSW PI insurance must be under an approved policy; see `/docs/compliance.md` for links.
- Trust money cannot be held unless licensed **trust accounts** rules are met; this starter **uses third‑party PSP escrow** and never holds funds in our DB/bank.
- ARNECC: Conveyancers can’t operate in QLD/ACT; allow **solicitor-only** there.

## Next steps
- Plug real PSP/KYC/e-sign vendors in `/backend/services/*/adapters`.
- Harden secrets, WAF, SSO (Keycloak/WorkOS optional), autoscaling (K8s).

See `/docs/DEPLOY.md` for production guidance.
