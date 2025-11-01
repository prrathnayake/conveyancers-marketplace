# Repository Guidelines

## Project Structure & Module Organization
The marketplace Next.js app lives in `frontend/`, the admin console in `admin-portal/`, and the C++ gateway plus demo services in `backend/` (`build/` for artifacts, `backend/tests/` for suites). Infrastructure (`infra/docker-compose.yml`, TLS scripts) sits in `infra/`, while `data/` seeds staged content, `templates/` stores notification layouts, and long-form references live in `docs/`.

## Build, Test, and Development Commands
`cd frontend && npm install && npm run dev` serves the marketplace on port 5173; use `npm run build` and `npm run start` for production bundles on 3000. Run the admin portal on port 5300 with the same script names from `admin-portal/`. Compile the C++ services via `cd backend && cmake -S . -B build && cmake --build build`, then run `ctest --test-dir build`. To exercise the integrated stack, generate certs with `bash infra/tls/dev_certs.sh` and run `docker compose --env-file .env -f infra/docker-compose.yml up -d --build`.

## Coding Style & Naming Conventions
Mirror the semicolon-free, two-space TypeScript used in `frontend/pages/api/auth/login.ts`. Keep components PascalCase, route folders lower-case (for example `pages/api/conveyancers`), and share helpers through `lib/` modules to avoid brittle paths. In C++, match the brace placement and camelCase identifiers in `backend/gateway/src/main.cpp`, guard headers, and keep new utilities under the existing namespaces (`gateway::`, `security::`).

## Testing Guidelines
Jest suites live in `frontend/__tests__/api` and `admin-portal/__tests__/api`; add files as `<feature>.test.ts` and run `npm run test` before submitting. Extend the GoogleTest coverage in `backend/tests/*_test.cpp` alongside new routes or persistence logic and re-run `ctest --test-dir build`. When you touch cross-service flows, add or update smoke checks such as `backend/tests/persistence_smoke_test.cpp`.

## Commit & Pull Request Guidelines
Commit messages stay short, imperative, and descriptive—see `Improve npm install resilience for frontend builds` in history. Reference issues in the body when useful and squash noisy fix-ups. PRs should outline scope, list the verification commands (`npm run test`, `ctest`, Docker smoke), attach screenshots or API transcripts for user-visible work, and link documentation or schema updates.

## Security & Configuration Tips
Copy `.env.example` to `.env`, keep secrets in `.env.local` or your secret store, and never commit credentials. Regenerate TLS assets through `infra/tls/dev_certs.sh` when hostnames change, and override `LOG_DIRECTORY` if you need custom log retention. Ensure both Next.js apps share the same `JWT_SECRET`, and rotate the seeded admin credentials after demos.
