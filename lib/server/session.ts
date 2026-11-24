/** Stateless signed sessions (HMAC-SHA-256) on Web Crypto, so they work in the proxy and in route handlers alike. */
const enc = new TextEncoder();

export const sessionCookieName = (publicDeployment: boolean) => (publicDeployment ? "__Host-payflow_session" : "payflow_session");

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export interface Session { sub: string; exp: number }

export async function createSession(secret: string, sub: string, ttlSeconds: number, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ sub, exp: Math.floor(now / 1000) + ttlSeconds } satisfies Session)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** Returns the session, or null for any malformed, tampered or expired token. */
export async function verifySession(secret: string, token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token || token.length > 512) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  try {
    // subtle.verify compares in constant time.
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromB64url(sig), enc.encode(payload)))) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    return typeof s.sub === "string" && typeof s.exp === "number" && s.exp * 1000 > now ? s : null;
  } catch { return null; }
}

/** Constant-time string comparison: both sides are hashed first so length does not leak. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map(async (v) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
