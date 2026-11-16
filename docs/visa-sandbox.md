# Visa Acceptance sandbox (v0.2)

Test-only, local integration. The backend sends a fixed published test-card fixture to
`https://apitest.visaacceptance.com`. No card data is accepted from browsers or stored.
Auth is JWT v2 (shared-secret HS256). MLE, webhooks and a reconciliation worker are not implemented.

## Setup
1. Create a sandbox merchant at https://developer.visaacceptance.com/hello-world/sandbox.html and note the
   merchant ID, REST shared-secret Key ID and Base64 shared secret. Never commit them.
2. `cp .env.example .env`, fill in the three values (no quotes), keep `PAYFLOW_VISA_ENABLED=true`.
3. `docker compose up -d --build postgres backend frontend` (Compose reads `.env` only when the container is recreated).

Unconfigured or placeholder values return `503 Visa sandbox not configured`; the simulator keeps working.

## API
`POST /api/v1/payments` accepts `"provider":"VISA_SANDBOX"` (default `SIMULATED`). Capture and refund use the
existing endpoints; `POST /api/v1/payments/{id}/reconcile` checks a pending capture/refund (read-only lookup).

| Step | Transitions |
|---|---|
| Authorize | PENDING_AUTHORIZATION -> AUTHORIZED / DECLINED / REVIEW_REQUIRED |
| Capture | AUTHORIZED -> CAPTURE_PENDING -> CAPTURED (only when confirmed SETTLED/COMPLETED) |
| Refund | CAPTURED -> REFUND_PENDING -> PARTIALLY_REFUNDED / REFUNDED (confirmed) |
| Unknown outcome | any -> REVIEW_REQUIRED: manual review, never blind-retried |

Refunds reference the Visa capture transaction ID. Ledger entries are posted only on confirmed capture/refund.

## Design
`VisaPaymentWorkflow` persists intent (`visa_operations`, state IN_FLIGHT) and the pending payment status
first, calls Visa outside any DB transaction, then commits the outcome. Replaying an Idempotency-Key returns the
stored state and never calls Visa again. Only the statuses AUTHORIZED, DECLINED, PENDING, SETTLED, COMPLETED are
recognised; anything else stays pending or goes to review.

Inspect: `docker compose exec postgres psql -U payflow -d payflow -c "SELECT kind,state,provider_transaction_id,provider_status,updated_at FROM visa_operations ORDER BY created_at DESC LIMIT 10;"`

## Tests
`cd backend && mvn test` (Java 21+, Docker for the Testcontainers integration test).
