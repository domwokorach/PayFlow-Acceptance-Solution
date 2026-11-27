<p align="center">
  <img src="docs/logo-readme.png" alt="PayFlow Acceptance Solution" width="320">
</p>

## Jenkins CI/CD Pipeline

PayFlow integrates Jenkins for continuous integration
and delivery pipeline orchestration, validation and
CI/CD readiness.

<p align="center">
  <picture>
    <source srcset="docs/images/jenkins-ci-cd-pipeline.webp" type="image/webp">
    <img
      src="docs/images/jenkins-ci-cd-pipeline.png"
      alt="Jenkins Stages view showing PayFlow-CI-CD build #1 completed successfully in 7.8 seconds"
      width="100%"
    />
  </picture>
</p>

<p align="center">
  <em>PayFlow CI/CD — Successful Jenkins pipeline execution.</em>
</p>

**Pipeline:** PayFlow-CI-CD · **Build:** #1 · **Status:** Successful · **Execution time:** 7.8 seconds

**Stages shown:** Initialisation, Pipeline Validation, CI/CD Readiness, Complete, Post Actions.

This build shows the Jenkins job running end to end through its validation and readiness stages. It does not show automated tests, Docker builds or deployments, so none of those is claimed as passed by this run.

<h1 align="center">PayFlow Acceptance Solution</h1>

<p align="center">
  A modern fintech sandbox platform for payment processing, merchant management, analytics, reconciliation, and REST API integrations.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue">
  <img alt="License" src="https://img.shields.io/badge/license-proprietary-lightgrey">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6">
  <img alt="Environment" src="https://img.shields.io/badge/environment-sandbox-orange">
  <img alt="CI/CD: Jenkins" src="https://img.shields.io/badge/CI%2FCD-Jenkins-D24939?logo=jenkins&logoColor=white">
  <img alt="Pipeline: passing" src="https://img.shields.io/badge/pipeline-passing-brightgreen">
  <img alt="Build: success" src="https://img.shields.io/badge/build-success-brightgreen">
  <img alt="Automation: Jenkins" src="https://img.shields.io/badge/automation-Jenkins-D24939?logo=jenkins&logoColor=white">
  <img alt="Pipeline status: validated" src="https://img.shields.io/badge/pipeline-validated-brightgreen">
</p>

> **Sandbox only.** PayFlow runs locally with simulated payments. No real money moves. It is **not production-ready**, has **not been certified** for live payment processing (including PCI DSS), and must not be used with real card data or deployed publicly. See [Security and sandbox limitations](#security-and-sandbox-limitations).

## Overview

| | |
|---|---|
| **Product** | PayFlow Acceptance Solution |
| **Package** | `payflow-dashboard` |
| **Version** | `1.0.0` |
| **Category** | Fintech / payment acceptance |
| **Environment** | Local sandbox, simulated payments |

This repository contains the PayFlow dashboard: a Next.js application that gives operators a live view of payment activity (authorizations, captures, declines and refunds), merchant profiles, provider health, analytics and reconciliation. It talks to a PayFlow REST API (PostgreSQL-backed, run as a separate service) through a server-side proxy, so API and provider credentials never reach the browser.

## Application Screenshots

### Payments Dashboard

![PayFlow Payments Dashboard](docs/images/payments.png)

### Developers Dashboard

![PayFlow Developer Dashboard](docs/images/developers.png)

### Merchants Dashboard

![PayFlow Merchant Dashboard](docs/images/merchants.png)

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | Material UI, Emotion, Recharts, Motion |
| Data fetching | TanStack Query, Server-Sent Events for live updates |
| Backend (separate service) | REST API at `/api/v1/*` |
| Database | PostgreSQL (owned by the backend) |
| Testing | Vitest, Testing Library, jsdom, V8 coverage |
| Tooling | ESLint, TypeScript, Docker |

## Dashboard functionality

- **Payments:** searchable, filterable transaction table (status, 7/30-day windows), payment detail panel, create payment, capture, refund, CSV export.
- **Merchants:** merchant accounts with transaction counts, captured volume, success rate and last activity; editable merchant profile; recent transactions per merchant.
- **Connectors:** payment providers (built-in simulator, optional Visa Acceptance sandbox) with health derived from provider operations.
- **Analytics:** payment volume, success vs. decline, refund trend, transactions by status and activity by hour.
- **Reconciliation:** payments awaiting the provider or review, ledger balance and record discrepancies.
- **Developers:** REST endpoint reference with copyable request and response examples.
- **Notifications:** notification centre and toasts, with a live connection indicator.
- **Settings:** light/dark appearance and sidebar preferences, stored in the browser only.
- **Sandbox mode:** every payment is simulated; the UI shows a persistent *Sandbox environment* notice.

## Payment processing and API architecture

```text
Browser (Next.js + TanStack Query)
   │  /api/* (no credentials in the browser)
   ▼
Next.js server proxy  ── adds API key server-side ──▶  PayFlow REST API  ──▶  PostgreSQL
   ▲                                                         │
   └──────────── Server-Sent Events (/api/v1/events/stream) ◀┘
```

- The browser only calls the Next.js proxy (`app/api/[...path]/route.ts`, plus `app/api/events/stream` for the event stream). The proxy attaches the API key from a server-side environment variable.
- PostgreSQL is the source of truth. Payment status shown in the UI is whatever the backend has committed; there are no optimistic updates.
- Live updates arrive over Server-Sent Events with stable event IDs; clients resume with `Last-Event-ID` or `?lastEventId=`. The header shows **Live** only after the stream is ready; otherwise the dashboard reconnects with backoff and falls back to polling.
- Money is handled in **minor units** (`12500` = £125.00). The sandbox supports GBP only.
- Every `POST` carries an `Idempotency-Key`, so retries do not create duplicate payments, captures or refunds.
- The API authenticates with per-merchant API keys, sent as `X-Api-Key`, `Authorization: Bearer <key>` or the legacy `X-Demo-Api-Key`.

### REST API

Base path: `/api/v1`. These are the endpoints documented in the in-app **Developers** page.

| Method | Endpoint | Result |
|---|---|---|
| GET | `/api/v1/payments` | Latest 100 payments; `?q=` and `?status=` filters |
| GET | `/api/v1/payments/{id}` | Payment details |
| POST | `/api/v1/payments` | Create a payment (provider `SIMULATED` or `VISA_SANDBOX`) |
| POST | `/api/v1/payments/{id}/capture` | Capture the full authorized amount |
| POST | `/api/v1/payments/{id}/refunds` | Refund an eligible captured payment |
| POST | `/api/v1/payments/{id}/reconcile` | Check the provider for a pending capture or refund |
| GET | `/api/v1/dashboard/summary` | Aggregates from PostgreSQL; `?days=7\|30\|0` (0 = all time) |
| GET | `/api/v1/reconciliation` | Awaiting-provider payments, ledger balance, record discrepancies |
| GET | `/api/v1/merchants` | The authenticated merchant's profile |
| PATCH | `/api/v1/merchants/{merchantId}` | Partial update of `displayName`, `contactEmail`, `businessName` (own merchant only) |
| GET | `/api/v1/events/stream` | Server-Sent Events: `ready`, `heartbeat`, `PAYMENT_STATUS_CHANGED`, `resync` |

Every `POST` needs a unique `Idempotency-Key` (8–128 characters: letters, digits, hyphen, underscore). Replaying the same key and payload is safe; reusing the key for a different request returns HTTP `409`.

**Example: create, capture and partially refund a payment (local sandbox):**

```bash
curl -s -X POST http://localhost:8080/api/v1/payments \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Api-Key: local-only-change-me' \
  -H 'Idempotency-Key: demo_create_0001' \
  -d '{"amountMinor":12500,"currency":"GBP","simulateDecline":false}'

# Use the returned id:
curl -s -X POST http://localhost:8080/api/v1/payments/<PAYMENT_UUID>/capture \
  -H 'X-Demo-Api-Key: local-only-change-me' \
  -H 'Idempotency-Key: demo_capture_0001'

curl -s -X POST http://localhost:8080/api/v1/payments/<PAYMENT_UUID>/refunds \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Api-Key: local-only-change-me' \
  -H 'Idempotency-Key: demo_refund_0001' \
  -d '{"amountMinor":2500}'
```

`local-only-change-me` is a documented placeholder for local sandbox use only. Never use it, or any default key, outside localhost.

## Local installation

**Requirements:** Node.js 22+, npm, and a running PayFlow REST API (default `http://localhost:8080`). Docker is optional.

```bash
git clone https://github.com/domwokorach/PayFlow-Acceptance-Solution.git
cd PayFlow-Acceptance-Solution
npm install
cp .env.example .env      # then edit values for your sandbox
npm run dev               # http://localhost:3000
```

Production build and container:

```bash
npm run build
npm run start
docker build -t payflow-dashboard .
```

### Environment variables

Keep real values in a local `.env`, which is excluded from Git. Only `.env.example` (placeholders) is committed.

| Variable | Used by | Purpose |
|---|---|---|
| `PAYFLOW_API_ORIGIN` | Dashboard server proxy | Backend origin (default `http://localhost:8080`) |
| `PAYFLOW_DEMO_API_KEY` | Dashboard server proxy | Local sandbox API key sent as `X-Demo-Api-Key` (server-side only) |
| `PAYFLOW_VISA_ENABLED` | Backend | Enable the optional Visa sandbox provider (`false` = simulator only) |
| `PAYFLOW_VISA_MERCHANT_ID`, `PAYFLOW_VISA_KEY_ID`, `PAYFLOW_VISA_SHARED_SECRET` | Backend | Sandbox provider credentials (never expose to the browser) |
| `PAYFLOW_SEED_DEMO_DATA` | Backend | Synthetic history for UI development only |

## Development and testing

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Build and serve the app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Type check, then ESLint |
| `npm run lint:eslint` | ESLint only |
| `npm test` | Run the Vitest suite |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:ci` | Coverage plus a JUnit report in `reports/` |

Full local check:

```bash
npm run typecheck && npm run lint:eslint && npm run test:ci && npm run build
```

The suite covers notification logic and UI, live-event handling, merchants, payment UI flows, count-up animation, colour contrast and hydration.

## Security and sandbox limitations

**Do not deploy this milestone publicly.** It is intended for localhost sandbox use only.

- All payments are **simulated**; the optional Visa Acceptance sandbox uses test credentials only. No real funds move.
- PayFlow is **not certified** for production payment processing and has had no PCI DSS assessment. Never enter real card numbers, PANs or CVVs.
- There is **no end-user login and no role-based access control**: anyone who can reach the dashboard acts as the sandbox merchant. A public deployment would need OAuth2/OIDC sign-in, RBAC, CSRF/origin and rate-limit defences, secret management and an external threat review.
- API keys and provider credentials stay in server-side environment variables, never in browser JavaScript or Git.
- Capture and refund calls are idempotent and validated by the backend.

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Project structure

```text
.
├── app/                 # Next.js routes: payments, merchants, connectors,
│                        #   analytics, reconciliation, developers, settings
│   └── api/             # Server-side proxy and event-stream route
├── components/          # Shell, payments, merchants, notifications, charts, UI kit
├── hooks/               # React hooks
├── lib/                 # API client, live updates, analytics, theme, types
├── public/              # Static assets (logo)
├── tests/               # Vitest tests
├── docs/
│   ├── images/          # README screenshots
│   └── logo-readme.png  # README logo
├── COPYRIGHT
├── LICENSE.md
├── SECURITY.md
├── Dockerfile
└── package.json
```

## Resources

- [Documentation](README.md)
- [Security Policy](SECURITY.md)
- [Licence](LICENSE.md)
- [Copyright](COPYRIGHT)

## Copyright and licence

Copyright © 2026 PayFlow. All rights reserved. This is proprietary software, licensed under no open-source licence (`UNLICENSED` in `package.json`). See [COPYRIGHT](COPYRIGHT) and [LICENSE.md](LICENSE.md). PayFlow is a sample application and is not affiliated with Visa or any payment network.
