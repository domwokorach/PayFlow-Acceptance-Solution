import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../lib/server/config";

const PUBLIC = {
  VERCEL: "1", PAYFLOW_API_ORIGIN: "https://api.payflow.example", PAYFLOW_DEMO_API_KEY: "k".repeat(40),
  PAYFLOW_DASHBOARD_PASSWORD: "correct horse battery", PAYFLOW_SESSION_SECRET: "s".repeat(40),
};
const problems = (env: Record<string, string>) => { try { loadConfig(env); return []; } catch (e) { return (e as ConfigError).problems; } };

describe("server configuration", () => {
  it("allows the localhost fallback and demo key in local mode, with no login", () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ publicDeployment: false, apiOrigin: "http://localhost:8080", auth: null });
  });
  it("accepts a complete public configuration", () => {
    const c = loadConfig(PUBLIC);
    expect(c.publicDeployment).toBe(true);
    expect(c.apiOrigin).toBe("https://api.payflow.example");
    expect(c.auth?.username).toBe("operator");
  });
  it.each(["PAYFLOW_API_ORIGIN", "PAYFLOW_DEMO_API_KEY", "PAYFLOW_DASHBOARD_PASSWORD", "PAYFLOW_SESSION_SECRET"])("refuses a public deployment without %s (no localhost or default fallback)", (name) => {
    const env: Record<string, string> = { ...PUBLIC }; delete env[name];
    expect(problems(env).join()).toContain(name);
  });
  it("refuses localhost, private and plain-http origins when public", () => {
    for (const o of ["http://localhost:8080", "https://localhost", "https://127.0.0.1", "https://10.1.2.3", "https://192.168.1.5", "https://db.internal", "http://api.example.com"])
      expect(problems({ ...PUBLIC, PAYFLOW_API_ORIGIN: o }).join(), o).toContain("PAYFLOW_API_ORIGIN");
  });
  it("refuses the well-known local key and short secrets when public", () => {
    expect(problems({ ...PUBLIC, PAYFLOW_DEMO_API_KEY: "local-only-change-me" }).join()).toContain("well-known");
    expect(problems({ ...PUBLIC, PAYFLOW_DEMO_API_KEY: "short" }).join()).toContain("at least 32");
    expect(problems({ ...PUBLIC, PAYFLOW_SESSION_SECRET: "short" }).join()).toContain("PAYFLOW_SESSION_SECRET");
    expect(problems({ ...PUBLIC, PAYFLOW_DASHBOARD_PASSWORD: "short" }).join()).toContain("PAYFLOW_DASHBOARD_PASSWORD");
  });
  it("never puts a secret value in the error", () => {
    const secret = "do-not-leak-this-value-0123456789abcdef";
    const msg = problems({ ...PUBLIC, PAYFLOW_DEMO_API_KEY: "local-only-change-me", PAYFLOW_SESSION_SECRET: secret, PAYFLOW_DASHBOARD_PASSWORD: secret }).join();
    expect(msg).not.toContain(secret);
  });
  it("treats PAYFLOW_PUBLIC_DEPLOYMENT=true like Vercel", () => {
    expect(problems({ PAYFLOW_PUBLIC_DEPLOYMENT: "true" }).length).toBeGreaterThan(0);
  });
  it("requires a complete login when local login is partially configured", () => {
    expect(problems({ PAYFLOW_DASHBOARD_PASSWORD: "a-long-enough-password" }).join()).toContain("PAYFLOW_SESSION_SECRET");
  });
  it("validates the timeout range", () => {
    expect(problems({ PAYFLOW_API_TIMEOUT_MS: "50" }).join()).toContain("PAYFLOW_API_TIMEOUT_MS");
    expect(loadConfig({ PAYFLOW_API_TIMEOUT_MS: "5000" }).timeoutMs).toBe(5000);
  });
});
