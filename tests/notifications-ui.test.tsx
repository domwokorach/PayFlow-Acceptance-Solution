// @vitest-environment jsdom
import { useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import { QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "../components/notifications/NotificationCenter";
import { ModalLiveRegions } from "../components/notifications/LiveRegions";
import { NotificationProvider } from "../components/notifications/NotificationProvider";
import { useNotification } from "../hooks/useNotification";
import { ApiRequestError } from "../lib/api";
import { MERCHANTS_KEY, updateMerchantFlow } from "../lib/merchants";
import type { NotificationApi } from "../lib/notifications/notification-types";
import { apiFailureNotice, captureNotice } from "../lib/notifications/notification-utils";
import { theme } from "../lib/theme";
import type { Merchant, Payment } from "../lib/types";

const selectSpy = vi.fn();
const payments: Payment[] = [{ id: "aaaaaaaa-0000-0000-0000-000000000001", merchantId: "m", amountMinor: 9900, currency: "GBP", status: "DECLINED", refundedAmountMinor: 0, provider: "SIMULATED", createdAt: "2026-11-15T12:00:00Z" }];
vi.mock("../lib/data", () => ({ useData: () => ({ payments, select: selectSpy }) }));

let api!: NotificationApi;
function Probe() { const current = useNotification(); useEffect(() => { api = current; }); return null; }

function stubMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion: reduce"), media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const mount = (ui?: React.ReactNode) => render(<ThemeProvider theme={theme}><NotificationProvider><Probe />{ui}</NotificationProvider></ThemeProvider>);
const run = (fn: () => void) => act(() => { fn(); });
// Advance in small steps, each in its own act(): React batches updates inside one act(), which would delay an exit by a whole extra cycle.
const tick = (ms: number) => { for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(Math.min(50, ms - t)); }); };
const toasts = () => screen.queryAllByRole("group");
const toastTitles = () => toasts().map((t) => t.querySelector("p")?.textContent);

beforeEach(() => { vi.useFakeTimers(); stubMatchMedia(false); selectSpy.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("animation and automatic dismissal", () => {
  it("slides in and out around a 4 second visible period for success, then unmounts", () => {
    // jsdom has no layout, so give elements a size; the slide distance is measured from it.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 20, left: 0, bottom: 100, right: 400, width: 400, height: 80, x: 0, y: 20, toJSON: () => ({}) });
    mount();
    run(() => api.notify.success("Payment captured", { description: "Confirmed." }));
    const toast = screen.getByRole("group");
    const slide = toast.parentElement!.parentElement as HTMLElement; // the element the Slide transition drives
    tick(50);
    expect(slide.style.transition).toContain("300ms");        // entrance runs for 300ms
    tick(250);
    expect(["", "none"]).toContain(slide.style.transform);    // entered: in position
    tick(3600);                                               // t = 3.9s
    expect(screen.queryByRole("group")).not.toBeNull();       // still visible
    tick(100);                                                // t = 4.0s: exit starts
    expect(screen.queryByRole("group")).not.toBeNull();       // exit animation is running, not an instant removal
    expect(slide.style.transform).toMatch(/translateY\(-/);   // sliding up and out of view
    expect(slide.style.transition).toContain("250ms");        // exit runs for 250ms
    tick(250);
    expect(screen.queryByRole("group")).toBeNull();           // unmounted after the exit animation
    rect.mockRestore();
  });

  it.each([["info", 4000], ["warning", 6000], ["error", 8000]] as const)("%s stays for %dms", (type, ms) => {
    mount();
    run(() => api.notify[type]("Title"));
    tick(ms - 100); expect(toasts()).toHaveLength(1);
    tick(100 + 250); expect(toasts()).toHaveLength(0);
  });

  it("honours a custom duration and a persistent notification", () => {
    mount();
    run(() => api.notify.success("Quick", { duration: 1000 }));
    tick(1000 + 250); expect(toasts()).toHaveLength(0);
    run(() => api.notify.error("Sticky", { duration: null }));
    tick(60_000); expect(toasts()).toHaveLength(1);
  });

  it("respects prefers-reduced-motion: no waiting on the exit animation", () => {
    stubMatchMedia(true);
    mount();
    run(() => api.notify.info("Calm"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    tick(20);
    expect(toasts()).toHaveLength(0);
  });
});

describe("manual dismissal, pausing and keyboard", () => {
  it("dismisses from the close button, which has an accessible name", () => {
    mount();
    run(() => api.notify.success("Saved"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(toasts()).toHaveLength(1); // exit animating
    tick(250); expect(toasts()).toHaveLength(0);
  });

  it("pauses auto-dismiss while hovered and resumes afterwards", () => {
    mount();
    run(() => api.notify.success("Hover me"));
    tick(3000);
    fireEvent.mouseEnter(screen.getByRole("group"));
    tick(20_000); expect(toasts()).toHaveLength(1);
    fireEvent.mouseLeave(screen.getByRole("group"));
    tick(2000 + 250); expect(toasts()).toHaveLength(0);
  });

  it("pauses while a control inside has keyboard focus", () => {
    mount();
    run(() => api.notify.warning("Focus me"));
    tick(4000);
    act(() => { screen.getByRole("button", { name: "Dismiss notification" }).focus(); });
    tick(20_000); expect(toasts()).toHaveLength(1);
  });

  it("closes on Escape from the toast, but not from elsewhere (so dialogs keep their own Escape)", () => {
    mount();
    run(() => api.notify.error("Esc"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    tick(300); expect(toasts()).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    tick(250); expect(toasts()).toHaveLength(0);
  });

  it("does not dismiss on a click elsewhere", () => {
    mount();
    run(() => api.notify.success("Stay"));
    fireEvent.mouseDown(document.body); fireEvent.click(document.body);
    tick(300); expect(toasts()).toHaveLength(1);
  });
});

describe("queue", () => {
  it("shows one toast at a time and promotes errors ahead of routine messages", () => {
    mount();
    run(() => { api.notify.success("A first"); api.notify.info("B info"); api.notify.error("C error"); api.notify.warning("D warning"); });
    expect(toastTitles()).toEqual(["A first"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" })); tick(250);
    expect(toastTitles()).toEqual(["C error"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" })); tick(250);
    expect(toastTitles()).toEqual(["D warning"]);
    tick(6000 + 250);
    expect(toastTitles()).toEqual(["B info"]);
    tick(4000 + 250);
    expect(toasts()).toHaveLength(0);
  });

  it("suppresses repeated identical notifications and keeps one history entry", () => {
    mount();
    run(() => { api.notify.info("Data refreshed", { description: "Up to date." }); api.notify.info("Data refreshed", { description: "Up to date." }); api.notify.info("Data refreshed", { description: "Up to date." }); });
    expect(toasts()).toHaveLength(1);
    expect(api.history).toHaveLength(1);
    tick(4250); expect(toasts()).toHaveLength(0);
  });

  it("records a silent notification in the centre without a popup", () => {
    mount();
    run(() => { api.notify({ type: "info", title: "Quiet", silent: true }); });
    expect(toasts()).toHaveLength(0); expect(api.history.map((h) => h.title)).toEqual(["Quiet"]);
  });
});

describe("accessibility", () => {
  it("announces success politely and errors assertively, exactly once, and the toast itself is not a live region", () => {
    mount();
    run(() => api.notify.success("Payment captured", { description: "Confirmed." }));
    const polite = screen.getByTestId("live-polite"), assertive = screen.getByTestId("live-assertive");
    expect(polite.textContent).toBe("Payment captured. Confirmed."); expect(assertive.textContent).toBe("");
    expect(screen.getByRole("group").getAttribute("aria-live")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" })); tick(250);
    run(() => api.notify.error("Payment failed", { description: "Try again." }));
    expect(assertive.textContent).toBe("Payment failed. Try again."); expect(polite.textContent).toBe("");
    const live = [polite, assertive].filter((n) => n.textContent?.includes("Payment failed"));
    expect(live).toHaveLength(1);
  });

  it("gives the toast an accessible name and an operable action", () => {
    mount();
    const onClick = vi.fn();
    run(() => api.notify.error("Capture failed", { action: { label: "View payment", onClick } }));
    expect(screen.getByRole("group", { name: "error notification" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View payment" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("timers", () => {
  it("leaves no timers or listeners behind when unmounted with a toast open", () => {
    const { unmount } = mount();
    run(() => { api.notify.success("A"); api.notify.info("B"); });
    tick(1000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => tick(60_000)).not.toThrow();
  });
});

describe("real operations through the provider", () => {
  const merchant: Merchant = { id: "demo_merchant", displayName: "Acme", contactEmail: null, businessName: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  const setup = () => { const client = new QueryClient(); client.setQueryData(MERCHANTS_KEY, [merchant]); return client; };

  it("shows the merchant success toast only after the backend confirms", async () => {
    mount();
    const client = setup();
    let confirm!: (m: Merchant) => void;
    const flow = updateMerchantFlow({ update: () => new Promise<Merchant>((r) => { confirm = r; }), notify: (n) => api.notify(n), client }, merchant.id, { displayName: "Acme Retail" });
    tick(5000);
    expect(toasts()).toHaveLength(0); // still pending: nothing announced
    await act(async () => { confirm({ ...merchant, displayName: "Acme Retail" }); await flow; });
    expect(screen.getByRole("group").textContent).toContain("Merchant updated");
    expect(screen.getByRole("group").textContent).toContain("Merchant information has been saved successfully.");
    tick(4000 + 250); expect(toasts()).toHaveLength(0);
  });

  it("shows the merchant error toast, kept longer, when the API rejects", async () => {
    mount();
    await act(async () => { await updateMerchantFlow({ update: () => Promise.reject(new ApiRequestError("Invalid request fields", 400, { contactEmail: "Enter a valid email address" })), notify: (n) => api.notify(n), client: setup() }, merchant.id, { contactEmail: "bad" }); });
    expect(screen.getByRole("group").textContent).toContain("Unable to update merchant");
    expect(screen.getByTestId("live-assertive").textContent).toContain("Unable to update merchant");
    tick(5900); expect(toasts()).toHaveLength(1);
    tick(100 + 250); expect(toasts()).toHaveLength(0);
  });

  const payment = (over: Partial<Payment> = {}): Payment => ({ ...payments[0], status: "CAPTURED", ...over });
  it("payment capture: success only once captured, pending is a warning", () => {
    mount();
    run(() => api.notify(captureNotice(payment({ status: "CAPTURE_PENDING" }), (id) => ({ label: "View payment", onClick: () => selectSpy(id) }))));
    expect(screen.getByRole("group", { name: "warning notification" }).textContent).toContain("Capture pending");
    fireEvent.click(screen.getByRole("button", { name: "View payment" }));
    expect(selectSpy).toHaveBeenCalledWith(payments[0].id);
    tick(250);
    run(() => api.notify(captureNotice(payment(), () => ({ label: "View payment", onClick: () => undefined }))));
    expect(screen.getByRole("group", { name: "success notification" }).textContent).toContain("Payment captured");
  });

  it("payment API failure and a Visa provider outage surface as errors", () => {
    mount();
    run(() => api.notify(apiFailureNotice(new ApiRequestError("Visa sandbox not configured", 503), { title: "Payment processing failed", paymentId: payments[0].id, provider: "VISA_SANDBOX", view: (id) => ({ label: "View payment", onClick: () => selectSpy(id) }) })));
    const toast = screen.getByRole("group", { name: "error notification" });
    expect(toast.textContent).toContain("Payment provider unavailable");
    expect(toast.textContent).toContain("Visa sandbox not configured");
    expect(screen.getByTestId("live-assertive").textContent).toContain("Payment provider unavailable");
  });
});

describe("notification centre", () => {
  it("shows unread count, type, time and read state, and marks and clears", () => {
    mount(<NotificationCenter />);
    run(() => { api.notify.success("Payment captured", { description: "£99.00 captured", category: "payment" }); api.notify.error("Refund declined", { category: "payment" }); });
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: /Notifications/ });
    const list = within(panel).getByRole("list", { name: "Recent notifications" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Refund declined");     // newest first
    expect(items[0].textContent).toContain("Just now");
    expect(items[1].textContent).toContain("£99.00 captured");
    expect(panel.textContent).toMatch(/2 unread/);

    fireEvent.click(within(panel).getByRole("button", { name: 'Mark "Refund declined" as read' }));
    expect(screen.getByRole("button", { name: "Notifications, 1 unread", hidden: true })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Mark all read" }));
    expect(screen.getByRole("button", { name: "Notifications", hidden: true })).toBeTruthy(); // no unread suffix
    expect(within(panel).queryByRole("button", { name: /^Mark ".*" as read$/ })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Clear" }));
    expect(within(panel).queryByRole("list", { name: "Recent notifications" })).toBeNull();
    expect(panel.textContent).toContain("No notifications yet");
  });

  it("is honest that history lives in this tab only, and lists stored payment problems separately", () => {
    mount(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog");
    expect(panel.textContent).toMatch(/kept in this browser tab only/i);
    const attention = within(panel).getByRole("region", { name: "Needs attention" });
    fireEvent.click(within(attention).getByRole("button", { name: /Declined/ }));
    expect(selectSpy).toHaveBeenCalledWith(payments[0].id);
  });

  it("runs a notification's action from the centre and marks it read", () => {
    mount(<NotificationCenter />);
    const onClick = vi.fn();
    run(() => api.notify.error("Capture failed", { action: { label: "View payment", onClick } }));
    tick(8250);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "View payment" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(api.unreadCount).toBe(0);
  });
});

describe("announcements while a modal is open", () => {
  it("speaks from a live region inside the dialog, and keeps the aria-hidden body copy quiet", () => {
    mount(<Dialog open><ModalLiveRegions /></Dialog>);
    run(() => { api.notify.success("Payment captured", { description: "£147.50 capture confirmed" }); });
    const regions = screen.getAllByTestId("live-polite");
    const audible = regions.filter((el) => !el.closest("[aria-hidden='true']"));
    expect(audible).toHaveLength(1);
    expect(audible[0].textContent).toContain("Payment captured");
    expect(regions.filter((el) => el.closest("[aria-hidden='true']")).every((el) => el.textContent === "")).toBe(true);
  });

  it("hides toast actions that the modal's focus trap would make unreachable", () => {
    mount(<Dialog open><ModalLiveRegions /></Dialog>);
    run(() => { api.notify.success("Payment captured", { action: { label: "View payment", onClick: () => undefined } }); });
    expect(screen.queryByRole("button", { name: "View payment", hidden: true })).toBeNull();
  });
});
