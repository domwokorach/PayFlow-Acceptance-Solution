/**
 * Server-only configuration. Validated once, fail-closed.
 *
 * Two modes:
 *  - local (default): localhost API and the well-known demo key are allowed, and the dashboard has no login.
 *  - public (Vercel, or PAYFLOW_PUBLIC_DEPLOYMENT=true): every secret must be set explicitly, the API must be
 *    reachable over HTTPS, and every dashboard and API request requires a signed-in session.
 * Error messages name variables, never values.
 */
const LOCAL_ORIGIN = "http://localhost:8080";
const LOCAL_KEY = "local-only-change-me";
const MIN_API_KEY = 32, MIN_SESSION_SECRET = 32, MIN_PASSWORD = 14;

type Env = Record<string, string | undefined>;

export interface ServerConfig {
  publicDeployment: boolean;
  apiOrigin: string;
  apiKey: string;
  /** Upstream request budget for ordinary calls. */
  timeoutMs: number;
  /** Null in local mode when no login is configured. */
  auth: { username: string; password: string; sessionSecret: string; sessionTtlSeconds: number } | null;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) { super(`Invalid PayFlow server configuration: ${problems.join("; ")}`); this.name = "ConfigError"; }
}

export const isPublicDeployment = (env: Env = process.env) => env.VERCEL === "1" || env.PAYFLOW_PUBLIC_DEPLOYMENT === "true";

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "::1" || h === "::") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function loadConfig(env: Env = process.env): ServerConfig {
  const publicDeployment = isPublicDeployment(env);
  const problems: string[] = [];
  const get = (k: string) => env[k]?.trim() || undefined;

  let apiOrigin = get("PAYFLOW_API_ORIGIN");
  if (!apiOrigin) {
    if (publicDeployment) problems.push("PAYFLOW_API_ORIGIN is required");
    else apiOrigin = LOCAL_ORIGIN;
  }
  if (apiOrigin) {
    try {
      const u = new URL(apiOrigin);
      if (u.pathname !== "/" || u.search || u.hash || u.username || u.password) problems.push("PAYFLOW_API_ORIGIN must be a bare origin such as https://api.example.com");
      if (publicDeployment && u.protocol !== "https:") problems.push("PAYFLOW_API_ORIGIN must use https in a public deployment");
      if (publicDeployment && isPrivateHost(u.hostname)) problems.push("PAYFLOW_API_ORIGIN must not point at localhost or a private address in a public deployment");
      if (!["http:", "https:"].includes(u.protocol)) problems.push("PAYFLOW_API_ORIGIN must be http(s)");
      apiOrigin = u.origin;
    } catch { problems.push("PAYFLOW_API_ORIGIN is not a valid URL"); }
  }

  let apiKey = get("PAYFLOW_DEMO_API_KEY");
  if (!apiKey) {
    if (publicDeployment) problems.push("PAYFLOW_DEMO_API_KEY is required");
    else apiKey = LOCAL_KEY;
  } else if (publicDeployment) {
    if (apiKey === LOCAL_KEY) problems.push("PAYFLOW_DEMO_API_KEY must not be the well-known local key");
    else if (apiKey.length < MIN_API_KEY) problems.push(`PAYFLOW_DEMO_API_KEY must be at least ${MIN_API_KEY} characters`);
  }

  const timeoutRaw = get("PAYFLOW_API_TIMEOUT_MS");
  let timeoutMs = 10_000;
  if (timeoutRaw) {
    const n = Number(timeoutRaw);
    if (!Number.isInteger(n) || n < 1_000 || n > 25_000) problems.push("PAYFLOW_API_TIMEOUT_MS must be an integer between 1000 and 25000");
    else timeoutMs = n;
  }

  const password = get("PAYFLOW_DASHBOARD_PASSWORD"), secret = get("PAYFLOW_SESSION_SECRET"), username = get("PAYFLOW_DASHBOARD_USER") ?? "operator";
  let auth: ServerConfig["auth"] = null;
  if (publicDeployment || password || secret) {
    if (!password) problems.push("PAYFLOW_DASHBOARD_PASSWORD is required");
    else if (password.length < MIN_PASSWORD) problems.push(`PAYFLOW_DASHBOARD_PASSWORD must be at least ${MIN_PASSWORD} characters`);
    if (!secret) problems.push("PAYFLOW_SESSION_SECRET is required");
    else if (secret.length < MIN_SESSION_SECRET) problems.push(`PAYFLOW_SESSION_SECRET must be at least ${MIN_SESSION_SECRET} characters`);
    if (password && secret && password === secret) problems.push("PAYFLOW_SESSION_SECRET must differ from PAYFLOW_DASHBOARD_PASSWORD");
    if (password && secret) auth = { username, password, sessionSecret: secret, sessionTtlSeconds: 8 * 3600 };
  }

  if (problems.length) throw new ConfigError(problems);
  return { publicDeployment, apiOrigin: apiOrigin!, apiKey: apiKey!, timeoutMs, auth };
}

let cached: ServerConfig | undefined;
/** Loads and memoises the process configuration. Throws ConfigError; callers must fail the request closed. */
export function getConfig(): ServerConfig { return (cached ??= loadConfig()); }
export function resetConfigForTests() { cached = undefined; }
