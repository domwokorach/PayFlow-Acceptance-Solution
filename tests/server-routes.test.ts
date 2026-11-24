import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "../lib/server/config";
import { resetLoginLimitForTests } from "../lib/server/login-limit";
import { createSession } from "../lib/server/session";
import { GET as proxyGet, POST as proxyPost } from "../app/api/[...path]/route";
import { GET as streamGet } from "../app/api/events/stream/route";
import { GET as healthGet } from "../app/api/health/route";
import { POST as loginPost } from "../app/api/auth/login/route";

const API_KEY = "backend-key-".padEnd(40, "z"), SECRET = "session-secret-".padEnd(40, "q"), PASSWORD = "a-strong-passphrase";
const PUBLIC_ENV = { VERCEL: "1", PAYFLOW_API_ORIGIN: "https://api.payflow.example", PAYFLOW_DEMO_API_KEY: API_KEY, PAYFLOW_DASHBOARD_PASSWORD: PASSWORD, PAYFLOW_SESSION_SECRET: SECRET };
const ID = "3f2b8c1e-8d4a-4a53-9b0e-2f7d1c6a9e11";
const COOKIE = "__Host-payflow_session";

const setEnv = (env: Record<string, string>) => { for (const k of Object.keys(PUBLIC_ENV)) vi.stubEnv(k, ""); for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); resetConfigForTests(); };
const session = async () => `${COOKIE}=${await createSession(SECRET, "operator", 600)}`;
const req = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const { cookie, headers, signal: _signal, ...rest } = init;
  return new NextRequest(`https://app.example${path}`, { ...rest, headers: { host: "app.example", ...(cookie ? { cookie } : {}), ...(headers as Record<string, string>) } });
};
const ctx = (p: string) => ({ params: Promise.resolve({ path: p.split("/") }) });
const fetchMock = vi.fn();
const logs: string[] = [];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); logs.length = 0; resetLoginLimitForTests();
  for (const m of ["info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(String(a[0])); });
  setEnv(PUBLIC_ENV);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resetConfigForTests(); });

describe("proxy authentication", () => {
  it("rejects requests without a session and never calls the backend", async () => {
    const r = await proxyGet(req("/api/payments"), ctx("payments"));
    expect(r.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a forged cookie", async () => {
    const r = await proxyGet(req("/api/payments", { cookie: `${COOKIE}=forged.value` }), ctx("payments"));
    expect(r.status).toBe(401);
  });
  it("fails closed with 503 when the public configuration is incomplete", async () => {
    setEnv({ ...PUBLIC_ENV, PAYFLOW_DEMO_API_KEY: "" });
    const r = await proxyGet(req("/api/payments", { cookie: await session() }), ctx("payments"));
    expect(r.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await r.json())).not.toContain("PAYFLOW_DEMO_API_KEY");
  });
});

describe("proxy forwarding", () => {
  it("forwards with the server-held key and without browser credentials", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    const r = await proxyGet(req("/api/payments?q=a", { cookie: await session(), headers: { authorization: "Bearer attacker", "x-api-key": "attacker", "x-merchant-id": "other" } }), ctx("payments"));
    expect(r.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.payflow.example/api/v1/payments?q=a");
    const h = init.headers as Headers;
    expect(h.get("x-api-key")).toBe(API_KEY);
    for (const n of ["authorization", "cookie", "x-merchant-id"]) expect(h.has(n)).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("blocks routes outside the allowlist", async () => {
    const c = await session();
    for (const p of ["actuator/prometheus", "events/stream", "admin/keys"]) expect((await proxyGet(req(`/api/${p}`, { cookie: c }), ctx(p))).status, p).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations", async () => {
    const r = await proxyPost(req("/api/payments", { method: "POST", cookie: await session(), headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), ctx("payments"));
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forwards same-origin mutations with the idempotency key", async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"1"}', { status: 201, headers: { "content-type": "application/json" } }));
    const r = await proxyPost(req("/api/payments", { method: "POST", cookie: await session(), headers: { origin: "https://app.example", "content-type": "application/json", "idempotency-key": "abc" }, body: '{"amountMinor":100}' }), ctx("payments"));
    expect(r.status).toBe(201);
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("idempotency-key")).toBe("abc");
  });
  it("rejects oversized bodies", async () => {
    const r = await proxyPost(req("/api/payments", { method: "POST", cookie: await session(), headers: { origin: "https://app.example" }, body: "x".repeat(20_000) }), ctx("payments"));
    expect(r.status).toBe(413);
  });
  it("passes backend validation errors through", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"Invalid","fields":{"amountMinor":"must be positive"}}', { status: 400, headers: { "content-type": "application/json" } }));
    const r = await proxyGet(req(`/api/payments/${ID}`, { cookie: await session() }), ctx(`payments/${ID}`));
    expect(r.status).toBe(400);
    expect((await r.json()).fields.amountMinor).toBeDefined();
  });
  it("hides backend 5xx bodies and credential rejections", async () => {
    fetchMock.mockResolvedValueOnce(new Response("java.lang.NullPointerException at dev.payflow", { status: 500 }));
    const a = await proxyGet(req("/api/reconciliation", { cookie: await session() }), ctx("reconciliation"));
    expect(a.status).toBe(502); expect(await a.text()).not.toContain("NullPointer");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect((await proxyGet(req("/api/reconciliation", { cookie: await session() }), ctx("reconciliation"))).status).toBe(502);
  });
  it("returns 504 on timeout and 502 when unreachable, with no Docker hint when public", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("t", "TimeoutError"));
    expect((await proxyGet(req("/api/reconciliation", { cookie: await session() }), ctx("reconciliation"))).status).toBe(504);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: ECONNREFUSED https://api.payflow.example"));
    const r = await proxyGet(req("/api/reconciliation", { cookie: await session() }), ctx("reconciliation"));
    expect(r.status).toBe(502);
    expect((await r.json()).error).not.toMatch(/docker/i);
  });
  it("logs without secrets, query strings, ids or error messages", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`boom ${API_KEY}`));
    await proxyGet(req(`/api/payments/${ID}?q=secret-search`, { cookie: await session() }), ctx(`payments/${ID}`));
    const all = logs.join("\n");
    expect(all).toContain("proxy_failed");
    for (const s of [API_KEY, SECRET, "secret-search", ID, "boom"]) expect(all).not.toContain(s);
  });
});

describe("local mode", () => {
  it("keeps working against localhost without login", async () => {
    setEnv({});
    fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    const r = await proxyGet(new NextRequest("http://localhost:3000/api/payments", { headers: { host: "localhost:3000" } }), ctx("payments"));
    expect(r.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/api/v1/payments");
  });
});

describe("event stream proxy", () => {
  it("requires a session", async () => {
    expect((await streamGet(req("/api/events/stream"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("streams with the server key and forwards only the numeric cursor", async () => {
    fetchMock.mockResolvedValue(new Response("event: ready\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }));
    const r = await streamGet(req("/api/events/stream?lastEventId=42&evil=1", { cookie: await session(), headers: { "last-event-id": "41" } }));
    expect(r.headers.get("content-type")).toBe("text/event-stream");
    expect(await r.text()).toContain("event: ready");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.payflow.example/api/v1/events/stream?lastEventId=42");
    expect((init.headers as Headers).get("x-api-key")).toBe(API_KEY);
    expect((init.headers as Headers).get("last-event-id")).toBe("41");
  });
  it("ends cleanly when the upstream stream errors, so the client can resume", async () => {
    let n = 0;
    const body = new ReadableStream({ pull(c) { if (n++ === 0) c.enqueue(new TextEncoder().encode(": hb\n\n")); else c.error(new Error("reset")); } }, { highWaterMark: 0 });
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));
    const r = await streamGet(req("/api/events/stream", { cookie: await session() }));
    expect(await r.text()).toContain(": hb");
  });
  it("returns 503 when the backend refuses the stream", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await streamGet(req("/api/events/stream", { cookie: await session() }))).status).toBe(503);
  });
});

describe("health", () => {
  it("reports ok when the backend is up, without internals", async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"UP","components":{"db":{}}}', { status: 200 }));
    const r = await healthGet();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok", web: "up", api: "up" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.payflow.example/actuator/health");
  });
  it("reports degraded when the backend is down and misconfigured when config is bad", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await healthGet()).status).toBe(503);
    setEnv({ VERCEL: "1" });
    expect(await (await healthGet()).json()).toMatchObject({ status: "misconfigured" });
  });
});

describe("login", () => {
  const login = (body: unknown, headers: Record<string, string> = {}) =>
    loginPost(req("/api/auth/login", { method: "POST", headers: { origin: "https://app.example", "content-type": "application/json", "x-real-ip": "1.2.3.4", ...headers }, body: JSON.stringify(body) }));
  it("issues an HttpOnly, Secure, host-bound cookie for correct credentials", async () => {
    const r = await login({ username: "operator", password: PASSWORD });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${COOKIE}=`);
    for (const a of ["HttpOnly", "Secure", "Path=/", "SameSite=lax"]) expect(cookie.toLowerCase()).toContain(a.toLowerCase());
    expect(cookie).not.toContain("Domain");
  });
  it("rejects wrong credentials uniformly", async () => {
    const a = await login({ username: "operator", password: "wrong" }), b = await login({ username: "nobody", password: PASSWORD });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
  });
  it("throttles repeated failures, even for the right password afterwards", async () => {
    for (let i = 0; i < 5; i++) await login({ username: "operator", password: "wrong" });
    expect((await login({ username: "operator", password: PASSWORD })).status).toBe(429);
  });
  it("rejects cross-origin and malformed requests", async () => {
    expect((await login({ username: "operator", password: PASSWORD }, { origin: "https://evil.example" })).status).toBe(403);
    const r = await loginPost(req("/api/auth/login", { method: "POST", headers: { origin: "https://app.example" }, body: "not json" }));
    expect(r.status).toBe(400);
  });
});
