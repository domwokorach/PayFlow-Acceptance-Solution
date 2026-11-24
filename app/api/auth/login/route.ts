import { NextRequest, NextResponse } from "next/server";
import { ConfigError, getConfig } from "../../../../lib/server/config";
import { logEvent } from "../../../../lib/server/log";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "../../../../lib/server/login-limit";
import { isSameOrigin, MAX_BODY_BYTES } from "../../../../lib/server/policy";
import { createSession, safeEqual, sessionCookieName } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(request: NextRequest) {
  let config;
  try { config = getConfig(); }
  catch (e) {
    logEvent("error", { event: "config_invalid", reason: e instanceof ConfigError ? e.problems.join("; ") : "unknown" });
    return fail("Service is not configured", 503);
  }
  if (!config.auth) return fail("Login is not enabled", 404);
  if (!isSameOrigin(request.headers)) return fail("Forbidden", 403);

  const client = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (loginBlocked(client)) {
    logEvent("warn", { event: "login_throttled" });
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { ...noStore, "retry-after": "900" } });
  }

  let username = "", password = "";
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail("Request too large", 413);
    const body = JSON.parse(raw) as { username?: unknown; password?: unknown };
    if (typeof body.username === "string") username = body.username;
    if (typeof body.password === "string") password = body.password;
  } catch { return fail("Invalid request", 400); }

  // Both comparisons always run so timing does not reveal which field was wrong.
  const [userOk, passOk] = await Promise.all([safeEqual(username, config.auth.username), safeEqual(password, config.auth.password)]);
  if (!(userOk && passOk)) {
    recordLoginFailure(client);
    logEvent("warn", { event: "login_failed" });
    return fail("Incorrect username or password", 401);
  }
  clearLoginFailures(client);
  logEvent("info", { event: "login_ok" });
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(sessionCookieName(config.publicDeployment), await createSession(config.auth.sessionSecret, config.auth.username, config.auth.sessionTtlSeconds), {
    httpOnly: true, secure: config.publicDeployment, sameSite: "lax", path: "/", maxAge: config.auth.sessionTtlSeconds,
  });
  return response;
}
