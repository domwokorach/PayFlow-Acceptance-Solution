/**
 * What the browser may ask the proxy to do. Everything else is refused before any upstream call, so a signed-in
 * browser cannot reach actuator, key-management or future backend routes. Merchant isolation itself is enforced by
 * the backend: the server-held API key binds every request to exactly one merchant, and the browser never supplies
 * a merchant, a key or any auth header (headers are rebuilt from scratch in upstream.ts).
 */
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const ID = "[A-Za-z0-9_-]{1,60}";
const ROUTES: { method: string; pattern: RegExp; mutating: boolean }[] = [
  { method: "GET", pattern: /^payments$/, mutating: false },
  { method: "POST", pattern: /^payments$/, mutating: true },
  { method: "GET", pattern: new RegExp(`^payments/${UUID}$`), mutating: false },
  { method: "POST", pattern: new RegExp(`^payments/${UUID}/(capture|refunds|reconcile)$`), mutating: true },
  { method: "GET", pattern: /^dashboard\/summary$/, mutating: false },
  { method: "GET", pattern: /^reconciliation$/, mutating: false },
  { method: "GET", pattern: /^merchants$/, mutating: false },
  { method: "PATCH", pattern: new RegExp(`^merchants/${ID}$`), mutating: true },
];

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_QUERY_LENGTH = 512;

export type Decision = { ok: true; mutating: boolean } | { ok: false; status: 404 | 405 | 414; error: string };

export function decide(method: string, path: string[]): Decision {
  const joined = path.join("/");
  const matching = ROUTES.filter((r) => r.pattern.test(joined));
  if (!matching.length) return { ok: false, status: 404, error: "Not found" };
  const hit = matching.find((r) => r.method === method);
  return hit ? { ok: true, mutating: hit.mutating } : { ok: false, status: 405, error: "Method not allowed" };
}

/** CSRF defence for cookie-authenticated mutations: the browser must say the request came from this site. */
export function isSameOrigin(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = headers.get("origin");
  if (!origin) return fetchSite === "same-origin";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try { return !!host && new URL(origin).host === host; } catch { return false; }
}
