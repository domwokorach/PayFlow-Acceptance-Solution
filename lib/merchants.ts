import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api";
import type { NotifyInput } from "./notifications/notification-types";
import type { Merchant, UpdateMerchantRequest } from "./types";

export interface MerchantForm { displayName: string; contactEmail: string; businessName: string }
export type MerchantFormErrors = Partial<Record<keyof MerchantForm, string>>;

export const MERCHANTS_KEY = ["merchants"] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // mirrors the backend rule so both sides agree

export const toForm = (m: Merchant): MerchantForm => ({ displayName: m.displayName, contactEmail: m.contactEmail ?? "", businessName: m.businessName ?? "" });

/** Client-side checks. The backend repeats them and stays authoritative. */
export function validateMerchant(f: MerchantForm): MerchantFormErrors {
  const e: MerchantFormErrors = {};
  const name = f.displayName.trim(), email = f.contactEmail.trim(), business = f.businessName.trim();
  if (!name) e.displayName = "Display name is required";
  else if (name.length > 120) e.displayName = "Use 120 characters or fewer";
  if (email.length > 254) e.contactEmail = "Use 254 characters or fewer";
  else if (email && !EMAIL.test(email)) e.contactEmail = "Enter a valid email address";
  if (business.length > 120) e.businessName = "Use 120 characters or fewer";
  return e;
}

/** Only the fields that changed. An emptied optional field is sent as "" so the backend clears it. */
export function changedFields(original: Merchant, f: MerchantForm): UpdateMerchantRequest {
  const next = toForm({ ...original, displayName: f.displayName, contactEmail: f.contactEmail, businessName: f.businessName });
  const was = toForm(original), out: UpdateMerchantRequest = {};
  (Object.keys(next) as (keyof MerchantForm)[]).forEach((k) => { if (next[k].trim() !== was[k].trim()) out[k] = next[k].trim(); });
  return out;
}

export type MerchantUpdateResult = { ok: true; merchant: Merchant } | { ok: false; error: string; fields: MerchantFormErrors };

/** Backend text is shown only for client errors (validation, permission, not found), where it is written to be safe to show. */
function failureMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.status === 0) return e.message;
    if (e.status >= 400 && e.status < 500 && e.message) return e.message;
  }
  return "Your changes could not be saved. Please try again.";
}

/**
 * The whole update flow, kept free of React so it can be tested. A success notification and cache update happen only after
 * the backend has confirmed persistence; on failure the cache is untouched and the caller keeps the user's form values.
 */
export async function updateMerchantFlow(deps: {
  update: (id: string, p: UpdateMerchantRequest) => Promise<Merchant>;
  notify: (n: NotifyInput) => unknown;
  client: QueryClient;
}, id: string, payload: UpdateMerchantRequest): Promise<MerchantUpdateResult> {
  try {
    const merchant = await deps.update(id, payload);
    deps.client.setQueryData<Merchant[]>(MERCHANTS_KEY, (list) => (list ? list.map((m) => (m.id === merchant.id ? merchant : m)) : [merchant]));
    void deps.client.invalidateQueries({ queryKey: MERCHANTS_KEY });
    deps.notify({ type: "success", category: "merchant", title: "Merchant updated", description: "Merchant information has been saved successfully.", dedupeKey: `merchant-updated|${id}` });
    return { ok: true, merchant };
  } catch (e) {
    const error = failureMessage(e);
    deps.notify({ type: "error", category: "merchant", title: "Unable to update merchant", description: error, duration: 6000, dedupeKey: `merchant-update-failed|${id}|${error}` });
    return { ok: false, error, fields: e instanceof ApiRequestError ? (e.fields as MerchantFormErrors) : {} };
  }
}
