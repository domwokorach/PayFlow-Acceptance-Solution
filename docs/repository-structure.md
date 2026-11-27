# Repository structure

Describes the platform layout. Items marked **(snapshot)** exist only in `infrastructure/jenkins/local-repo/payflow.git` (commit `0b3e087`) and are not in the working tree; see the README's "Repository status". Generated directories (`node_modules`, `.next`, `coverage`, `reports`, `backend/target`) and secrets are omitted.

## Frontend (`frontend/`, nested Git repository)

| Path | Purpose |
|---|---|
| `proxy.ts` | Next.js page gate: redirects to `/login` without a valid session; 503 on bad configuration |
| `app/page.tsx` | Dashboard overview |
| `app/payments`, `merchants`, `connectors`, `analytics`, `reconciliation`, `developers`, `settings` | One page each |
| `app/login/page.tsx` | Sign-in page |
| `app/api/[...path]/route.ts` | Allowlisted proxy to the backend (adds `X-Api-Key`) |
| `app/api/events/stream/route.ts` | Streaming SSE proxy |
| `app/api/auth/{login,logout,session}/route.ts` | Dashboard sign-in endpoints |
| `app/api/health/route.ts` | Liveness and readiness probe |
| `app/layout.tsx`, `components/Providers.tsx` | Root layout, theme and query providers |
| `components/shell/` | `AppShell` (navigation, header), `nav.ts` |
| `components/payments/` | Table, drawer, create and refund dialogs |
| `components/merchants/EditMerchantDialog.tsx` | Merchant profile editor |
| `components/notifications/` | Provider, toast, centre, animated icons |
| `components/charts/charts.tsx` | Recharts wrappers |
| `components/ui/` | Shared UI kit (metric card, status chip, panels, states, filters) |
| `components/auth/LoginForm.tsx` | Login form |
| `hooks/` | `useCountUp`, `useNotification` |
| `lib/api.ts`, `data.tsx`, `types.ts`, `summary.ts`, `analytics.ts`, `merchants.ts` | Client data layer |
| `lib/live.ts` | SSE client with reconnect and resume |
| `lib/theme.ts` | MUI theme and design tokens |
| `lib/notifications/` | Notification types and helpers |
| `lib/server/` | Server-only: `config`, `session`, `policy`, `upstream`, `auth`, `login-limit`, `log` |
| `tests/` | 12 Vitest files |
| `Dockerfile`, `.env.example`, `.nvmrc`, `.npmrc`, `package.json`, `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts` | Build, runtime and tooling configuration |
| `docs/deployment.md` | Vercel deployment notes |

## Backend (snapshot: `backend/`)

| Path | Purpose |
|---|---|
| `pom.xml`, `Dockerfile` | Maven build (Spring Boot 4.1.2, Java 21, `ci` profile with JaCoCo) and image |
| `api/` | `PaymentController`, `MerchantController`, `EventController`, `ApiExceptionHandler` |
| `core/` | `PaymentService`, `PaymentPolicy`, `Idempotency`, `Ledger`, `MerchantService`, `DashboardService`, `ReconciliationService`, `AuditLog` |
| `events/` | `DomainEvent`, `EventPublisher`, `EventStream` (outbox and SSE) |
| `security/` | `SecurityConfig`, `ApiKeyService`, `ApiKeyBootstrap`, `ApiKeyAuthentication`, `MerchantContext` |
| `visa/` | Gateway, JWT signer, workflow, pending-operation reconciler, properties and simulator |
| `infra/DemoSeeder.java` | Synthetic data (`demo` profile) |
| `resources/application.yml` | Configuration |
| `resources/db/migration/V1`–`V5` | Schema, Visa sandbox, events and audit, API keys, merchant profile |
| `src/test/` | 13 test classes (unit and integration) |

On disk, `backend/` holds only `target/` (built jar and Surefire reports).

## Infrastructure (snapshot unless noted)

| Path | Purpose |
|---|---|
| `docker-compose.yml` | postgres, backend, frontend, optional observability |
| `Jenkinsfile` | Declarative CI pipeline |
| `.github/workflows/checks.yml` | GitHub Actions checks |
| `.gitleaks.toml`, `infrastructure/ci/gitleaks-logs.toml` | Secret-scanning configuration |
| `infrastructure/ci/` | `e2e.sh`, `docker-compose.e2e.yml`, `e2e_payment_flow.py`, `verify_reports.py`, `coverage_gate.py`, `dependency-scan.sh`, `repo-hygiene.sh` |
| `infrastructure/jenkins/` | `docker-compose.yml`, `controller/`, `agent/`, `casc/jenkins.yaml`, `bootstrap.sh`, `make-local-repo.sh`. **On disk:** `local-repo/payflow.git` and a git-ignored `.env` |
| `observability/` | Prometheus, OTel Collector and Grafana provisioning and dashboard |
| `scripts_smoke_test.py`, `scripts_visa_live_smoke.py` | Smoke tests (the Visa one is opt-in) |
| `docs/architecture.md`, `jenkins-setup.md`, `roadmap.md`, `test-strategy.md`, `visa-sandbox.md` | Earlier project documents in the snapshot |

## Root, documentation and assets (working tree)

| Path | Purpose |
|---|---|
| `README.md`, `SECURITY.md`, `LICENSE.md`, `COPYRIGHT` | Project documents |
| `docs/api-reference.md`, `docs/repository-structure.md` | This documentation set |
| `docs/images/` | `payments.png`, `merchants.png`, `developers.png`, `jenkins-ci-cd-pipeline.{png,webp}` |
| `docs/logo-readme.png`, `public/logo.png` | Logo |
| `docs/Screenshot 2026-11-16 at *.png` | Three unnamed screenshots, kept unchanged |
| `app/`, `components/`, `lib/`, `tests/`, `Dockerfile`, `.env.example` | **Older duplicate** of the dashboard at the repository root |
