# Deploying PayFlow (Vercel dashboard + hosted API)

The dashboard (`frontend/`, Next.js) runs on Vercel. The REST API and PostgreSQL (`backend/`, Spring Boot) cannot run on
Vercel, so they run on a container host. `render.yaml` at the repo root is a ready Blueprint for Render; any host that runs
a Docker image and a managed PostgreSQL works the same way.

```
Browser ──HTTPS──▶ Vercel (Next.js)  ──HTTPS + X-Api-Key──▶ API (Spring Boot) ──▶ PostgreSQL
          session cookie              server-side only        Visa sandbox creds live here only
```

The browser never sees the API key, the API address's credentials, or Visa credentials. It holds only an HttpOnly
session cookie issued by the dashboard.

## 1. Deploy the API and database

1. Render → **New → Blueprint** → select this repository (it reads `render.yaml`). Paid plans are used on purpose: free
   instances sleep (breaking live updates and reconciliation) and free databases are deleted after 30 days.
2. Enter the `sync: false` secrets when prompted:
   - `PAYFLOW_DEMO_API_KEY`: generate with `openssl rand -base64 36`. Keep it; Vercel needs the same value.
   - `PAYFLOW_VISA_*`: leave blank until you have sandbox credentials (step 3).
3. Confirm `https://<service>.onrender.com/actuator/health` returns `{"status":"UP",...}`.
   `/actuator/prometheus` must return 404 (only `health` is exposed) and `/api/v1/payments` must return 401 without a key.

The API refuses to start if `PAYFLOW_REQUIRE_STRONG_KEYS=true` and the key is the local default or shorter than 32
characters, and if `PAYFLOW_VISA_ENABLED=true` with missing, placeholder or non-base64 credentials.
`PAYFLOW_SEED_DEMO_DATA` stays `false`; the demo seeder also requires the `demo` Spring profile, which is not set here.
Hosted data is real data written by real requests: there is no fabricated history and no mock fallback anywhere.

### Visa sandbox (backend only)

In the Render service set `PAYFLOW_VISA_MERCHANT_ID`, `PAYFLOW_VISA_KEY_ID`, `PAYFLOW_VISA_SHARED_SECRET` (base64, from the
Visa Acceptance sandbox Business Center), then set `PAYFLOW_VISA_ENABLED=true` and redeploy. Never put these in Vercel or in
any `NEXT_PUBLIC_*` variable. See `docs/visa-sandbox.md`. If any value is wrong the API stops at startup with a message that
names the problem but not the value, rather than failing every payment later.

## 2. Configure Vercel

Project settings: **Root Directory** is the folder containing `package.json` for the dashboard (`frontend/` in the platform
repo; the repo root if you deploy the dashboard-only repository). Framework preset: Next.js.

Set for **Production and Preview** (Settings → Environment Variables):

| Variable | Value |
| --- | --- |
| `PAYFLOW_API_ORIGIN` | `https://<service>.onrender.com` (HTTPS, bare origin) |
| `PAYFLOW_DEMO_API_KEY` | same value as the API's key, 32+ characters |
| `PAYFLOW_DASHBOARD_USER` | operator username (default `operator`) |
| `PAYFLOW_DASHBOARD_PASSWORD` | 14+ characters |
| `PAYFLOW_SESSION_SECRET` | 32+ random characters, different from the password (`openssl rand -base64 36`) |

Mark all as **Sensitive**. With the CLI: `vercel env add PAYFLOW_API_ORIGIN production` (repeat per variable and for `preview`).

Validation is strict and fail-closed. On Vercel (or when `PAYFLOW_PUBLIC_DEPLOYMENT=true`) a missing or weak value makes every
page and API route answer `503 Service is not configured`, and `/api/health` reports `misconfigured`. There is no localhost
or default-key fallback in public mode; those exist only for local development.

## 3. Verify a preview before promoting

1. Push a branch; Vercel builds a preview.
2. `curl https://<preview>/api/health` → `{"status":"ok","web":"up","api":"up"}`.
3. Without signing in, `curl -i https://<preview>/api/payments` → `401`; opening the site redirects to `/login`.
4. Sign in; check Overview, Payments, Merchants, Analytics and Reconciliation load, the header shows **Live**, and a new
   sandbox payment appears without a refresh.
5. Promote: merge to the production branch (or `vercel promote <preview-url>`).

Preview deployments protected by Vercel Authentication need a bypass token for scripted checks (project Deployment Protection).

## 4. Operating notes

- **Live updates.** Vercel functions cannot stream forever. `/api/events/stream` ends the stream cleanly after about 270 s
  (function limit 300 s); the browser reconnects with its last event id and the API replays missed events, so nothing is lost or
  doubled. A short "Reconnecting…" flash is possible at each cycle. If replay is not possible the client refetches everything.
- **Timeouts.** Upstream calls time out after 10 s by default (`PAYFLOW_API_TIMEOUT_MS`, 1–25 s) and return 504. A cold
  Render instance can exceed this on the very first request.
- **Logs.** One JSON line per proxied request: route template, method, status, duration. Never URLs with query strings, ids,
  headers, cookies, bodies, keys or upstream error text.
- **Login rate limiting.** The in-app limiter (5 failures / 15 min per address) is per serverless instance and only a brake.
  Add a Vercel Firewall rule: *Rate limit* `POST /api/auth/login`, e.g. 10 requests / minute per IP.
- **Rotating secrets.** Change `PAYFLOW_SESSION_SECRET` to sign everyone out. Change the API key in Render and Vercel together
  and redeploy both (the API revokes bootstrap keys that are no longer configured).
- **Health checks.** Point an uptime monitor at `https://<dashboard>/api/health` (200 only when the API is up).

## Security model and what remains

Implemented for the public dashboard: signed HttpOnly session cookie (`__Host-` prefixed, Secure, SameSite=Lax, 8 h);
constant-time credential checks; every API route authenticated server-side; an allowlist of the backend routes the browser may
use (actuator, key and future admin routes are unreachable); same-origin checks on every mutation and on login; request size
limits; headers rebuilt from scratch so no browser header reaches the API; backend 5xx bodies and credential errors never
shown to users; a metrics-free public API. Merchant isolation is enforced by the API: every query is scoped to the merchant
that owns the server-held key, and the browser can never choose a merchant or supply a key.

Not implemented, and required before this is more than a single-operator sandbox: per-user accounts (OIDC) and roles, multiple
merchants behind separate logins, an audit trail of dashboard sign-ins, network-level restriction of the API to the dashboard,
DDoS/WAF tuning, and an external security review. Do not use real card data; this is not PCI certified.
