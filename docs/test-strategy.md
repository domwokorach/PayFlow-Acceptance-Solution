# Test strategy and next verification targets

## Implemented
Three levels, run by the Jenkins pipeline (see `docs/jenkins-setup.md`) and, for the fast ones, by GitHub Actions:
- **Unit** (no external services): `PaymentPolicyTest`, `IdempotencyTest` (duplicate-request rules), `MerchantServiceTest`, `RequestValidationTest`, `VisaAcceptanceGatewayTest` (provider error mapping against a local stub server), `VisaJwtSignerTest`; frontend logic, component, API-client, notification, payment-UI and hydration tests with Vitest. Backend selection: `mvn test -Dtest='!*IntegrationTest'`.
- **Integration** (PostgreSQL 17 via Testcontainers, Visa gateway mocked): `*IntegrationTest` classes covering migrations, persistence, rollback, ledger balance, duplicate and concurrent requests, merchant isolation and live events. Selection: `mvn test -Dtest='*IntegrationTest'`.
- **End-to-end** (isolated stack, simulator provider only): `infrastructure/ci/e2e_payment_flow.py` covers create, idempotent retry, capture, partial and full refund, transaction details, dashboard and ledger consistency, live events, provider error mapping, merchant update, authentication and concurrency.
- The optional Visa sandbox smoke test (`scripts_visa_live_smoke.py`) is separate, opt-in, and excluded from routine builds.

## Must add in milestone 2 (PostgreSQL integration tests)
1. Create payment then reuse the same idempotency key concurrently; assert only one payment row.
2. Reuse an idempotency key with a different request body; expect HTTP 409.
3. Capture twice using different keys; second attempt must return HTTP 409 and there must be exactly one capture journal.
4. Parallel refunds whose combined total exceeds captured amount; only the permissible amount succeeds.
5. Assert ledger has matching DEBIT and CREDIT amounts per journal.
6. Inject a database exception after ledger write; assert payment transition and ledger both roll back.
7. Verify rejected auth, unauthorized requests, invalid input and non-existent IDs.

## Inspection query

```sql
SELECT journal_id,
  SUM(CASE WHEN direction='DEBIT' THEN amount_minor ELSE -amount_minor END) AS imbalance_minor
FROM ledger_entries
GROUP BY journal_id
HAVING SUM(CASE WHEN direction='DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0;
```

Expected: **zero rows**.

For credible Visa portfolio evidence, record CI results, concurrency test results, latency benchmarks, an incident postmortem and an ADR before applying.
