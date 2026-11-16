# Security Policy

**The current milestone is for local development and sandbox testing only.** Payments are simulated (or sent to a Visa Acceptance sandbox), no real funds move, and the project has not had an external security review or any payment-industry certification. Do not deploy it publicly or use it with real card data.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x (current milestone) | Security fixes on a best-effort basis |
| Earlier | Not supported |

## Reporting a vulnerability

Please report vulnerabilities **privately**. Do not open a public issue or pull request that describes an exploitable problem.

Use GitHub's private vulnerability reporting: on the repository, open the **Security** tab and choose **Report a vulnerability**. (The repository owner must have this feature enabled in the repository settings. No other contact channel has been verified yet, so none is listed here.)

Include affected component, steps to reproduce, impact, and any suggested fix. Never include real card data or live credentials.

## Responsible disclosure

Give the maintainers reasonable time to investigate and fix before any public disclosure. Do not access data that is not yours, disrupt services, or test against systems you do not own. Good-faith research that follows this policy will not be treated as hostile.

## Authentication and authorization

- The API uses **per-merchant API keys** enforced by Spring Security. Keys are stored only as SHA-256 digests; missing or invalid keys receive `401`.
- Every query, idempotency key, ledger and audit row, dashboard aggregate and event stream is scoped to the key's merchant. Another merchant's resources return `404`.
- Capture, refund and reconcile operations require a valid key and merchant ownership of the payment.
- There is **no end-user login or RBAC yet**. Anyone who can reach the dashboard acts as the demo merchant. OAuth2/OIDC and RBAC are required before any public deployment.

## API keys and environment variables

- Never commit API keys, passwords, tokens, or production credentials. `.env` files are git-ignored; only `.env.example` (placeholders) is tracked.
- Keep sensitive configuration in server-side environment variables. Provider credentials are never exposed to browser JavaScript: the Next.js server proxy adds the key.
- The default demo key (`local-only-change-me`) is a documented local-only value. Replace it and use long random keys (at least 16 characters) for anything beyond localhost.
- Rotating `PAYFLOW_BOOTSTRAP_KEYS` revokes keys that are no longer configured at the next startup.
- The repository runs secret scanning (gitleaks) in CI.

## Payment transaction security

- Payment requests and amounts are validated server-side; amounts are integers in minor units, and currency is GBP only for now.
- Payment state changes follow a state machine; capture and refund update the payment and append balanced journal entries in a single database transaction.
- Refunds cannot exceed the captured amount.
- Financial POSTs to the provider are never retried automatically. Unknown outcomes (timeouts, 429, 5xx) are marked for review rather than guessed.
- Transaction and audit logs record outcomes and identifiers without storing card numbers, CVV, or credentials.

## Idempotency and duplicate payment prevention

All POST endpoints require an `Idempotency-Key` (8 to 128 characters: letters, digits, hyphen, underscore). A PostgreSQL unique key plus row lock serializes duplicate and concurrent requests. Reusing a key with the same payload does not repeat side effects; reusing it for a different request returns HTTP `409`.

## Sensitive data handling

- Never store or log real card details (PAN, CVV) in this project. Use provider test cards only.
- Do not paste secrets, real customer data or production logs into issues or documentation.
- The local database uses a development password and optional synthetic seed data; both are for localhost only.

## Sandbox limitations

Simulated providers, a well-known default key, an unauthenticated dashboard session, a development database password, and no rate limiting, CSRF/origin hardening or external threat review mean this milestone must not be exposed to the internet or used for real payments.

## Security testing and dependencies

- Backend unit and Testcontainers integration tests (`cd backend && mvn test`); frontend type check, lint and tests (`cd frontend && npm run typecheck && npm run lint:eslint && npm run test:ci`).
- CI (Jenkins and GitHub Actions) runs secret scanning and dependency scanning. See [docs/jenkins-setup.md](docs/jenkins-setup.md) and [docs/test-strategy.md](docs/test-strategy.md).
- Keep dependencies up to date and review scan results before each milestone.
