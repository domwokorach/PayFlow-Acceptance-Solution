/**
 * Sanitised operational logging. Only fixed, non-sensitive fields are ever written: no URLs with query strings,
 * headers, cookies, request or response bodies, keys, or error messages (which can echo upstream content).
 */
export interface LogFields { event: string; route?: string; method?: string; status?: number; reason?: string; ms?: number; requestId?: string }

export function logEvent(level: "info" | "warn" | "error", fields: LogFields) {
  const line = JSON.stringify({ level, service: "payflow-web", at: new Date().toISOString(), ...fields });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(line);
}

/** Collapses ids so log lines stay low-cardinality and never carry a payment or merchant identifier. */
export const routeTemplate = (path: string[]) => path.map((p, i) => (i > 0 && /^[0-9a-fA-F-]{36}$/.test(p) ? ":id" : i === 1 && path[0] === "merchants" ? ":id" : p)).join("/");

/** Exposes only the error class: timeouts and network failures are distinguishable without echoing messages. */
export const failureReason = (e: unknown) => (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network");
