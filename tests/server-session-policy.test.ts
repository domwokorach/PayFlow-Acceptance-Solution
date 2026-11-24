import { describe, expect, it } from "vitest";
import { decide, isSameOrigin } from "../lib/server/policy";
import { createSession, safeEqual, verifySession } from "../lib/server/session";

const SECRET = "x".repeat(40);
const ID = "3f2b8c1e-8d4a-4a53-9b0e-2f7d1c6a9e11";

describe("sessions", () => {
  it("round-trips and expires", async () => {
    const t = await createSession(SECRET, "operator", 60, 1_000_000);
    expect((await verifySession(SECRET, t, 1_030_000))?.sub).toBe("operator");
    expect(await verifySession(SECRET, t, 1_061_000)).toBeNull();
  });
  it("rejects tampering, another secret and junk", async () => {
    const t = await createSession(SECRET, "operator", 60);
    const [p, s] = t.split(".");
    expect(await verifySession(SECRET, `${btoa(JSON.stringify({ sub: "admin", exp: 9e9 }))}.${s}`)).toBeNull();
    expect(await verifySession("y".repeat(40), t)).toBeNull();
    expect(await verifySession(SECRET, `${p}.`)).toBeNull();
    for (const junk of [undefined, "", "a.b.c", "not-a-token", "x".repeat(600)]) expect(await verifySession(SECRET, junk)).toBeNull();
  });
  it("compares strings safely", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("route policy", () => {
  it("allows the dashboard's routes", () => {
    for (const [m, p] of [["GET", "payments"], ["POST", "payments"], ["GET", `payments/${ID}`], ["POST", `payments/${ID}/capture`], ["POST", `payments/${ID}/refunds`], ["POST", `payments/${ID}/reconcile`],
      ["GET", "dashboard/summary"], ["GET", "reconciliation"], ["GET", "merchants"], ["PATCH", "merchants/demo_merchant"]] as const)
      expect(decide(m, p.split("/")), `${m} ${p}`).toMatchObject({ ok: true });
  });
  it("marks mutations", () => {
    expect(decide("GET", ["payments"])).toMatchObject({ mutating: false });
    expect(decide("POST", ["payments"])).toMatchObject({ mutating: true });
  });
  it("refuses everything else", () => {
    for (const p of [["actuator", "prometheus"], ["events", "stream"], ["payments", "not-a-uuid"], ["payments", ID, "delete"], ["..", "actuator"], ["merchants", "a/b"], ["merchants", "x".repeat(61)], []])
      expect(decide("GET", p as string[]), p.join("/")).toMatchObject({ ok: false, status: 404 });
  });
  it("refuses wrong methods", () => {
    expect(decide("DELETE", ["payments"])).toMatchObject({ ok: false, status: 405 });
    expect(decide("GET", [`payments`, ID, "capture"])).toMatchObject({ ok: false, status: 405 });
    expect(decide("POST", ["merchants"])).toMatchObject({ ok: false, status: 405 });
  });
});

describe("same-origin check", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("accepts matching origin or same-origin fetch metadata", () => {
    expect(isSameOrigin(h({ origin: "https://app.example", host: "app.example" }))).toBe(true);
    expect(isSameOrigin(h({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://app.example", "x-forwarded-host": "app.example", host: "internal" }))).toBe(true);
  });
  it("rejects cross-site and header-less requests", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "app.example" }))).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site", origin: "https://app.example", host: "app.example" }))).toBe(false);
    expect(isSameOrigin(h({ host: "app.example" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "app.example" }))).toBe(false);
  });
});
