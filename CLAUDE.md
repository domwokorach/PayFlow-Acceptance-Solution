# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PayFlow is a local-sandbox payment acceptance platform: Spring Boot 4 / Java 21 REST API (`backend/`), PostgreSQL + Flyway, and a Next.js 16 / React 19 / MUI merchant dashboard (`frontend/`). Payments are simulated (optionally routed to the Visa Acceptance sandbox). It must not be deployed publicly (default demo key, no user login).

`frontend/` is a **nested git repository** (it has its own `.git`; the parent tracks it as a gitlink at mode 160000 with no `.gitmodules`). Commit frontend changes inside `frontend/` separately from the parent repo; the parent only records the pointer.

## Commands

Full stack (Docker Desktop required): `docker compose up --build` → dashboard http://localhost:3000, health http://localhost:8080/actuator/health. Use `PAYFLOW_VISA_ENABLED=false` for simulator only. `docker compose down -v` wipes the DB. Use `127.0.0.1` rather than `localhost` if another app owns port 8080.

Backend (`cd backend`):
- `mvn test`: all tests (integration tests use Testcontainers, so Docker must be running; Visa is mocked)
- `mvn test -Dtest='!*IntegrationTest'`: unit only, no Docker
- `mvn test -Dtest='*IntegrationTest'`: integration only
- `mvn test -Dtest=PaymentPolicyTest#methodName`: single test
- `SPRING_PROFILES_ACTIVE=demo mvn spring-boot:run`: run locally (needs a local Postgres `payflow`/`payflow`/`payflow_local`)

Frontend (`cd frontend`, Node **24** pinned via `.nvmrc`, `engine-strict`, so `nvm use` first):
- `npm run lint` (= `tsc --noEmit && eslint .`), `npm run typecheck`, `npm run lint:eslint`
- `npm test` (vitest run), `npx vitest run tests/<file>.test.tsx` for one file, `npm run test:watch`
- `npm run test:ci` (coverage + `reports/junit.xml`), `npm run build`
- Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock; the default environment is `node`.

End-to-end smoke tests against a running stack: `python3 scripts_smoke_test.py`; Visa sandbox (needs your own creds in `.env`): `python3 scripts_visa_live_smoke.py`.

CI: `Jenkinsfile` (isolated Docker-in-Docker agent under `infrastructure/jenkins/`, helpers in `infrastructure/ci/`; see `docs/jenkins-setup.md`) and `.github/workflows/checks.yml` run the same checks. Jenkins enforces minimum test counts via `verify_reports.py` (a deleted or skipped test fails the build). Neither deploys.

## Architecture

Backend packages under `backend/src/main/java/dev/payflow/`:
- `api/`: controllers (`PaymentController`, `MerchantController`, `EventController` for SSE) and `ApiExceptionHandler`
- `core/`: `PaymentService` (state machine, owns the transaction boundary), `PaymentPolicy`, `Idempotency`, `Ledger`, `AuditLog`, `DashboardService`, `ReconciliationService`, `MerchantService`
- `visa/`: provider integration. `VisaPaymentWorkflow` orchestrates; `VisaAcceptanceGateway` is the live sandbox client (JWT-signed via `VisaJwtSigner`); `VisaSandboxGateway` is the stub; `PendingReconciler` resolves pending captures/refunds
- `events/`: transactional outbox (`domain_events`) plus in-process SSE fan-out
- `security/`: per-merchant API-key auth (Spring Security)
- `infra/DemoSeeder`: synthetic data, only with `PAYFLOW_SEED_DEMO_DATA=true` / `demo` profile
- Schema is in `db/migration/V*.sql` (Flyway); add new migrations as the next `V<n>__`.

Invariants that span several files:
- **Money** is integer minor units (`12500` = £125.00), GBP only, never floats.
- **Atomicity:** a payment status change, its two ledger entries (one debit, one credit; refunds reverse them) and its `domain_events` row are written in one DB transaction. SSE is pushed only **after commit**, so rollbacks emit nothing.
- **Idempotency:** every POST needs an `Idempotency-Key` (8–128 chars `[A-Za-z0-9_-]`), unique per merchant, serialized with `SELECT … FOR UPDATE`, with a request fingerprint. The same key and body replays the current projection; the same key with a different body returns 409.
- **Multi-tenancy:** API keys are stored as SHA-256 digests in `api_keys`. Every query, idempotency key, ledger/audit row, aggregate and SSE stream is scoped to the key's merchant; another merchant's resource ids return 404, not 403. Keys are accepted as `X-Api-Key`, `Authorization: Bearer`, or legacy `X-Demo-Api-Key`. Keys removed from `PAYFLOW_DEMO_API_KEY`/`PAYFLOW_BOOTSTRAP_KEYS` are revoked at startup.
- **Visa semantics:** financial POSTs to Visa are never retried; read-only status lookups retry transient failures twice. A 4xx (except 408/429) is a definitive rejection. Timeouts, 429 and 5xx leave the outcome unknown (`REVIEW_REQUIRED`), which is never retried automatically.
- SSE fan-out is in-process, so it only works with a single backend instance.

Frontend (`frontend/`, Next.js App Router): pages are in `app/` (payments, merchants, connectors, analytics, reconciliation, developers, settings, login). The browser never holds an API key. A Next server proxy (`app/api/[...path]`, plus a dedicated streaming proxy at `app/api/events/stream`, with `proxy.ts` and session policy) adds the key server-side. Data comes through TanStack Query; the SSE hook drives live status (`Live` only after the `ready` frame, with backoff reconnect and a full refetch on `resync`). There are deliberately no optimistic updates: UI status is only what the backend has committed.

Optional observability (`docker compose --profile observability up`): Prometheus, Grafana and an OTel collector config in `observability/`.

More detail in `docs/architecture.md`, `docs/test-strategy.md`, `docs/frontend-testing.md`, `docs/visa-sandbox.md`, `docs/roadmap.md`.
