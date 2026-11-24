import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../lib/server/auth";
import { failureReason, logEvent, routeTemplate } from "../../../lib/server/log";
import { decide, isSameOrigin, MAX_BODY_BYTES, MAX_QUERY_LENGTH } from "../../../lib/server/policy";
import { jsonError, unavailableMessage, upstreamHeaders } from "../../../lib/server/upstream";

// Server-side proxy: the backend key never reaches browser JavaScript. Every request needs a session (public
// deployments), must match the route allowlist, and is bounded by a timeout. See lib/server/policy.ts.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const { path } = await context.params;
  const route = routeTemplate(path), method = request.method;

  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const { config } = gate;

  const decision = decide(method, path);
  if (!decision.ok) return jsonError(decision.error, decision.status);
  if (decision.mutating && !isSameOrigin(request.headers)) {
    logEvent("warn", { event: "proxy_rejected", route, method, reason: "cross_origin" });
    return jsonError("Forbidden", 403);
  }
  if (request.nextUrl.search.length > MAX_QUERY_LENGTH) return jsonError("Request too large", 414);

  let body: string | undefined;
  if (method !== "GET") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return jsonError("Request too large", 413);
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) return jsonError("Request too large", 413);
  }

  const headers = upstreamHeaders(config, "application/json");
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (contentType) headers.set("content-type", contentType);
  if (idempotencyKey && idempotencyKey.length <= 128) headers.set("idempotency-key", idempotencyKey);

  try {
    const response = await fetch(`${config.apiOrigin}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, {
      method, headers, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(config.timeoutMs),
    });
    logEvent(response.status >= 500 ? "error" : "info", { event: "proxy", route, method, status: response.status, ms: Date.now() - started });
    // The backend rejecting our own credentials is a deployment fault, not something the signed-in user can fix.
    if (response.status === 401 || response.status === 403) return jsonError("Payment API rejected the service credentials", 502);
    // Upstream 5xx bodies can carry internals: replace them. 4xx bodies hold validation messages the UI shows.
    if (response.status >= 500) return jsonError("Payment API error", 502);
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const reason = failureReason(e);
    logEvent("error", { event: "proxy_failed", route, method, reason, ms: Date.now() - started });
    return reason === "timeout" ? jsonError("Payment API timed out", 504) : jsonError(unavailableMessage(config), 502);
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
