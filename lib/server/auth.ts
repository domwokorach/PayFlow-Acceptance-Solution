import { NextRequest, NextResponse } from "next/server";
import { ConfigError, getConfig, type ServerConfig } from "./config";
import { logEvent } from "./log";
import { sessionCookieName, verifySession } from "./session";

export type Gate = { ok: true; config: ServerConfig } | { ok: false; response: NextResponse };

const noStore = { "cache-control": "no-store" };

/** Loads configuration and, when login is configured, requires a valid session. Fails closed on bad configuration. */
export async function requireSession(request: NextRequest): Promise<Gate> {
  let config: ServerConfig;
  try { config = getConfig(); }
  catch (e) {
    // Variable names only; the browser sees a generic message.
    logEvent("error", { event: "config_invalid", reason: e instanceof ConfigError ? e.problems.join("; ") : "unknown" });
    return { ok: false, response: NextResponse.json({ error: "Service is not configured" }, { status: 503, headers: noStore }) };
  }
  if (config.auth) {
    const session = await verifySession(config.auth.sessionSecret, request.cookies.get(sessionCookieName(config.publicDeployment))?.value);
    if (!session) return { ok: false, response: NextResponse.json({ error: "Sign in required" }, { status: 401, headers: noStore }) };
  }
  return { ok: true, config };
}
