// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material/styles";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../components/notifications/NotificationProvider";
import { CreatePaymentDialog } from "../components/payments/CreatePaymentDialog";
import { PaymentDrawer } from "../components/payments/PaymentDrawer";
import { PaymentsTable } from "../components/payments/PaymentsTable";
import { MetricCard } from "../components/ui/MetricCard";
import { theme } from "../lib/theme";
import type { Payment } from "../lib/types";

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("../lib/data", () => ({ useData: () => state.data }));

const pay = (id: string, status: Payment["status"]): Payment => ({ id, merchantId: "demo_merchant", amountMinor: 14750, currency: "GBP", status, refundedAmountMinor: 0, provider: "SIMULATED", createdAt: "2026-11-15T12:00:00Z" });
const authorized = pay("aaaaaaaa-1111-2222-3333-444444444444", "AUTHORIZED");
const wrap = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}><NotificationProvider>{ui}</NotificationProvider></ThemeProvider>);

// jsdom has no layout or canvas, so colour-contrast is covered by audit-contrast.test.ts instead.
const scan = (el: Element) => axe(el, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

describe("axe", () => {
  it("payments table", async () => {
    state.data = { select: vi.fn(), selectedId: null, loading: false, capture: vi.fn(), busy: false, changed: new Set() };
    const { container } = wrap(<PaymentsTable rows={[authorized, pay("bbbbbbbb-1111-2222-3333-444444444444", "CAPTURED")]} />);
    expect((await scan(container)).violations).toEqual([]);
  });
  it("KPI card with info", async () => {
    const { container } = wrap(<MetricCard label="Captured volume" value="£8,123.45" info="Gross volume" />);
    expect((await scan(container)).violations).toEqual([]);
  });
  it("create payment dialog", async () => {
    state.data = { createOpen: true, setCreateOpen: vi.fn(), create: vi.fn(), busy: false };
    wrap(<CreatePaymentDialog />);
    expect((await scan(screen.getByRole("dialog"))).violations).toEqual([]);
  });
  it("payment drawer", async () => {
    state.data = { payments: [authorized], selectedId: authorized.id, select: vi.fn(), capture: vi.fn(), busy: false, opErrors: {}, dismissOpError: vi.fn() };
    wrap(<PaymentDrawer />);
    expect((await scan(screen.getByRole("dialog"))).violations).toEqual([]);
  });
});

describe("focus management", () => {
  it("returns focus to the row's button after an inline capture", async () => {
    const capture = vi.fn(() => Promise.resolve({ ok: true }));
    state.data = { select: vi.fn(), selectedId: null, loading: false, capture, busy: false, changed: new Set() };
    wrap(<PaymentsTable rows={[authorized]} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: `Capture payment ${authorized.id}` })); });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^aaaaaaaa…/ }));
  });
  it("has no tab stop on the row itself", () => {
    state.data = { select: vi.fn(), selectedId: null, loading: false, capture: vi.fn(), busy: false, changed: new Set() };
    wrap(<PaymentsTable rows={[authorized]} />);
    expect(screen.getAllByRole("row").some((r) => r.hasAttribute("tabindex"))).toBe(false);
  });
  it("moves focus to the amount field when it is invalid", async () => {
    state.data = { createOpen: true, setCreateOpen: vi.fn(), create: vi.fn(), busy: false };
    wrap(<CreatePaymentDialog />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "abc" } });
    (screen.getByRole("button", { name: "Create authorization" })).focus();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create authorization" })); });
    expect(document.activeElement).toBe(screen.getByLabelText("Amount"));
  });
  it("moves focus to the status after Capture in the drawer", async () => {
    const capture = vi.fn(() => Promise.resolve({ ok: true }));
    state.data = { payments: [authorized], selectedId: authorized.id, select: vi.fn(), capture, busy: false, opErrors: {}, dismissOpError: vi.fn() };
    wrap(<PaymentDrawer />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Capture full amount" })); });
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement?.textContent).toMatch(/authorized/i);
  });
});
