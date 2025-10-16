# Feature Gap Assessment

This document benchmarks the current codebase against the requested feature catalogue. Status values are:

- **Available** – implemented in code or configuration.
- **Partial** – scaffolded or simulated, but missing critical integrations or automation.
- **Missing** – no supporting implementation beyond documentation intent.

## Detailed Matrix

| Category | Feature / Module | Status | Evidence & Gap Summary |
| --- | --- | --- | --- |
| User Onboarding & Identity | Multi-Role Registration | Missing | Identity service only exposes a profile search endpoint backed by static data; there are no signup, role provisioning, or verification flows yet.【F:backend/services/identity/main.cpp†L24-L113】 |
| User Onboarding & Identity | Know-Your-Customer (KYC) | Missing | Profiles are hard-coded with no linkage to external KYC/AML providers or webhook handling, leaving compliance workflows unimplemented.【F:backend/services/identity/main.cpp†L24-L30】 |
| User Onboarding & Identity | Two-Factor Authentication (2FA) | Missing | Shared security helper validates API keys and roles only; there is no second-factor challenge for any actor types.【F:backend/common/security.h†L16-L45】 |
| Conveyancer Profile Management | Profile Creation | Missing | Because the identity API is read-only, conveyancers cannot create or update rich profiles through the current service surface.【F:backend/services/identity/main.cpp†L83-L113】 |
| Conveyancer Profile Management | Licence & Insurance Verification | Partial | Searches filter out unverified practitioners in QLD/ACT, but no evidence of licence registry checks or insurance expiry enforcement exists yet.【F:backend/services/identity/main.cpp†L42-L109】 |
| Conveyancer Profile Management | Geographic Restrictions | Partial | Hard-coded guardrails prevent unverified QLD/ACT practitioners from appearing, yet full jurisdiction gating and admin overrides are absent.【F:backend/services/identity/main.cpp†L42-L109】 |
| Search & Discovery | Directory & Filters | Available | `/profiles/search` supports keyword, state, and verified filters with JSON responses designed for directory listings.【F:backend/services/identity/main.cpp†L83-L113】 |
| Search & Discovery | Profile View | Partial | Search payloads expose basic verification flags but omit historical jobs, ratings, or document badges envisioned for full bios.【F:backend/services/identity/main.cpp†L64-L113】 |
| Search & Discovery | SEO & CMS | Partial | The README confirms SSR-ready Next.js and an admin console scaffold, yet there is no CMS editing or SEO metadata governance described in code.【F:README.md†L30-L35】 |
| Communication & Document Exchange | Secure Messaging | Available | Marketplace clients exchange encrypted chat threads with pagination, attachment metadata, and role-aware access controls via the Next.js API and UI.【F:frontend/pages/api/chat/messages.ts†L1-L116】【F:frontend/pages/chat.tsx†L1-L212】 |
| Communication & Document Exchange | File Upload & Scanning | Partial | Participants can upload documents through the secure chat flow with at-rest encryption, yet no antivirus scanning or external storage tier is wired in.【F:frontend/pages/api/chat/upload.ts†L1-L95】 |
| Communication & Document Exchange | Electronic Signatures | Missing | Documents carry a `requires_signature` flag without any DocuSign/AdobeSign orchestration or audit trail persistence.【F:backend/services/jobs/main.cpp†L30-L195】 |
| Job Management | Job Creation | Missing | The jobs microservice only surfaces GET routes; there are no endpoints to open engagements or capture property briefs.【F:backend/services/jobs/main.cpp†L235-L334】 |
| Job Management | Milestones & Quotes | Partial | Milestone structures with escrow indicators are available, yet quote authoring, deadline workflows, and notifications are not automated.【F:backend/services/jobs/main.cpp†L52-L281】 |
| Payments & Escrow | Escrow Setup | Available | Payments service can create escrow holds with validation, mirroring integration points for a regulated PSP.【F:backend/services/payments/main.cpp†L179-L215】 |
| Payments & Escrow | Trust Account Payouts | Partial | Release endpoints transition holds to a released state, but there is no linkage to conveyancer trust accounts or compliance reporting.【F:backend/services/payments/main.cpp†L233-L259】 |
| Payments & Escrow | Invoicing & Fees | Missing | Payment flows stop at hold/release/refund and never generate GST-compliant invoices or fee breakdowns.【F:backend/services/payments/main.cpp†L179-L287】 |
| Work Execution | Task Tracking | Partial | Milestones provide progress snapshots, although there is no assignment, reminders, or collaborative editing of tasks.【F:backend/services/jobs/main.cpp†L52-L280】 |
| Work Execution | Document Management | Partial | Document listings with status metadata exist, yet version control, encryption policies, and access checks are not wired in.【F:backend/services/jobs/main.cpp†L30-L324】 |
| Completion & Feedback | Job Completion | Missing | No API handles completion sign-off or automated escrow release; job statuses remain static without lifecycle transitions.【F:backend/services/jobs/main.cpp†L52-L334】 |
| Completion & Feedback | Reviews & Ratings | Missing | Profile payloads omit any rating or review fields, and no review endpoints are defined in the services.【F:backend/services/identity/main.cpp†L64-L109】 |
| Dispute & Support | Dispute Workflow | Missing | Jobs service lacks endpoints for dispute submission, evidence uploads, or adjudication state changes.【F:backend/services/jobs/main.cpp†L235-L334】 |
| Dispute & Support | Customer Support | Missing | There is no administrative API for impersonation, KYC overrides, or 2FA resets beyond descriptive documentation.【F:backend/services/identity/main.cpp†L83-L113】 |
| Admin Panel | User Management | Partial | The README references an admin console scaffold, but backend APIs for verifying/deactivating users are not implemented.【F:README.md†L30-L35】【F:backend/services/identity/main.cpp†L83-L113】 |
| Admin Panel | Enquiry Audit Search | Available | Admin operators can search chat transcripts, review participants, and download attachments directly from the control panel when handling escalations.【F:admin-portal/pages/enquiries.tsx†L1-L162】【F:admin-portal/pages/api/enquiries.ts†L1-L161】 |
| Admin Panel | Compliance Monitoring | Missing | No service emits licence or insurance alerts; only static reminders appear in documentation without automation.【F:docs/compliance.md†L1-L5】 |
| Admin Panel | Audit Logging | Partial | Services log request metadata via shared helpers, but immutable append-only audit storage is not in place.【F:backend/common/security.h†L26-L45】 |
| Infrastructure & Architecture | Frontend | Partial | The README outlines a Next.js + Tailwind stack fronted by Nginx, yet feature depth (filters, chat UI, CMS) is not verifiable in code excerpts.【F:README.md†L30-L47】 |
| Infrastructure & Architecture | Backend Microservices | Available | Gateway plus identity, jobs, and payments services are documented and implemented with REST endpoints.【F:README.md†L36-L41】【F:backend/services/jobs/main.cpp†L235-L334】【F:backend/services/payments/main.cpp†L179-L293】 |
| Infrastructure & Architecture | Databases | Partial | Compose targets for Postgres/Redis/MinIO are described, but runtime code still uses in-memory stores pending real adapters.【F:README.md†L43-L47】【F:backend/services/jobs/main.cpp†L52-L117】【F:backend/services/payments/main.cpp†L59-L125】 |
| Infrastructure & Architecture | Observability | Partial | Observability stack is documented, yet service code lacks explicit OpenTelemetry exporters or metrics emission.【F:README.md†L43-L47】【F:README.md†L197-L199】 |
| Infrastructure & Architecture | Deployment | Available | Docker Compose workflow with TLS scripts and env templates is fully documented for local deployment.【F:README.md†L91-L166】 |
| Security & Compliance | Authentication | Partial | API key plus role headers enforce basic RBAC, but JWT issuance and refresh token lifecycles are absent.【F:backend/common/security.h†L16-L45】 |
| Security & Compliance | Data Security | Partial | Sensitive runtime secrets have been externalised into environment configuration and the frontend now fails fast when `JWT_SECRET` is unset, but transport encryption and at-rest controls remain unimplemented.【F:infra/.env.example†L1-L32】【F:frontend/lib/session.ts†L20-L29】 |
| Security & Compliance | Privacy | Missing | Code lacks consent capture, erasure workflows, or privacy policy acknowledgements beyond high-level notes.【F:backend/services/identity/main.cpp†L83-L113】 |
| Security & Compliance | Licensing & Trust Compliance | Partial | Documentation highlights state restrictions and escrow best practices, but automated validation and trust account reconciliation are not implemented.【F:docs/compliance.md†L1-L5】【F:backend/services/payments/main.cpp†L233-L287】 |
| Security & Compliance | Record Retention | Missing | Retention policies are mentioned as a configuration idea without any archival or anonymisation routines in code.【F:docs/compliance.md†L1-L5】 |
| Performance & Monitoring | Metrics & Alerts | Missing | README references Prometheus, but the services emit no metrics or alerting hooks yet.【F:README.md†L197-L199】【F:backend/services/jobs/main.cpp†L235-L334】 |
| Performance & Monitoring | Logging & Tracing | Partial | Basic request logging is enabled, though distributed tracing identifiers or secure log retention are not wired up.【F:backend/common/security.h†L26-L45】 |

## Key Recommendations

1. Prioritise identity and compliance foundations (registration, KYC, 2FA) to unlock onboarding flows before extending job automation.
2. Replace in-memory fixtures with persistent adapters for profiles, jobs, documents, and payments so that observability and retention controls become meaningful.
3. Layer dedicated services or integrations for DocuSign/AdobeSign, PSP escrow, and anti-virus scanning to deliver the regulated experience outlined in the requirements.
