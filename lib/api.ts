import type { Merchant, Payment, ReconciliationReport, Refund, Summary, UpdateMerchantRequest } from "./types";

/** A rejected request. `status` is 0 when the API could not be reached; `fields` carries per-field validation messages. */
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly fields: Record<string, string> = {}) { super(message); this.name = "ApiRequestError"; }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/${path}`, {cache: "no-store", ...options}); }
  catch { throw new ApiRequestError("Cannot reach PayFlow. Check your connection; data on screen may be out of date.", 0); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiRequestError(data.error || `Request failed (${response.status})`, response.status, data.fields && typeof data.fields === "object" ? data.fields : {});
  return data as T;
}
export const api = {
  summary: (days = 30) => request<Summary>(`dashboard/summary?days=${days}`),
  reconciliation: () => request<ReconciliationReport>("reconciliation"),
  payments: (q = "", status = "") => request<Payment[]>(`payments?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  create: (amountMinor: number, currency: string, simulateDecline: boolean, provider = "SIMULATED") =>
    request<Payment>("payments", {
      method: "POST",
      headers: {"content-type": "application/json", "idempotency-key": crypto.randomUUID()},
      body: JSON.stringify({amountMinor,currency,simulateDecline,provider}),
    }),
  capture: (id: string) => request<Payment>(`payments/${encodeURIComponent(id)}/capture`, {
    method: "POST", headers: {"idempotency-key":crypto.randomUUID()},
  }),
  merchants: () => request<Merchant[]>("merchants"),
  updateMerchant: async (merchantId: string, payload: UpdateMerchantRequest): Promise<Merchant> => {
    const m = await request<Merchant>(`merchants/${encodeURIComponent(merchantId)}`, { method: "PATCH", headers: {"content-type": "application/json"}, body: JSON.stringify(payload) });
    // Never treat a malformed 2xx as a confirmed save.
    if (!m || typeof m.id !== "string" || typeof m.displayName !== "string") throw new ApiRequestError("Unexpected response from PayFlow", 502);
    return m;
  },
  reconcile: (id: string) => request<Payment>(`payments/${encodeURIComponent(id)}/reconcile`, { method: "POST" }),
  refund: (id: string, amountMinor: number) => request<Refund>(`payments/${encodeURIComponent(id)}/refunds`, {
    method: "POST", headers: {"content-type": "application/json", "idempotency-key":crypto.randomUUID()},
    body: JSON.stringify({amountMinor}),
  }),
};

export function formatMoney(amountMinor: number, currency="GBP") {
  return new Intl.NumberFormat("en-GB", {style:"currency",currency}).format(amountMinor/100);
}
export function formatDate(date: string) {
  return new Date(date).toLocaleString("en-GB", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
