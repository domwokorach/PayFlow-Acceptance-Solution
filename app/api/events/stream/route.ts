import { NextRequest } from "next/server";
import { requireSession } from "../../../../lib/server/auth";
import { failureReason, logEvent } from "../../../../lib/server/log";
import { jsonError, upstreamHeaders } from "../../../../lib/server/upstream";

// Streaming SSE proxy. The catch-all proxy buffers whole responses, which would hold an event stream forever.
// The backend key is added here, server-side, so it never reaches the browser.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A Vercel function cannot stream forever. The stream is ended cleanly a little before the platform would kill it;
// the browser client (lib/live.ts) reconnects with its last event id, so nothing is missed or duplicated.
export const maxDuration = 300;
const STREAM_BUDGET_MS = 270_000;

export async function GET(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const { config } = gate;

  const headers = upstreamHeaders(config, "text/event-stream");
  const last = request.headers.get("last-event-id");
  if (last && /^\d{1,18}$/.test(last)) headers.set("last-event-id", last);
  // Only the resume cursor is forwarded; arbitrary query parameters are not.
  const cursor = request.nextUrl.searchParams.get("lastEventId");
  const query = cursor && /^\d{1,18}$/.test(cursor) ? `?lastEventId=${cursor}` : "";

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const connectTimer = setTimeout(() => abort.abort(new DOMException("connect timeout", "TimeoutError")), config.timeoutMs);
  try {
    const response = await fetch(`${config.apiOrigin}/api/v1/events/stream${query}`, { headers, cache: "no-store", redirect: "manual", signal: abort.signal });
    clearTimeout(connectTimer);
    if (!response.ok || !response.body) {
      logEvent("error", { event: "stream_rejected", route: "events/stream", status: response.status });
      return jsonError("Event stream unavailable", 503);
    }
    const upstream = response.body.getReader();
    const deadline = setTimeout(() => abort.abort(), STREAM_BUDGET_MS);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await upstream.read();
          if (done) { clearTimeout(deadline); controller.close(); } else controller.enqueue(value);
        } catch {
          // Budget reached or either side hung up: end the stream normally so the client resumes from its cursor.
          clearTimeout(deadline);
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() { clearTimeout(deadline); abort.abort(); },
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
    });
  } catch (e) {
    clearTimeout(connectTimer);
    logEvent("error", { event: "stream_failed", route: "events/stream", reason: failureReason(e) });
    return jsonError("Event stream unavailable", 503);
  }
}
