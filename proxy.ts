import { NextRequest, NextResponse } from "next/server";
import { loadConfig, ConfigError } from "./lib/server/config";
import { sessionCookieName, verifySession } from "./lib/server/session";

/**
 * Page gate. When login is configured (always, in a public deployment) every page redirects to /login without a
 * valid session. API routes enforce the same rule themselves (lib/server/auth.ts), so this is not the only line of
 * defence. Misconfiguration serves a plain 503 rather than an unprotected dashboard.
 */
export async function proxy(request: NextRequest) {
  let config;
  try { config = loadConfig(); }
  catch (e) {
    console.error(JSON.stringify({ level: "error", service: "payflow-web", event: "config_invalid", reason: e instanceof ConfigError ? e.problems.join("; ") : "unknown" }));
    return new NextResponse("Service is not configured", { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!config.auth) return NextResponse.next();
  const session = await verifySession(config.auth.sessionSecret, request.cookies.get(sessionCookieName(config.publicDeployment))?.value);
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  if (session) return NextResponse.next();
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// API routes, Next internals and static assets are excluded; API routes authenticate themselves.
export const config = { matcher: ["/((?!api/|_next/|favicon.ico|logo.png|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
