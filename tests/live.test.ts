import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLive, type LiveEvent, type LiveStatus } from "../lib/live";

class FakeES {
  static all: FakeES[] = [];
  handlers = new Map<string, ((e: Event) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(n: string, h: (e: Event) => void) { this.handlers.set(n, [...(this.handlers.get(n) ?? []), h]); }
  close() { this.closed = true; }
  emit(name: string, data: unknown, id = "") { for (const h of this.handlers.get(name) ?? []) h({ data: JSON.stringify(data), lastEventId: id } as unknown as Event); }
  fail() { this.onerror?.(); }
}
const ev = (n: number, status = "CAPTURED"): LiveEvent => ({ eventId: `evt_${n}`, type: "PAYMENT_STATUS_CHANGED", paymentId: "p1", status, occurredAt: "2026-11-15T12:00:00Z" });

function setup(extra = {}) {
  const statuses: LiveStatus[] = [], events: LiveEvent[] = [], ready: boolean[] = [];
  let resyncs = 0;
  const stop = connectLive({
    url: "/api/events/stream", EventSourceImpl: FakeES as unknown as typeof EventSource, random: () => 1,
    onStatus: (s) => statuses.push(s), onEvent: (e) => events.push(e), onReady: (i) => ready.push(i.reconnected), onResync: () => { resyncs++; }, ...extra,
  });
  return { statuses, events, ready, stop, resyncs: () => resyncs, es: () => FakeES.all.at(-1)! };
}

beforeEach(() => { FakeES.all = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("connectLive", () => {
  it("is only 'live' once the server says ready", () => {
    const t = setup();
    expect(t.statuses).toEqual(["connecting"]);
    t.es().emit("ready", { latestEventId: 7 });
    expect(t.statuses.at(-1)).toBe("live");
    expect(t.ready).toEqual([false]);
  });

  it("delivers each event once and drops duplicates and stale sequence numbers", () => {
    const t = setup(); t.es().emit("ready", { latestEventId: 7 });
    t.es().emit("PAYMENT_STATUS_CHANGED", ev(8), "8");
    t.es().emit("PAYMENT_STATUS_CHANGED", ev(8), "8"); // duplicate delivery
    t.es().emit("PAYMENT_STATUS_CHANGED", ev(6), "6"); // older than the cursor
    t.es().emit("PAYMENT_STATUS_CHANGED", ev(9), "9");
    expect(t.events.map((e) => e.eventId)).toEqual(["evt_8", "evt_9"]);
  });

  it("reconnects with backoff, resumes from the last event id and reports a reconnect", () => {
    const t = setup(); const first = t.es(); first.emit("ready", { latestEventId: 7 });
    first.emit("PAYMENT_STATUS_CHANGED", ev(8), "8");
    first.fail();
    expect(first.closed).toBe(true);
    expect(t.statuses.at(-1)).toBe("reconnecting");
    expect(FakeES.all).toHaveLength(1); // not yet: waiting out the backoff
    vi.advanceTimersByTime(1000);
    expect(FakeES.all).toHaveLength(2);
    expect(t.es().url).toBe("/api/events/stream?lastEventId=8");
    t.es().emit("ready", { latestEventId: 9 });
    expect(t.ready).toEqual([false, true]);
    expect(t.statuses.at(-1)).toBe("live");
  });

  it("doubles the delay on repeated failures up to the cap", () => {
    const t = setup({ baseDelayMs: 1000, maxDelayMs: 4000 });
    t.es().fail(); vi.advanceTimersByTime(999); expect(FakeES.all).toHaveLength(1); vi.advanceTimersByTime(1); expect(FakeES.all).toHaveLength(2);
    t.es().fail(); vi.advanceTimersByTime(2000); expect(FakeES.all).toHaveLength(3);
    t.es().fail(); vi.advanceTimersByTime(4000); expect(FakeES.all).toHaveLength(4);
    t.es().fail(); vi.advanceTimersByTime(4000); expect(FakeES.all).toHaveLength(5); // capped
  });

  it("asks for a full refresh on resync, and when the server's history is behind the cursor", () => {
    const t = setup(); t.es().emit("ready", { latestEventId: 20 });
    t.es().emit("resync", { reason: "gap" });
    expect(t.resyncs()).toBe(1);
    t.es().emit("PAYMENT_STATUS_CHANGED", ev(21), "21");
    t.es().fail(); vi.advanceTimersByTime(1000);
    t.es().emit("ready", { latestEventId: 3 }); // database was reset
    expect(t.resyncs()).toBe(2);
  });

  it("treats prolonged silence as a dead connection", () => {
    const t = setup({ silenceMs: 45_000 }); t.es().emit("ready", { latestEventId: 1 });
    vi.advanceTimersByTime(30_000); t.es().emit("heartbeat", {});
    vi.advanceTimersByTime(44_000); expect(t.statuses.at(-1)).toBe("live");
    vi.advanceTimersByTime(1_500); expect(t.statuses.at(-1)).toBe("reconnecting");
  });

  it("stops cleanly", () => {
    const t = setup(); const es = t.es(); t.stop();
    expect(es.closed).toBe(true); expect(t.statuses.at(-1)).toBe("closed");
    vi.advanceTimersByTime(120_000); expect(FakeES.all).toHaveLength(1);
  });

  it("delivers MERCHANT_UPDATED once, carrying only the merchant id, and de-duplicates a repeat", () => {
    const t = setup();
    t.es().emit("ready", { latestEventId: 0 });
    const m: LiveEvent = { eventId: "evt_9", type: "MERCHANT_UPDATED", merchantId: "demo_merchant", occurredAt: "2026-11-15T13:00:00Z" };
    t.es().emit("MERCHANT_UPDATED", m, "9");
    t.es().emit("MERCHANT_UPDATED", m, "9");
    expect(t.events).toEqual([m]);
    expect(t.events[0].paymentId).toBeUndefined();
  });
});
