import { NextRequest, NextResponse } from "next/server";

// Server-side proxy: the development demo key is never shipped to browser JavaScript.
// This is NOT a substitute for real user sessions, OAuth2, or public access controls.
type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstream = process.env.PAYFLOW_API_ORIGIN || "http://localhost:8080";
  const url = `${upstream}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers({
    "X-Demo-Api-Key": process.env.PAYFLOW_DEMO_API_KEY || "local-only-change-me",
    "Accept": "application/json",
  });
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (contentType) headers.set("content-type", contentType);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json",
                 "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({error: "Payment API unavailable — check Docker services"}, {status: 502});
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
