import { describe, expect, it } from "vitest";
import { safeNext } from "../components/auth/LoginForm";

describe("post-login redirect", () => {
  it("keeps same-site paths", () => { expect(safeNext("/payments")).toBe("/payments"); expect(safeNext("/analytics")).toBe("/analytics"); });
  it("rejects open redirects and loops", () => {
    for (const bad of [null, "", "//evil.example", "https://evil.example", "/\\evil.example", "/login", "/api/payments", "javascript:alert(1)"]) expect(safeNext(bad), String(bad)).toBe("/");
  });
});
