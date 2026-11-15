import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "../lib/api";
import { changedFields, MERCHANTS_KEY, toForm, updateMerchantFlow, validateMerchant } from "../lib/merchants";
import type { Merchant } from "../lib/types";

const merchant: Merchant = { id: "demo_merchant", displayName: "Acme Demo Store", contactEmail: null, businessName: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const saved = (over: Partial<Merchant> = {}): Merchant => ({ ...merchant, ...over, updatedAt: "2026-11-15T13:00:00Z" });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("form validation", () => {
  it("requires a display name", () => {
    expect(validateMerchant({ ...toForm(merchant), displayName: "   " }).displayName).toBe("Display name is required");
    expect(validateMerchant(toForm(merchant))).toEqual({});
  });
  it("rejects invalid emails but allows an empty one", () => {
    for (const bad of ["nope", "a@b", "a b@c.example", "@c.example"]) expect(validateMerchant({ ...toForm(merchant), contactEmail: bad }).contactEmail, bad).toBe("Enter a valid email address");
    expect(validateMerchant({ ...toForm(merchant), contactEmail: "" }).contactEmail).toBeUndefined();
    expect(validateMerchant({ ...toForm(merchant), contactEmail: "ops@acme.example" }).contactEmail).toBeUndefined();
  });
  it("enforces length limits", () => {
    expect(validateMerchant({ ...toForm(merchant), displayName: "x".repeat(121) }).displayName).toMatch(/120/);
    expect(validateMerchant({ ...toForm(merchant), businessName: "x".repeat(121) }).businessName).toMatch(/120/);
  });
  it("sends only changed fields, and an emptied optional field as an empty string", () => {
    expect(changedFields(merchant, toForm(merchant))).toEqual({});
    expect(changedFields(merchant, { ...toForm(merchant), displayName: " New Name " })).toEqual({ displayName: "New Name" });
    const withEmail = saved({ contactEmail: "a@b.example" });
    expect(changedFields(withEmail, { ...toForm(withEmail), contactEmail: "" })).toEqual({ contactEmail: "" });
  });
});

describe("updateMerchantFlow", () => {
  const setup = () => {
    const client = new QueryClient();
    client.setQueryData(MERCHANTS_KEY, [merchant]);
    const notify = vi.fn();
    return { client, notify };
  };

  it("notifies success only after the backend confirms, then updates the cached list", async () => {
    const { client, notify } = setup();
    let confirm!: (m: Merchant) => void;
    const update = vi.fn(() => new Promise<Merchant>((r) => { confirm = r; }));
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const pending = updateMerchantFlow({ update, notify, client }, merchant.id, { displayName: "Acme Retail" });
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled(); // pending: no premature success
    expect(client.getQueryData<Merchant[]>(MERCHANTS_KEY)![0].displayName).toBe("Acme Demo Store"); // no optimistic write

    confirm(saved({ displayName: "Acme Retail" }));
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "Merchant updated", description: "Merchant information has been saved successfully." }));
    // The merchant list is refreshed: cache holds the confirmed record and a refetch is requested.
    expect(client.getQueryData<Merchant[]>(MERCHANTS_KEY)![0].displayName).toBe("Acme Retail");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MERCHANTS_KEY });
  });

  it("on a validation rejection shows the safe backend message, keeps the cache, and returns field errors", async () => {
    const { client, notify } = setup();
    const update = vi.fn().mockRejectedValue(new ApiRequestError("Invalid request fields", 400, { contactEmail: "Enter a valid email address" }));
    const r = await updateMerchantFlow({ update, notify, client }, merchant.id, { contactEmail: "bad" });
    expect(r).toEqual({ ok: false, error: "Invalid request fields", fields: { contactEmail: "Enter a valid email address" } });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "Unable to update merchant", description: "Invalid request fields", duration: 6000 }));
    expect(client.getQueryData<Merchant[]>(MERCHANTS_KEY)![0]).toEqual(merchant);
  });

  it("uses a generic message for server failures so internal details are never shown", async () => {
    const { client, notify } = setup();
    const update = vi.fn().mockRejectedValue(new ApiRequestError("ERROR: duplicate key value violates constraint merchants_pkey", 500));
    const r = await updateMerchantFlow({ update, notify, client }, merchant.id, { displayName: "X" });
    expect(r.ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "error", description: "Your changes could not be saved. Please try again." }));
    expect(JSON.stringify(notify.mock.calls)).not.toContain("duplicate key");
  });

  it("reports permission and not-found errors, and connection failures", async () => {
    for (const [status, message] of [[404, "Merchant not found"], [403, "You cannot manage this merchant"], [0, "Cannot reach PayFlow. Check your connection; data on screen may be out of date."]] as const) {
      const { client, notify } = setup();
      const r = await updateMerchantFlow({ update: vi.fn().mockRejectedValue(new ApiRequestError(message, status)), notify, client }, merchant.id, { displayName: "X" });
      expect(r.ok).toBe(false);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "Unable to update merchant", description: message }));
    }
  });
});

describe("api.updateMerchant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a PATCH with only the given fields and returns the saved merchant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, saved({ displayName: "Acme Retail" })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await api.updateMerchant("demo_merchant", { displayName: "Acme Retail" });
    expect(m.displayName).toBe("Acme Retail");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/merchants/demo_merchant");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ displayName: "Acme Retail" });
  });

  it("surfaces field errors and status from the backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(400, { error: "Invalid request fields", fields: { displayName: "Display name is required" } })));
    await expect(api.updateMerchant("demo_merchant", { displayName: " " })).rejects.toMatchObject({ status: 400, message: "Invalid request fields", fields: { displayName: "Display name is required" } });
  });

  it("maps 401, 404 and an unreachable API to errors, never a success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: "Unauthorized" })));
    await expect(api.updateMerchant("m", { displayName: "x" })).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(404, { error: "Merchant not found" })));
    await expect(api.updateMerchant("m", { displayName: "x" })).rejects.toMatchObject({ status: 404, message: "Merchant not found" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(api.updateMerchant("m", { displayName: "x" })).rejects.toMatchObject({ status: 0 });
  });

  it("rejects a 2xx response that is not a merchant", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { ok: true })));
    await expect(api.updateMerchant("m", { displayName: "x" })).rejects.toBeInstanceOf(ApiRequestError);
  });
});
