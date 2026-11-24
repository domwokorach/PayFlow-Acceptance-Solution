import { NextRequest, NextResponse } from "next/server";
import { isPublicDeployment } from "../../../../lib/server/config";
import { isSameOrigin } from "../../../../lib/server/policy";
import { sessionCookieName } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pub = isPublicDeployment();
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(sessionCookieName(pub), "", { httpOnly: true, secure: pub, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
