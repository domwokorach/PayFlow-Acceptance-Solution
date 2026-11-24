import { NextResponse } from "next/server";
import type { ServerConfig } from "./config";

/** Headers sent to the backend are built from nothing: nothing the browser sent (cookies, auth, merchant hints) is forwarded. */
export function upstreamHeaders(config: ServerConfig, accept: string): Headers {
  return new Headers({ "X-Api-Key": config.apiKey, Accept: accept, "User-Agent": "payflow-web-proxy" });
}

const noStore = { "cache-control": "no-store" };
export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

/** Message shown when the backend cannot be reached. Local mode keeps the Docker hint; public mode must not suggest it. */
export const unavailableMessage = (config: ServerConfig) =>
  config.publicDeployment ? "Payment API unavailable. Please try again shortly." : "Payment API unavailable — check Docker services";
