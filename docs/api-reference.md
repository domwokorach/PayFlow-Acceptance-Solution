# PayFlow API reference

Verified against the Spring Boot controllers and DTOs in the Jenkins snapshot (`backend/src/main/java/dev/payflow/api/`, `model/`) and the dashboard proxy allowlist (`frontend/lib/server/policy.ts`). Not exercised against a running backend during the audit.

- **Base URL (backend):** `http://localhost:8080/api/v1`
- **Through the dashboard:** `http://localhost:3000/api/<path>` (no `v1`), with a session cookie when sign-in is enabled. The proxy allows only the routes in this document.
- **Authentication:** every `/api/v1/**` call needs a per-merchant API key in `X-Api-Key` (also accepted: `X-Demo-Api-Key`, `Authorization: Bearer <key>`). Missing or revoked key: `401 {"error":"Unauthorized"}`. All data is scoped to the key's merchant.
- **Money:** integers in minor units (pence). The demo accepts `GBP` only.
- **Idempotency:** `POST` create, capture and refund require `Idempotency-Key` (8–128 letters, digits, `-`, `_`).

## Error shape

```json
{ "error": "Invalid request fields", "fields": { "amountMinor": "must be greater than 0" } }
```

`fields` appears only for validation errors. Other errors are `{ "error": "<message>" }`.

| Status | Meaning (messages seen in source) |
|---|---|
| 400 | Invalid fields; "Malformed request body"; "Missing required header: …"; bad `Idempotency-Key`; "Demo currently supports GBP only"; "days must be 0, 7 or 30"; "Search query too long"; "No changes supplied" |
| 401 | Unauthorized |
| 404 | Payment, refund or merchant not found |
| 409 | "Idempotency-Key already used for another request"; "Only AUTHORIZED payments can be captured"; "Payment must be captured before refunding"; "Refund exceeds remaining captured amount" |
| 502 | "Visa status lookup failed; try again later" |
| 503 | "Visa sandbox not configured" |

Through the dashboard proxy: `401 Sign in required`, `403 Forbidden` (cross-origin mutation), `404`/`405` (not allowlisted), `413`/`414` (too large), `502 Payment API unavailable` or `…rejected the service credentials`, `504 Payment API timed out`, `503 Service is not configured`.

## Payments

### `GET /payments?q=&status=`

Lists the merchant's payments. `q` searches (max length enforced); `status` filters.

```json
[ { "id": "3f1c1c9e-0b0e-4a63-9d1d-6b4a2f7e9a11", "merchantId": "demo_merchant", "amountMinor": 12500,
    "currency": "GBP", "status": "CAPTURED", "refundedAmountMinor": 0, "provider": "SIMULATED",
    "createdAt": "2026-11-15T13:44:00Z", "providerStatus": null } ]
```

### `POST /payments` → `201`

Headers: `Idempotency-Key`. Body:

```json
{ "amountMinor": 12500, "currency": "GBP", "simulateDecline": false, "provider": "SIMULATED" }
```

`provider` is `SIMULATED` (default) or `VISA_SANDBOX`. Returns a `PaymentView` (fields as above). Status: `AUTHORIZED` or `DECLINED`; for Visa sandbox also `PENDING_AUTHORIZATION` or `REVIEW_REQUIRED`.

### `GET /payments/{id}` → `PaymentView`

### `POST /payments/{id}/capture` → `200`

Headers: `Idempotency-Key`. No body. Only from `AUTHORIZED`. Visa sandbox payments pass through `CAPTURE_PENDING` until confirmed.

### `POST /payments/{id}/refunds` → `201`

Headers: `Idempotency-Key`. Body `{ "amountMinor": 2500 }` (positive, ≤ 100,000,000, not above the remaining captured amount).

```json
{ "id": "…", "paymentId": "…", "amountMinor": 2500, "createdAt": "2026-11-15T14:02:00Z", "status": "COMPLETED" }
```

Refund `status` defaults to `COMPLETED` (`V2__visa_sandbox.sql`); Visa sandbox refunds can be pending until confirmed.

### `POST /payments/{id}/reconcile` → `PaymentView`

Read-only lookup for a pending Visa sandbox capture or refund. Never resubmits the operation.

## Dashboard and reconciliation

### `GET /dashboard/summary?days=30`

`days` is `0`, `7` or `30`. Returns `totalTransactions`, `authorized`, `declined`, `capturedVolumeMinor`, `refundedVolumeMinor`, `successfulPayments`, `dailyVolume[]`, `generatedAt`, `days`, `totals`, `previous` (same shape, prior window), `daily[]`, `statusCounts` (map), and `providers[]` (`name`, `total`, `successful`, `declined`, `lastUsed`, `health` = `HEALTHY|DEGRADED|IDLE|NOT_CONFIGURED`, `healthDetail`).

### `GET /reconciliation`

`generatedAt`, `paymentsChecked`, `journals`, `unbalancedJournals`, `awaiting[]` (items awaiting the provider or review, with a suggested `action`) and `discrepancies[]` (`paymentId`, `issue`).

## Merchants

### `GET /merchants` → `MerchantView[]`

```json
[ { "id": "demo_merchant", "displayName": "Acme Demo Store", "contactEmail": null, "businessName": null,
    "createdAt": "2026-11-15T10:00:00Z", "updatedAt": "2026-11-15T10:00:00Z" } ]
```

### `PATCH /merchants/{merchantId}`

Partial update; absent or null fields are unchanged, an empty string clears an optional field. Body fields: `displayName` (≤ 120, not blank), `contactEmail` (≤ 254, valid email or empty), `businessName` (≤ 120). Identifiers, keys and provider settings cannot be set. No create or delete endpoint exists.

## Events

### `GET /events/stream`

`text/event-stream`. Resume with the `Last-Event-ID` header or `?lastEventId=<digits>`. Event types: `PAYMENT_STATUS_CHANGED` (`paymentId`, `status`) and `MERCHANT_UPDATED` (`merchantId`). Heartbeats every 15 s. Events are per merchant. The dashboard proxy ends each stream after about 270 s; the client reconnects with its last id.

## Operational endpoints (no authentication)

`GET /actuator/health`, `/actuator/info`, `/actuator/prometheus`. Health details are hidden.

## Dashboard-only routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Body `{"username","password"}`; same-origin only; 401 wrong credentials, 429 throttled |
| `POST` | `/api/auth/logout` | End session |
| `GET` | `/api/auth/session` | Session state |
| `GET` | `/api/health` | `{"status":"ok|degraded|misconfigured","web":"up","api":"up|down|unknown"}`, 503 when not ok |

## Visa Acceptance sandbox

Test host `https://apitest.visaacceptance.com`, JWT (HS256, shared secret). Calls: `POST /pts/v2/payments`, `POST /pts/v2/payments/{id}/captures`, `POST /pts/v2/captures/{id}/refunds`. A fixed published test card is sent by the backend; browsers never supply card data. Enable with `PAYFLOW_VISA_ENABLED=true` and the three `PAYFLOW_VISA_*` credentials. Official documentation: <https://developer.visaacceptance.com/>.
