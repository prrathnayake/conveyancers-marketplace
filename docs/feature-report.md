# Feature Implementation Report

This report captures the current implementation status of major capabilities in the Conveyancers Marketplace codebase. Status legend:

- ✅ Fully implemented and production-ready in the repository
- ⚠️ Implemented but dependent on external configuration or still simulation-heavy
- ❌ Not implemented in code

## Public Marketplace

### Identity & Accounts

| Feature | Status | Notes |
| --- | --- | --- |
| Credential-based login with refresh sessions | ✅ | Local auth falls back from the optional gateway, issues HTTP-only session and refresh cookies, and tracks verification state on sign-in.【F:frontend/lib/services/identity.ts†L53-L104】【F:frontend/lib/session.ts†L40-L185】 |
| Role-gated signup with seeded admin fallback | ✅ | Enforces buyer/seller/conveyancer roles, normalises phone numbers, hashes passwords, and seeds conveyancer profiles on registration.【F:frontend/lib/services/identity.ts†L168-L218】 |
| Email & SMS one-time password verification | ✅ | OTP issuance is rate limited, hashes codes, tracks attempts, and clears/updates verification timestamps when a code is confirmed.【F:frontend/lib/otp.ts†L21-L140】【F:frontend/pages/api/verification/request.ts†L6-L52】 |
| Conveyancer licence status tracking | ⚠️ | Stores conveyancer government verification metadata and toggles profile visibility, but relies on manual status updates or external orchestration to mark approvals.【F:frontend/lib/verification.ts†L46-L105】 |

### Discovery & Onboarding

| Feature | Status | Notes |
| --- | --- | --- |
| Conveyancer search with jurisdiction gating | ✅ | Text/state filters join reviews and hide QLD/ACT practitioners unless verified or viewed by an administrator.【F:frontend/pages/api/profiles/search.ts†L35-L118】【F:frontend/pages/api/profiles/[id].ts†L7-L155】 |
| Rich conveyancer profiles | ✅ | Serves biography, specialties, document badges, and job history while redacting contact details when jurisdiction rules apply.【F:frontend/pages/api/profiles/[id].ts†L73-L155】 |
| Job-linked review workflow | ✅ | Buyers and sellers can submit reviews only for completed/cancelled matters and duplicate reviews per job are rejected.【F:frontend/pages/api/reviews/index.ts†L12-L75】【F:frontend/lib/reviews.ts†L26-L129】 |
| Homepage content management | ✅ | Admin API lets operators update hero, persona, workflow, resource, FAQ, copy, and CTA sections backed by database storage.【F:admin-portal/pages/api/homepage.ts†L18-L135】 |

## Secure Collaboration & Engagement

| Feature | Status | Notes |
| --- | --- | --- |
| End-to-end encrypted messaging with policy guardrails | ✅ | Messages are AES-encrypted per conversation, attachments are scanned, and policy/ML detectors flag sensitive or off-platform content.【F:frontend/pages/api/chat/messages.ts†L1-L238】【F:frontend/pages/api/chat/upload.ts†L1-L109】【F:frontend/lib/fileScanning.ts†L3-L101】【F:frontend/lib/ml/sensitive.ts†L1-L103】 |
| Escrow-style invoicing with PSP hooks | ⚠️ | Supports creation, acceptance, release, and refunds with retries and admin alerts, but requires configuring a real PSP provider/secret to avoid mock responses or failures.【F:frontend/pages/api/chat/invoices.ts†L1-L520】【F:frontend/lib/psp.ts†L25-L165】 |
| Voice/video call scheduling | ⚠️ | Generates join URLs and tokens for conversation participants, yet only stubs an external meeting service without real integrations.【F:frontend/pages/api/chat/calls.ts†L1-L111】 |
| AI concierge chat & escalation summary | ⚠️ | Chat sessions persist scripted assistant/cat personas and summarise transcripts for escalation, but responses are deterministic templates rather than LLM-backed.【F:frontend/lib/aiChat.ts†L1-L225】【F:frontend/lib/aiResponder.ts†L5-L90】 |

## Financial Operations

| Feature | Status | Notes |
| --- | --- | --- |
| Trust account register & payout integrity | ✅ | Admins can register, reconcile, and list trust accounts, while payout reports are hash-chained for tamper evidence and logged with correlation IDs.【F:frontend/lib/trustAccounts.ts†L5-L149】【F:admin-portal/pages/api/trust-accounts.ts†L1-L64】 |
| Operations metrics dashboard | ⚠️ | Aggregates checkout, payment, invoice, and account stats but depends on the optional payments service API responding within the timeout window.【F:admin-portal/pages/api/metrics.ts†L84-L170】 |
| Chat-linked escrow payments | ⚠️ | Invoice acceptance, capture, and refund steps call the PSP adapter and notify admins on failure; production use still needs live PSP credentials/endpoints.【F:frontend/pages/api/chat/invoices.ts†L216-L520】【F:frontend/lib/psp.ts†L25-L165】 |

## Compliance & Safety

| Feature | Status | Notes |
| --- | --- | --- |
| Correlated API observability | ✅ | API handlers emit structured log lines with correlation IDs, durations, and error payloads to a shared log file.【F:frontend/lib/observability.ts†L8-L91】 |
| Admin audit log | ✅ | Administrative mutations persist immutable audit entries tied to the acting user and entity identifiers.【F:frontend/lib/audit.ts†L1-L11】 |
| System log viewer | ✅ | Admin portal parses JSON and Nginx access logs from mounted volumes with sanitisation to prevent path traversal.【F:admin-portal/pages/api/system-logs.ts†L1-L200】 |
| Notification pipelines | ⚠️ | Email/SMS helpers validate SMTP and Twilio credentials and raise structured errors when configuration is incomplete or delivery fails.【F:frontend/lib/notifications.ts†L1-L200】 |

## Admin & Operations

| Feature | Status | Notes |
| --- | --- | --- |
| User administration & invitations | ✅ | Admin endpoints list, create, update, and suspend users with role filters, seeded profile scaffolding, audit recording, and secure password generation.【F:admin-portal/pages/api/users.ts†L1-L200】 |
| Signature orchestration & audit trails | ⚠️ | Envelope creation/completion is abstracted over pluggable e-sign providers with hashed audit ledgering, yet defaults to a mock provider unless external credentials are supplied.【F:admin-portal/pages/api/signatures/index.ts†L1-L108】【F:frontend/lib/signatures.ts†L1-L200】【F:frontend/lib/esign.ts†L1-L120】 |

## Platform & Infrastructure

| Feature | Status | Notes |
| --- | --- | --- |
| Postgres-backed data layer with migrations | ✅ | Shared database utility manages a pooled connection, migration ledger, and compatibility with legacy schema helpers.【F:frontend/lib/db.ts†L1-L105】 |
| Docker Compose stack | ✅ | Orchestrates Nginx TLS termination, Postgres, both Next.js apps, and the optional C++ gateway/services with shared environment configuration.【F:infra/docker-compose.yml†L1-L119】 |

## Optional Service Tier (C++ Demos)

| Feature | Status | Notes |
| --- | --- | --- |
| Gateway facade | ⚠️ | Provides auth and profile proxying with request ID propagation and metrics, but primarily forwards to the identity demo and is not required for the Next.js flows.【F:backend/gateway/src/main.cpp†L1-L70】 |
| Identity and payments microservices | ⚠️ | C++ services expose seeded identity, jobs, and escrow APIs over HTTP/Postgres; suitable for demos yet operate on in-memory/postgres fixtures without hardening for production workloads.【F:backend/services/identity/main.cpp†L1-L120】【F:backend/services/payments/main.cpp†L1-L150】 |

