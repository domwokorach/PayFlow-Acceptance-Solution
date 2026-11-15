import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/api";
import type { NotifyInput } from "../lib/notifications/notification-types";
import {
  apiFailureNotice, authorizationNotice, captureNotice, classifyProviderFailure, DURATION_MS, ENTER_MS, EventBatcher, EXIT_MS, durationOf,
  NotificationQueue, OwnActionTracker, reconcileNotice, refundNotice, statusChangeNotices, timeAgo,
} from "../lib/notifications/notification-utils";
import type { Payment, Refund } from "../lib/types";

const view = (id: string) => ({ label: "View payment", onClick: () => void id });
const n = (type: NotifyInput["type"], title: string, over: Partial<NotifyInput> = {}): NotifyInput => ({ type, title, ...over });
const pay = (over: Partial<Payment> = {}): Payment => ({ id: "11111111-2222-3333-4444-555555555555", merchantId: "demo_merchant", amountMinor: 12500, currency: "GBP", status: "AUTHORIZED", refundedAmountMinor: 0, provider: "SIMULATED", createdAt: "2026-11-15T12:00:00Z", providerStatus: null, ...over });

describe("timing contract", () => {
  it("uses the specified durations and animation times", () => {
    expect(DURATION_MS).toEqual({ success: 4000, info: 4000, warning: 6000, error: 8000 });
    expect(ENTER_MS).toBe(300); expect(EXIT_MS).toBe(250);
    expect(durationOf(n("error", "x"))).toBe(8000);
    expect(durationOf(n("success", "x", { duration: 1500 }))).toBe(1500);
    expect(durationOf(n("info", "x", { duration: null }))).toBeNull();
  });
});

describe("NotificationQueue", () => {
  it("shows the first, queues the rest and promotes them one at a time", () => {
    const q = new NotificationQueue();
    const a = q.offer(n("success", "A")), b = q.offer(n("info", "B")), c = q.offer(n("info", "C"));
    expect([a.status, b.status, c.status]).toEqual(["shown", "queued", "queued"]);
    expect(q.current?.title).toBe("A");
    expect(q.close(a.item.id)).toBe(true);
    expect(q.open).toBe(false);
    expect(q.advance()?.title).toBe("B"); expect(q.open).toBe(true);
    q.close(q.current!.id); expect(q.advance()?.title).toBe("C");
    q.close(q.current!.id); expect(q.advance()).toBeNull(); expect(q.current).toBeNull();
  });
  it("puts errors ahead of routine messages and keeps arrival order within a severity", () => {
    const q = new NotificationQueue();
    q.offer(n("success", "first"));
    q.offer(n("info", "info 1")); q.offer(n("warning", "warn")); q.offer(n("error", "err")); q.offer(n("info", "info 2"));
    expect(q.pending.map((x) => x.title)).toEqual(["err", "warn", "info 1", "info 2"]);
  });
  it("caps the queue and drops the lowest priority first", () => {
    const q = new NotificationQueue(3000, 3);
    q.offer(n("success", "shown"));
    ["a", "b", "c"].forEach((t) => q.offer(n("info", t)));
    q.offer(n("error", "critical"));
    expect(q.pending).toHaveLength(3);
    expect(q.pending[0].title).toBe("critical");
    expect(q.pending.map((x) => x.title)).not.toContain("c");
  });
  it("suppresses identical messages while visible, queued, and for a short time afterwards", () => {
    const q = new NotificationQueue(3000);
    const t0 = 1_000_000;
    expect(q.offer(n("success", "Saved", { description: "x" }), q.allocId(), t0).status).toBe("shown");
    expect(q.offer(n("success", "Saved", { description: "x" }), q.allocId(), t0 + 100).status).toBe("duplicate"); // visible
    q.offer(n("info", "Other"), q.allocId(), t0 + 200);
    expect(q.offer(n("info", "Other"), q.allocId(), t0 + 300).status).toBe("duplicate"); // queued
    q.close(q.current!.id); q.advance(); q.close(q.current!.id); q.advance();
    expect(q.offer(n("success", "Saved", { description: "x" }), q.allocId(), t0 + 1000).status).toBe("duplicate"); // just shown
    expect(q.offer(n("success", "Saved", { description: "x" }), q.allocId(), t0 + 4000).status).toBe("shown"); // window passed
  });
  it("uses dedupeKey so different payments with identical text are not merged", () => {
    const q = new NotificationQueue();
    q.offer(n("success", "Payment captured", { description: "£15.00 captured", dedupeKey: "p1" }));
    expect(q.offer(n("success", "Payment captured", { description: "£15.00 captured", dedupeKey: "p2" })).status).toBe("queued");
    expect(q.offer(n("success", "Payment captured", { description: "£15.00 captured", dedupeKey: "p2" })).status).toBe("duplicate");
  });
  it("drops a queued item when dismissed and resets cleanly", () => {
    const q = new NotificationQueue();
    q.offer(n("info", "A")); const b = q.offer(n("info", "B"));
    expect(q.close(b.item.id)).toBe(false); expect(q.pending).toHaveLength(0);
    q.reset(); expect(q.current).toBeNull(); expect(q.open).toBe(false);
  });
});

describe("OwnActionTracker", () => {
  it("recognises a payment this tab just changed, only within the window", () => {
    const t = new OwnActionTracker(1000);
    t.mark("p1", 0);
    expect(t.isOwn("p1", 500)).toBe(true); expect(t.isOwn("p1", 1500)).toBe(false); expect(t.isOwn("other", 0)).toBe(false);
  });
});

describe("EventBatcher", () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
  it("flushes a burst once, keeping the newest status per payment", () => {
    const flush = vi.fn(); const b = new EventBatcher<{ paymentId: string; status: string }>(flush, { windowMs: 1000 });
    b.add({ paymentId: "a", status: "CAPTURE_PENDING" }); b.add({ paymentId: "b", status: "AUTHORIZED" }); b.add({ paymentId: "a", status: "CAPTURED" });
    vi.advanceTimersByTime(999); expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([{ paymentId: "a", status: "CAPTURED" }, { paymentId: "b", status: "AUTHORIZED" }]);
  });
  it("holds the flush while an operation of this tab is in flight, then releases it", () => {
    let busy = true; const flush = vi.fn();
    const b = new EventBatcher<{ paymentId: string }>(flush, { windowMs: 500, hold: () => busy });
    b.add({ paymentId: "a" });
    vi.advanceTimersByTime(3000); expect(flush).not.toHaveBeenCalled();
    busy = false; vi.advanceTimersByTime(500); expect(flush).toHaveBeenCalledTimes(1);
  });
  it("never holds forever, and leaves no timers behind once disposed", () => {
    const flush = vi.fn(); const b = new EventBatcher<{ paymentId: string }>(flush, { windowMs: 100, maxHoldMs: 2000, hold: () => true });
    b.add({ paymentId: "a" }); vi.advanceTimersByTime(2600); expect(flush).toHaveBeenCalledTimes(1);
    b.add({ paymentId: "b" }); b.dispose(); expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(5000); expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("status change alerts from live events", () => {
  it("announces one settled change by name and never claims provider settlement", () => {
    const [x] = statusChangeNotices([{ paymentId: "abcdef12-0000", status: "CAPTURED", eventId: "evt_5" }], view);
    expect(x).toMatchObject({ type: "info", title: "Payment status changed", dedupeKey: "status|evt_5" });
    expect(x.description).toBe("Payment abcdef12… is now captured.");
    expect(x.description).not.toMatch(/settled|provider confirmed/i);
  });
  it("summarises a burst into one notification instead of one each", () => {
    const out = statusChangeNotices([1, 2, 3, 4].map((i) => ({ paymentId: `p${i}`, status: i === 4 ? "DECLINED" : "CAPTURED", eventId: `evt_${i}` })), view);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "4 payments updated", type: "info" });
    expect(out[0].description).toBe("3 captured, 1 declined.");
  });
  it("skips intermediate pending states and raises review-required as its own error", () => {
    expect(statusChangeNotices([{ paymentId: "a", status: "CAPTURE_PENDING" }, { paymentId: "b", status: "PENDING_AUTHORIZATION" }], view)).toEqual([]);
    const out = statusChangeNotices([{ paymentId: "a", status: "REVIEW_REQUIRED", eventId: "e1" }, { paymentId: "b", status: "CAPTURED", eventId: "e2" }], view);
    expect(out.map((o) => o.type)).toEqual(["error", "info"]);
    expect(out[0].title).toBe("Payment needs review");
  });
});

describe("Visa provider failures", () => {
  const visa = (over: Partial<Payment>) => pay({ provider: "VISA_SANDBOX", ...over });
  it("tells a credential rejection from a card decline", () => {
    expect(classifyProviderFailure(visa({ status: "DECLINED", providerStatus: "HTTP_401" }))).toBe("auth");
    expect(classifyProviderFailure(visa({ status: "DECLINED", providerStatus: "HTTP_403" }))).toBe("auth");
    expect(classifyProviderFailure(visa({ status: "DECLINED", providerStatus: "HTTP_422" }))).toBe("rejected");
    expect(classifyProviderFailure(visa({ status: "DECLINED", providerStatus: "DECLINED" }))).toBeNull(); // an ordinary card decline
    expect(classifyProviderFailure(pay({ status: "DECLINED", providerStatus: "HTTP_401" }))).toBeNull();   // simulator is never a Visa problem
  });
  it("recognises an unreachable provider from an unknown outcome", () => {
    expect(classifyProviderFailure(visa({ status: "REVIEW_REQUIRED", providerStatus: "Visa returned HTTP 503" }))).toBe("unavailable");
    expect(classifyProviderFailure(visa({ status: "REVIEW_REQUIRED", providerStatus: "Visa call failed: SocketTimeoutE" }))).toBe("unavailable");
    expect(classifyProviderFailure(visa({ status: "AUTHORIZED", providerStatus: "AUTHORIZED" }))).toBeNull();
  });
  it("authorization of a rejected Visa payment says authentication failed, not declined", () => {
    const x = authorizationNotice(visa({ status: "DECLINED", providerStatus: "HTTP_401" }), view);
    expect(x).toMatchObject({ type: "error", title: "Visa authentication failed", category: "provider" });
    expect(x.description).toMatch(/credentials/);
    const u = authorizationNotice(visa({ status: "REVIEW_REQUIRED", providerStatus: "Visa returned HTTP 503" }), view);
    expect(u.title).toBe("Payment provider unavailable");
    expect(authorizationNotice(visa({ status: "DECLINED", providerStatus: "DECLINED" }), view).title).toBe("Authorization declined");
  });
  it("maps API-level provider errors", () => {
    expect(apiFailureNotice(new ApiRequestError("Visa sandbox not configured", 503), { title: "Payment processing failed", provider: "VISA_SANDBOX" }).title).toBe("Payment provider unavailable");
    expect(apiFailureNotice(new ApiRequestError("Visa status lookup failed; try again later", 502), { title: "Reconciliation failed" }).title).toBe("Payment provider unavailable");
    expect(apiFailureNotice(new ApiRequestError("Cannot reach PayFlow.", 0), { title: "x", provider: "VISA_SANDBOX" }).title).toBe("Connection failed");
    expect(apiFailureNotice(new ApiRequestError("Payment not found", 404), { title: "Payment processing failed" }).title).toBe("Payment processing failed");
    expect(apiFailureNotice(new ApiRequestError("Only AUTHORIZED payments can be captured", 409), { title: "Payment processing failed", provider: "VISA_SANDBOX" }).title).toBe("Visa sandbox error");
  });
});

describe("payment notices distinguish pending, authorized, captured and refunded", () => {
  it("authorization", () => {
    expect(authorizationNotice(pay({ status: "AUTHORIZED" }), view)).toMatchObject({ type: "success", title: "Payment authorized" });
    expect(authorizationNotice(pay({ status: "PENDING_AUTHORIZATION" }), view)).toMatchObject({ type: "info", title: "Authorization pending" });
    expect(authorizationNotice(pay({ status: "DECLINED" }), view)).toMatchObject({ type: "error", title: "Authorization declined" });
    expect(authorizationNotice(pay({ status: "REVIEW_REQUIRED" }), view)).toMatchObject({ type: "error", title: "Manual review required" });
  });
  it("capture only reports success once captured", () => {
    expect(captureNotice(pay({ status: "CAPTURED" }), view)).toMatchObject({ type: "success", title: "Payment captured" });
    expect(captureNotice(pay({ status: "CAPTURE_PENDING" }), view)).toMatchObject({ type: "warning", title: "Capture pending" });
    expect(captureNotice(pay({ status: "AUTHORIZED" }), view)).toMatchObject({ type: "error", title: "Capture not completed" });
  });
  it("reconciliation", () => {
    expect(reconcileNotice(pay({ status: "CAPTURED" }), view)).toMatchObject({ type: "success", title: "Reconciliation completed" });
    expect(reconcileNotice(pay({ status: "REFUND_PENDING" }), view)).toMatchObject({ type: "warning", title: "Reconciliation pending" });
    expect(reconcileNotice(pay({ status: "REVIEW_REQUIRED" }), view)).toMatchObject({ type: "error", title: "Reconciliation discrepancy detected" });
  });
  it("refunds: completed, partial, pending, failed", () => {
    const captured = pay({ status: "CAPTURED", amountMinor: 10000 });
    const refund = (status: string, amountMinor: number): Refund => ({ id: "r1", paymentId: captured.id, amountMinor, createdAt: "2026-11-15T12:00:00Z", status });
    expect(refundNotice(refund("COMPLETED", 10000), captured, view)).toMatchObject({ type: "success", title: "Refund completed" });
    expect(refundNotice(refund("COMPLETED", 2500), captured, view)).toMatchObject({ type: "success", title: "Partial refund completed" });
    expect(refundNotice(refund("PENDING", 2500), captured, view)).toMatchObject({ type: "warning", title: "Partial refund pending" });
    expect(refundNotice(refund("FAILED", 2500), captured, view)).toMatchObject({ type: "error", title: "Refund declined" });
  });
  it("gives different payments different keys so identical wording is never merged", () => {
    const a = captureNotice(pay({ id: "a", status: "CAPTURED" }), view), b = captureNotice(pay({ id: "b", status: "CAPTURED" }), view);
    expect(a.description).toBe(b.description); expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });
});

describe("timeAgo", () => {
  it("is compact and honest", () => {
    const now = 10_000_000;
    expect(timeAgo(now - 3000, now)).toBe("Just now"); expect(timeAgo(now - 30_000, now)).toBe("30s ago");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago"); expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
  });
});
