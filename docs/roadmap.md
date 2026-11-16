# Engineering roadmap

## Milestone 1 — in this repository
- [x] Docker Compose infrastructure
- [x] PostgreSQL schema + Flyway
- [x] Simulated authorization, capture and refund REST endpoints
- [x] Database-serialized idempotency on mutating endpoints
- [x] Balanced-entry ledger records
- [x] Dashboard + filterable payments + payment actions + export CSV
- [x] Demo seeding and basic JUnit unit tests
- [x] Initial CI pipeline definitions

## Milestone 2 — correctness and security
- [x] Testcontainers-based PostgreSQL integration tests, including race conditions
- [x] Spring Security with per-merchant API keys (hashed, revocable)
- [ ] OAuth2/OIDC user login and RBAC
- [x] Strict tenant isolation across every resource (HTTP-level tests, per-merchant SSE)
- [ ] Audited ledger integrity, database-side balancing and reconciliation
- [x] OpenTelemetry traces, Prometheus + Grafana (compose profile `observability`)

## Milestone 3 — distributed systems
- [ ] Transactional outbox and Kafka consumers
- [ ] Connector interface + deterministic simulated providers
- [ ] Provider timeouts, retries with backoff, circuit breakers and DLQ
- [ ] Reconciliation batch jobs and exception workflow
- [ ] Performance benchmarks with documented p95 and p99 latency

## Milestone 4 — portfolio polish
- [ ] Threat model and architecture decision records
- [ ] Incident simulation + runbook
- [ ] Demonstration video and architecture explainer
- [ ] Authenticated, hardened deployment to AWS
