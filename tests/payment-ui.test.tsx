// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material/styles";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../components/notifications/NotificationProvider";
import { CreatePaymentDialog } from "../components/payments/CreatePaymentDialog";
import { PaymentDrawer } from "../components/payments/PaymentDrawer";
import { RefundDialog } from "../components/payments/RefundDialog";
import { theme } from "../lib/theme";
import type { Payment } from "../lib/types";

type Ok = { ok: true } | { ok: false; error: string };
const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));
vi.mock("../lib/data", () => ({ useData: () => state.data }));

const captured: Payment = { id: "aaaaaaaa-1111-2222-3333-444444444444", merchantId: "demo_merchant", amountMinor: 10000, currency: "GBP", status: "CAPTURED", refundedAmountMinor: 2000, provider: "SIMULATED", createdAt: "2026-11-15T12:00:00Z", providerStatus: null };
const ok = (): Promise<Ok> => Promise.resolve({ ok: true });
const wrap = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}><NotificationProvider>{ui}</NotificationProvider></ThemeProvider>);

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

describe("Create payment dialog", () => {
  const setup = (create = vi.fn(ok)) => {
    const setCreateOpen = vi.fn();
    state.data = { createOpen: true, setCreateOpen, create, busy: false };
    wrap(<CreatePaymentDialog />);
    return { create, setCreateOpen };
  };
  const amountInput = () => screen.getByLabelText("Amount") as HTMLInputElement;

  it("rejects an invalid amount without calling the API", async () => {
    const { create } = setup();
    fireEvent.change(amountInput(), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Create authorization" }));
    expect(await screen.findByText(/amount/i, { selector: "p" })).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("sends the amount in minor units and closes only after the API confirms", async () => {
    const { create, setCreateOpen } = setup();
    fireEvent.change(amountInput(), { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Create authorization" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(12550, false, "SIMULATED"));
    await waitFor(() => expect(setCreateOpen).toHaveBeenCalledWith(false));
  });

  it("keeps the dialog open, the typed amount, and shows the backend error when the API rejects", async () => {
    const { create, setCreateOpen } = setup(vi.fn(() => Promise.resolve<Ok>({ ok: false, error: "Visa sandbox not configured" })));
    fireEvent.change(amountInput(), { target: { value: "42.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create authorization" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(await screen.findByText("Visa sandbox not configured")).toBeTruthy();
    expect(amountInput().value).toBe("42.00");
    expect(setCreateOpen).not.toHaveBeenCalledWith(false);
  });
});

describe("Refund dialog", () => {
  const setup = (refund = vi.fn(ok)) => {
    state.data = { refund, busy: false };
    const onClose = vi.fn();
    wrap(<RefundDialog payment={captured} open onClose={onClose} />);
    return { refund, onClose };
  };
  const amount = () => screen.getByLabelText("Refund amount") as HTMLInputElement;

  it("shows the refundable balance and refuses an amount above it", async () => {
    const { refund } = setup();
    expect(screen.getByText("£80.00")).toBeTruthy(); // £100.00 captured, £20.00 already refunded
    fireEvent.change(amount(), { target: { value: "80.01" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit refund" }));
    expect(await screen.findByText(/up to £80\.00/)).toBeTruthy();
    expect(refund).not.toHaveBeenCalled();
  });

  it("submits a partial refund in minor units and closes on success", async () => {
    const { refund, onClose } = setup();
    fireEvent.change(amount(), { target: { value: "25.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit refund" }));
    await waitFor(() => expect(refund).toHaveBeenCalledWith(captured.id, 2500));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("stays open and shows the error when the refund is rejected", async () => {
    const { onClose } = setup(vi.fn(() => Promise.resolve<Ok>({ ok: false, error: "Refund exceeds captured amount" })));
    fireEvent.click(screen.getByRole("button", { name: "Refund full remaining" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit refund" }));
    expect(await screen.findByText("Refund exceeds captured amount")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Payment detail drawer", () => {
  const open = (p: Payment, extra: Record<string, unknown> = {}) => {
    const capture = vi.fn(ok), reconcile = vi.fn(ok), select = vi.fn();
    state.data = { payments: [p], selectedId: p.id, select, capture, reconcile, busy: false, opErrors: {}, dismissOpError: vi.fn(), refund: vi.fn(ok), ...extra };
    wrap(<PaymentDrawer />);
    return { capture, reconcile, select };
  };

  it("captures an authorized payment on request", () => {
    const { capture } = open({ ...captured, status: "AUTHORIZED", refundedAmountMinor: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Capture full amount" }));
    expect(capture).toHaveBeenCalledWith(captured.id);
  });

  it("offers a provider status check for a pending capture, with an explicit do-not-resend warning", () => {
    const { reconcile } = open({ ...captured, status: "CAPTURE_PENDING", refundedAmountMinor: 0 });
    expect(screen.getByText(/Do not resend it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check provider status" }));
    expect(reconcile).toHaveBeenCalledWith(captured.id);
  });

  it("keeps a failed operation visible on the payment, not just in a toast", () => {
    const dismissOpError = vi.fn();
    open({ ...captured, status: "AUTHORIZED", refundedAmountMinor: 0 }, { opErrors: { [captured.id]: { title: "Payment processing failed", message: "Only AUTHORIZED payments can be captured", at: 1 } }, dismissOpError });
    const alert = screen.getByText("Only AUTHORIZED payments can be captured").closest("[role=alert]") as HTMLElement;
    expect(within(alert).getByText("Payment processing failed")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: /close/i }));
    expect(dismissOpError).toHaveBeenCalledWith(captured.id);
  });

  it("shows a Visa credential rejection on the payment, distinct from a card decline", () => {
    open({ ...captured, status: "DECLINED", provider: "VISA_SANDBOX", providerStatus: "HTTP_401", refundedAmountMinor: 0 });
    expect(screen.getByText("Visa authentication failed")).toBeTruthy();
    expect(screen.getByText(/rejected the sandbox credentials/)).toBeTruthy();
  });

  it("does not offer capture or refund where the state forbids it", () => {
    open({ ...captured, status: "DECLINED", refundedAmountMinor: 0 });
    expect(screen.queryByRole("button", { name: "Capture full amount" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Issue refund/ })).toBeNull();
    act(() => undefined);
  });
});
