import { NextRequest } from "next/server";

// Streaming SSE proxy. The catch-all proxy buffers whole responses, which would hold an event stream forever.
// The backend key is added here, server-side, so it never reaches the browser.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const upstream = process.env.PAYFLOW_API_ORIGIN || "http://localhost:8080";
  const headers = new Headers({
    "X-Demo-Api-Key": process.env.PAYFLOW_DEMO_API_KEY || "local-only-change-me",
    Accept: "text/event-stream",
  });
  const last = request.headers.get("last-event-id");
  if (last) headers.set("last-event-id", last);
  try {
    const response = await fetch(`${upstream}/api/v1/events/stream${request.nextUrl.search}`, { headers, cache: "no-store", signal: request.signal });
    if (!response.ok || !response.body) return Response.json({ error: "Event stream unavailable" }, { status: response.status === 401 ? 502 : 503 });
    return new Response(response.body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
    });
  } catch {
    return Response.json({ error: "Event stream unavailable" }, { status: 503 });
  }
}
