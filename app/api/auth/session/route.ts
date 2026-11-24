import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lets the UI know whether login is in force (to show Sign out) and whether the session is still valid. */
export async function GET(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ authenticated: true, loginRequired: !!gate.config.auth }, { headers: { "cache-control": "no-store" } });
}
