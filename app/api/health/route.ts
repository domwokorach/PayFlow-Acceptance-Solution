import { NextResponse } from "next/server";
import { ConfigError, getConfig } from "../../../lib/server/config";
import { failureReason, logEvent } from "../../../lib/server/log";

// Unauthenticated liveness/readiness probe for uptime monitors and deployment checks. Reports only up/down
// states: no versions, hostnames, variable names or upstream payloads.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "no-store" };

export async function GET() {
  let config;
  try { config = getConfig(); }
  catch (e) {
    logEvent("error", { event: "config_invalid", reason: e instanceof ConfigError ? e.problems.join("; ") : "unknown" });
    return NextResponse.json({ status: "misconfigured", web: "up", api: "unknown" }, { status: 503, headers });
  }
  try {
    const r = await fetch(`${config.apiOrigin}/actuator/health`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5_000)) });
    const up = r.ok && ((await r.json().catch(() => ({}))) as { status?: string }).status === "UP";
    if (!up) logEvent("warn", { event: "health_api_down", status: r.status });
    return NextResponse.json({ status: up ? "ok" : "degraded", web: "up", api: up ? "up" : "down" }, { status: up ? 200 : 503, headers });
  } catch (e) {
    logEvent("warn", { event: "health_api_down", reason: failureReason(e) });
    return NextResponse.json({ status: "degraded", web: "up", api: "down" }, { status: 503, headers });
  }
}
