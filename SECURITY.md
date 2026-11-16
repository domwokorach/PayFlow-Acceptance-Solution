# Security Policy

> **Scope:** the current milestone is intended for **local development and sandbox testing only**. It is not production-ready and must not be deployed publicly or used with real payment data.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Sandbox / local development only |

## Reporting a vulnerability

Please report vulnerabilities **privately**. Do not open a public issue, pull request or discussion that describes an unpatched vulnerability.

Use GitHub's private vulnerability reporting for this repository: **Security tab → Report a vulnerability**. If that option is not enabled, contact the repository owner through their GitHub profile ([@domwokorach](https://github.com/domwokorach)) and ask for a private channel before sharing details.

Please include the affected component, reproduction steps, impact and any suggested fix. Do not include real card data or real credentials in a report.

## Responsible disclosure

- Give the maintainer reasonable time to investigate and fix the issue before any public disclosure.
- Test only against your own local sandbox. Do not attack systems you do not own, and do not access, modify or destroy other people's data.
- Good-faith research that follows this policy will not be treated as hostile.

## Authentication and authorization

- The dashboard currently has **no end-user login and no role-based access control**. Anyone who can reach the dashboard acts as the sandbox merchant.
- The backend authenticates API calls with a per-merchant API key, and scopes payments, ledger and audit records to that merchant.
- Before any public deployment this needs OAuth2/OIDC sign-in, role-based access, and authorization checks on sensitive operations, in particular **capture and refund**.

## API keys and environment variables

- Never commit API keys, passwords, private tokens or production credentials. `.env` files are excluded by `.gitignore`; only `.env.example` with placeholders is committed.
- Keep sensitive configuration in server-side environment variables (for example `PAYFLOW_DEMO_API_KEY`, `PAYFLOW_VISA_*`).
- The Next.js server proxy adds the API key. Provider credentials and API keys must never be exposed in browser JavaScript, a `NEXT_PUBLIC_*` variable, or client bundles.
- The key shown in the Developers page (`local-only-change-me`) is a documented placeholder for localhost. Replace it and rotate any key that has been exposed.

## Payment transaction security

- All payment requests and amounts are validated by the backend. Amounts are integers in minor units, and the sandbox supports GBP only.
- Capture and refund operations must be restricted to authorized callers and are applied only to eligible payment states.
- Payment status shown in the UI is what the backend has committed; the UI does no optimistic financial updates.
- Transaction and audit logs should record outcomes and identifiers without sensitive payment data.

## Idempotency and duplicate payment prevention

- Every `POST` requires a unique `Idempotency-Key` (8–128 characters: letters, digits, hyphen, underscore).
- Replaying the same key and payload does not repeat side effects. Reusing a key for a different request returns HTTP `409`.
- Financial requests to an external provider are not blindly retried; unknown outcomes are reconciled by a read-only lookup.

## Sensitive data handling

- Do not store, log or transmit real card numbers (PAN), CVV or other cardholder data in this project.
- Test data is fictitious. Logs and screenshots shared in issues or reports must not contain secrets or personal data.

## Sandbox limitations

- Payments are simulated; no real funds move and nothing here is certified for live processing.
- The development database password, default sandbox key and optional synthetic seed data are for localhost only.
- Not yet implemented: user login and RBAC, rate limiting, CSRF/origin protections, secret management, and an external threat review.

## Security testing and dependencies

- Run `npm run typecheck`, `npm run lint:eslint` and `npm run test:ci` before changes are merged.
- Review dependency updates and run `npm audit` periodically; keep Next.js, React and other dependencies current.
- Scan for committed secrets before publishing the repository.
