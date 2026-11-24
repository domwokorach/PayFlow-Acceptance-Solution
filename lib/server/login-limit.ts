/**
 * Best-effort brute-force brake for the login form: per client address, per server instance. Serverless instances
 * do not share memory, so this only slows a single connection; pair it with a Vercel Firewall rate-limit rule on
 * /api/auth/login (see docs/deployment.md).
 */
const WINDOW_MS = 15 * 60_000, MAX_FAILURES = 5, MAX_TRACKED = 5_000;
const failures = new Map<string, { count: number; first: number }>();

export function loginBlocked(key: string, now = Date.now()): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) { failures.delete(key); return false; }
  return f.count >= MAX_FAILURES;
}
export function recordLoginFailure(key: string, now = Date.now()) {
  const f = failures.get(key);
  if (f && now - f.first <= WINDOW_MS) f.count++;
  else {
    if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value as string);
    failures.set(key, { count: 1, first: now });
  }
}
export const clearLoginFailures = (key: string) => void failures.delete(key);
export const resetLoginLimitForTests = () => failures.clear();
