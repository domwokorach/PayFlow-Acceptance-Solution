import { ApiRequestError, formatMoney } from "../api";
import { providerLabel, refundableMinor } from "../analytics";
import type { Payment, Refund, Status } from "../types";
import type { NotificationAction, NotificationType, NotifyInput, QueuedNotification } from "./notification-types";

export const DURATION_MS: Record<NotificationType, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 };
export const PRIORITY: Record<NotificationType, number> = { error: 3, warning: 2, success: 1, info: 0 };
export const ENTER_MS = 300;
export const EXIT_MS = 250;
/** An identical notification is ignored while visible, queued, or shown within this window (repeated API / live events). */
export const DEDUPE_MS = 3000;
export const MAX_QUEUE = 4;

export const keyOf = (n: Pick<NotifyInput, "type" | "title" | "description" | "dedupeKey">) => n.dedupeKey ?? `${n.type}|${n.title}|${n.description ?? ""}`;
export const durationOf = (n: Pick<NotifyInput, "type" | "duration">) => (n.duration === undefined ? DURATION_MS[n.type] : n.duration);

/**
 * One prominent toast at a time. Extra messages wait in a short queue ordered by severity then arrival, so a failure
 * is never stuck behind routine confirmations. Identical messages are suppressed. Plain state, no React, so it is testable.
 */
export class NotificationQueue {
  current: QueuedNotification | null = null;
  open = false;
  private queue: QueuedNotification[] = [];
  private recent = new Map<string, number>();
  private seq = 0;
  constructor(private readonly dedupeMs = DEDUPE_MS, private readonly maxQueue = MAX_QUEUE) {}

  get pending(): readonly QueuedNotification[] { return this.queue; }
  snapshot(): { current: QueuedNotification | null; open: boolean } { return { current: this.current, open: this.open }; }
  currentId(): number | undefined { return this.current?.id; }
  allocId() { return ++this.seq; }

  offer(input: NotifyInput, id = this.allocId(), now = Date.now()): { status: "shown" | "queued" | "duplicate"; item: QueuedNotification } {
    const key = keyOf(input);
    const item: QueuedNotification = { ...input, id, key };
    for (const [k, t] of this.recent) if (now - t > this.dedupeMs) this.recent.delete(k);
    if ((this.open && this.current?.key === key) || this.queue.some((q) => q.key === key) || this.recent.has(key)) return { status: "duplicate", item };
    this.recent.set(key, now);
    if (!this.current) { this.current = item; this.open = true; return { status: "shown", item }; }
    let i = this.queue.length;
    while (i > 0 && PRIORITY[this.queue[i - 1].type] < PRIORITY[item.type]) i--;
    this.queue.splice(i, 0, item);
    if (this.queue.length > this.maxQueue) this.queue.length = this.maxQueue;
    return { status: "queued", item };
  }

  /** Starts the exit animation for the current toast, or drops a queued one. Returns true if the visible toast was closed. */
  close(id: number): boolean {
    if (this.current?.id === id) { const was = this.open; this.open = false; return was; }
    this.queue = this.queue.filter((q) => q.id !== id);
    return false;
  }
  clearPending() { this.queue = []; }
  /** Call when the exit animation has finished: promotes the next queued toast, if any. */
  advance(): QueuedNotification | null {
    const next = this.queue.shift() ?? null;
    this.current = next; this.open = next !== null;
    return next;
  }
  reset() { this.current = null; this.open = false; this.queue = []; this.recent.clear(); }
}

/** Remembers payments this tab just changed itself, so the matching live event is not announced a second time. */
export class OwnActionTracker {
  private seen = new Map<string, number>();
  constructor(private readonly windowMs = 20_000) {}
  mark(id: string, now = Date.now()) { this.seen.set(id, now); }
  isOwn(id: string, now = Date.now()) {
    const t = this.seen.get(id);
    if (t === undefined) return false;
    if (now - t > this.windowMs) { this.seen.delete(id); return false; }
    return true;
  }
}

/**
 * Collects live payment events and flushes them together, so a burst of updates becomes one summary instead of one toast each.
 * Holds the flush while this tab has an operation in flight (its own API response will announce the result) up to `maxHoldMs`.
 */
export class EventBatcher<E extends { paymentId: string }> {
  private pending = new Map<string, E>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstAt = 0;
  constructor(private readonly flush: (events: E[]) => void, private readonly o: { windowMs?: number; maxHoldMs?: number; hold?: () => boolean } = {}) {}
  add(e: E) {
    if (this.pending.size === 0) this.firstAt = Date.now();
    this.pending.set(e.paymentId, e); // newest status per payment wins
    if (!this.timer) this.arm(this.o.windowMs ?? 1200);
  }
  private arm(ms: number) {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.o.hold?.() && Date.now() - this.firstAt < (this.o.maxHoldMs ?? 15_000)) { this.arm(400); return; }
      const batch = [...this.pending.values()]; this.pending.clear();
      if (batch.length) this.flush(batch);
    }, ms);
  }
  dispose() { clearTimeout(this.timer); this.timer = undefined; this.pending.clear(); }
}

// ---------------------------------------------------------------- wording

const STATUS_LABEL: Record<Status, string> = {
  PENDING_AUTHORIZATION: "pending authorization", AUTHORIZED: "authorized", DECLINED: "declined", CAPTURE_PENDING: "awaiting capture confirmation",
  CAPTURED: "captured", REFUND_PENDING: "awaiting refund confirmation", PARTIALLY_REFUNDED: "partially refunded", REFUNDED: "refunded", REVIEW_REQUIRED: "under review",
};
/** Settled or attention-worthy states only. Intermediate "pending" states are followed by one of these, so they never get their own alert. */
export const ANNOUNCED_STATUSES: ReadonlySet<string> = new Set(["AUTHORIZED", "CAPTURED", "DECLINED", "PARTIALLY_REFUNDED", "REFUNDED", "REVIEW_REQUIRED"]);

type View = (id: string) => NotificationAction;
const short = (id: string) => `${id.slice(0, 8)}…`;

/** What a backend-recorded status change means for the user. It reports PayFlow's recorded state; it does not claim settlement at the provider. */
export function statusChangeNotices(events: { paymentId: string; status?: string; eventId?: string }[], view: View): NotifyInput[] {
  const relevant = events.filter((e) => e.status && ANNOUNCED_STATUSES.has(e.status));
  const out: NotifyInput[] = [];
  const needsReview = relevant.filter((e) => e.status === "REVIEW_REQUIRED");
  for (const e of needsReview) out.push({ type: "error", category: "payment", title: "Payment needs review", description: `Payment ${short(e.paymentId)} has an unknown outcome. Check the provider before doing anything else.`, action: view(e.paymentId), dedupeKey: `status|${e.eventId ?? e.paymentId}` });
  const rest = relevant.filter((e) => e.status !== "REVIEW_REQUIRED");
  if (rest.length === 1) {
    const e = rest[0];
    out.push({ type: e.status === "DECLINED" ? "warning" : "info", category: "payment", title: "Payment status changed", description: `Payment ${short(e.paymentId)} is now ${STATUS_LABEL[e.status as Status]}.`, action: view(e.paymentId), dedupeKey: `status|${e.eventId ?? e.paymentId}` });
  } else if (rest.length > 1) {
    const counts = new Map<string, number>();
    rest.forEach((e) => counts.set(e.status!, (counts.get(e.status!) ?? 0) + 1));
    const detail = [...counts].map(([s, n]) => `${n} ${STATUS_LABEL[s as Status]}`).join(", ");
    out.push({ type: "info", category: "payment", title: `${rest.length} payments updated`, description: detail.charAt(0).toUpperCase() + detail.slice(1) + ".", dedupeKey: `status-batch|${rest.map((e) => e.eventId ?? e.paymentId).join(",")}` });
  }
  return out;
}

export type ProviderFailure = "auth" | "unavailable" | "rejected";
/** Tells a card decline from a credential or provider problem, using the status code the backend records for Visa operations. */
export function classifyProviderFailure(p: Pick<Payment, "provider" | "status" | "providerStatus">): ProviderFailure | null {
  if (p.provider !== "VISA_SANDBOX") return null;
  const ps = p.providerStatus ?? "";
  if (p.status === "DECLINED" && /^HTTP_40[13]$/.test(ps)) return "auth";
  if (p.status === "DECLINED" && /^HTTP_4\d\d$/.test(ps)) return "rejected";
  if (p.status === "REVIEW_REQUIRED" && /HTTP 5\d\d|call failed|interrupted|timed? ?out|not valid JSON/i.test(ps)) return "unavailable";
  return null;
}

export function providerFailureNotice(kind: ProviderFailure, p: Payment, view: View): NotifyInput {
  const base = { category: "provider" as const, action: view(p.id), dedupeKey: `provider|${kind}|${p.id}|${p.status}` };
  if (kind === "auth") return { ...base, type: "error", title: "Visa authentication failed", description: "Visa rejected the sandbox credentials. Check the key ID and shared secret configured on the backend, then try again.", duration: 8000 };
  if (kind === "unavailable") return { ...base, type: "error", title: "Payment provider unavailable", description: "Visa did not respond, so the outcome is unknown. Do not resubmit; check the provider using this payment ID.", duration: 8000 };
  return { ...base, type: "error", title: "Visa rejected the request", description: `The sandbox refused this request (${(p.providerStatus ?? "").replace("HTTP_", "HTTP ")}). It was not processed.` };
}

export function authorizationNotice(p: Payment, view: View): NotifyInput {
  const amt = formatMoney(p.amountMinor, p.currency), via = providerLabel(p.provider);
  const failure = classifyProviderFailure(p);
  if (failure) return providerFailureNotice(failure, p, view);
  const key = `payment|authorize|${p.id}|${p.status}`;
  if (p.status === "DECLINED") return { type: "error", category: "payment", title: "Authorization declined", description: `${via} declined the ${amt} authorization. It cannot be captured.`, action: view(p.id), dedupeKey: key };
  if (p.status === "REVIEW_REQUIRED") return { type: "error", category: "payment", title: "Manual review required", description: "The outcome is unknown. Check the provider before retrying; do not resubmit.", duration: 8000, action: view(p.id), dedupeKey: key };
  if (p.status === "PENDING_AUTHORIZATION") return { type: "info", category: "payment", title: "Authorization pending", description: `${via} has not confirmed the ${amt} authorization yet.`, dedupeKey: key };
  return { type: "success", category: "payment", title: "Payment authorized", description: `${amt} authorization confirmed by ${via}.`, dedupeKey: key };
}

export function captureNotice(p: Payment, view: View): NotifyInput {
  const amt = formatMoney(p.amountMinor, p.currency), action = view(p.id), key = `payment|capture|${p.id}|${p.status}`;
  if (p.status === "CAPTURED") return { type: "success", category: "payment", title: "Payment captured", description: `${amt} capture confirmed and ledger updated.`, dedupeKey: key };
  if (p.status === "REVIEW_REQUIRED") {
    const f = classifyProviderFailure(p);
    return f ? providerFailureNotice(f, p, view) : { type: "error", category: "payment", title: "Manual review required", description: "The capture outcome is unknown. Do not resubmit.", action, dedupeKey: key };
  }
  if (p.status === "CAPTURE_PENDING") return { type: "warning", category: "payment", title: "Capture pending", description: "Accepted, but the provider has not confirmed settlement yet.", action, dedupeKey: key };
  return { type: "error", category: "payment", title: "Capture not completed", description: "The provider did not capture this payment.", action, dedupeKey: key };
}

export function reconcileNotice(p: Payment, view: View): NotifyInput {
  const key = `payment|reconcile|${p.id}|${p.status}`;
  if (p.status === "CAPTURE_PENDING" || p.status === "REFUND_PENDING") return { type: "warning", category: "provider", title: "Reconciliation pending", description: "The provider has not confirmed this operation yet.", dedupeKey: key };
  if (p.status === "REVIEW_REQUIRED") return { type: "error", category: "provider", title: "Reconciliation discrepancy detected", description: "The provider result is unknown. A person must check it.", action: view(p.id), dedupeKey: key };
  return { type: "success", category: "provider", title: "Reconciliation completed", description: "Provider status confirmed.", dedupeKey: key };
}

export function refundNotice(f: Refund, p: Payment | undefined, view: View): NotifyInput {
  // `p` is the payment as it was before this refund, so its refundable balance is what the refund is measured against.
  const partial = p ? f.amountMinor < refundableMinor(p) : false;
  const amt = formatMoney(f.amountMinor, p?.currency), action = view(f.paymentId), key = `payment|refund|${f.id}|${f.status}`;
  if (f.status === "PENDING") return { type: "warning", category: "payment", title: `${partial ? "Partial refund" : "Refund"} pending`, description: `${amt} accepted; awaiting provider confirmation.`, action, dedupeKey: key };
  if (f.status === "FAILED") return { type: "error", category: "payment", title: "Refund declined", description: `The provider declined the ${amt} refund.`, action, dedupeKey: key };
  return { type: "success", category: "payment", title: partial ? "Partial refund completed" : "Refund completed", description: `${amt} refunded and ledger updated.`, dedupeKey: key };
}

/**
 * A rejected API call. Provider outages and connection failures get their own titles; other messages come from the
 * backend's curated error text.
 */
export function apiFailureNotice(e: unknown, o: { title: string; paymentId?: string; provider?: string; view?: View }): NotifyInput {
  const error = e instanceof Error ? e.message : "Operation failed";
  const status = e instanceof ApiRequestError ? e.status : undefined;
  const visa = o.provider === "VISA_SANDBOX" || /visa/i.test(error);
  const action = o.paymentId && o.view ? o.view(o.paymentId) : undefined;
  const base = { category: (visa ? "provider" : "payment") as "provider" | "payment", description: error, action, dedupeKey: `fail|${o.title}|${o.paymentId ?? ""}|${error}` };
  if (status === 0) return { ...base, type: "error", title: "Connection failed" };
  if (visa && (status === 502 || status === 503 || status === 504)) return { ...base, type: "error", title: "Payment provider unavailable", duration: 8000 };
  return { ...base, type: "error", title: visa ? "Visa sandbox error" : o.title };
}

// ---------------------------------------------------------------- time

export function timeAgo(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 10) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(then).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
