"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Range } from "./analytics";
import { useNotification } from "../hooks/useNotification";
import type { NotifyInput } from "./notifications/notification-types";
import { apiFailureNotice, authorizationNotice, captureNotice, EventBatcher, OwnActionTracker, reconcileNotice, refundNotice, statusChangeNotices } from "./notifications/notification-utils";
import { api } from "./api";
import { connectLive, MERCHANT_EVENT, PAYMENT_EVENT, type LiveEvent, type LiveStatus } from "./live";
import { MERCHANTS_KEY, updateMerchantFlow, type MerchantUpdateResult } from "./merchants";
import type { Merchant, Payment, ReconciliationReport, Refund, Summary, UpdateMerchantRequest } from "./types";

/** Result of a mutation. `error` is the backend's own message, so dialogs and drawers can keep it on screen after the toast is gone. */
export type OpResult = { ok: true } | { ok: false; error: string };
/** The last failed operation for a payment. Shown on that payment's detail screen until a later attempt succeeds, so a missed toast never hides a failure. Held in this tab only. */
export interface OpError { message: string; title: string; at: number }
const isConnection = (m: string) => m.startsWith("Cannot reach PayFlow");
const DAYS: Record<Range, number> = { "7d": 7, "30d": 30, all: 0 };
const FLASH_MS = 2600;
const VISA_ANSWERED = new Set(["AUTHORIZED", "CAPTURED", "CAPTURE_PENDING", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED"]);

interface Ctx {
  payments: Payment[]; merchants: Merchant[]; merchantsLoading: boolean; summary: Summary | null; loading: boolean; error: string; reload: () => Promise<void>;
  /** When data last arrived from the API (epoch ms), or null before the first response. */
  lastSync: number | null; refreshing: boolean;
  live: LiveStatus; pendingOps: number;
  /** Payment ids that changed in the last couple of seconds, for subtle row highlighting. */
  changed: ReadonlySet<string>;
  query: string; setQuery: (q: string) => void; status: string; setStatus: (s: string) => void; range: Range; setRange: (r: Range) => void;
  selectedId: string | null; select: (id: string | null) => void; createOpen: boolean; setCreateOpen: (o: boolean) => void;
  busy: boolean;
  opErrors: Readonly<Record<string, OpError>>; dismissOpError: (paymentId: string) => void;
  /** Manual refresh: reloads everything and reports the real outcome. */
  refresh: () => Promise<void>;
  /** Saves a merchant profile change. Notifies only after the backend confirms; failures return the message and field errors for the form. */
  updateMerchant: (id: string, payload: UpdateMerchantRequest) => Promise<MerchantUpdateResult>;
  create: (amountMinor: number, simulateDecline: boolean, provider?: string) => Promise<OpResult>;
  reconcile: (id: string) => Promise<OpResult>;
  capture: (id: string) => Promise<OpResult>; refund: (id: string, amountMinor: number) => Promise<OpResult>;
}
const DataContext = createContext<Ctx | null>(null);
export const useData = () => { const c = useContext(DataContext); if (!c) throw new Error("useData must be used inside DataProvider"); return c; };

/** Reconciliation report, kept fresh by the same live events as everything else. */
export function useReconciliation() {
  const { live } = useData();
  return useQuery<ReconciliationReport>({ queryKey: ["reconciliation"], queryFn: api.reconciliation, refetchInterval: live === "live" ? 120_000 : 20_000 });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Inner>{children}</Inner></QueryClientProvider>;
}

function Inner({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveStatus>("connecting");
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [range, setRange] = useState<Range>("30d");
  const [selectedId, select] = useState<string | null>(null); const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opErrors, setOpErrors] = useState<Record<string, OpError>>({});
  const { notify } = useNotification();
  const view = useCallback((id: string) => ({ label: "View payment", onClick: () => select(id) }), []);
  const own = useRef(new OwnActionTracker());          // payments this tab is changing itself
  const inFlight = useRef(0);                          // mutations awaiting the backend
  const merchantOwn = useRef({ inflight: 0, at: 0 });  // this tab's own merchant saves
  const liveRef = useRef<LiveStatus>("connecting");
  const dropped = useRef(false);
  const visaVerified = useRef(false);

  // While the stream is live, polling is only a slow safety net; otherwise poll so the dashboard is never silently stale.
  const interval = live === "live" ? 60_000 : 15_000;
  const paymentsQ = useQuery({ queryKey: ["payments"], queryFn: () => api.payments(), refetchInterval: interval });
  const merchantsQ = useQuery({ queryKey: MERCHANTS_KEY, queryFn: api.merchants, refetchInterval: interval });
  const summaryQ = useQuery({ queryKey: ["summary", DAYS[range]], queryFn: () => api.summary(DAYS[range]), refetchInterval: interval, placeholderData: (prev) => prev });

  // --- live updates -------------------------------------------------------
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshAll = useCallback(() => {
    clearTimeout(invalidateTimer.current); // coalesce bursts of events into one refetch
    invalidateTimer.current = setTimeout(() => { void qc.invalidateQueries({ queryKey: ["payments"] }); void qc.invalidateQueries({ queryKey: ["summary"] }); void qc.invalidateQueries({ queryKey: ["reconciliation"] }); void qc.invalidateQueries({ queryKey: MERCHANTS_KEY }); }, 200);
  }, [qc]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // A burst of status events becomes one summary; events for payments this tab just changed are skipped because
    // their own API response already reported the outcome. These alerts describe PayFlow's recorded status, not provider settlement.
    const batcher = new EventBatcher<LiveEvent & { paymentId: string }>(
      (events) => statusChangeNotices(events.filter((e) => !own.current.isOwn(e.paymentId)), view).forEach((n) => notify(n)),
      { hold: () => inFlight.current > 0 },
    );
    const stop = connectLive({
      url: "/api/events/stream",
      onStatus: (s) => { liveRef.current = s; setLive(s); },
      onEvent: (e) => {
        if (e.type === MERCHANT_EVENT) {
          void qc.invalidateQueries({ queryKey: MERCHANTS_KEY });
          // Announce only changes made elsewhere; this tab's own save already showed its confirmed result.
          if (merchantOwn.current.inflight === 0 && Date.now() - merchantOwn.current.at > 10_000)
            notify({ type: "info", category: "merchant", title: "Merchant profile updated", description: "Changes were saved from another session. The list has been refreshed.", dedupeKey: `merchant-sse|${e.eventId}` });
          return;
        }
        refreshAll();
        if (e.type !== PAYMENT_EVENT || !e.paymentId) return;
        const id = e.paymentId;
        batcher.add({ ...e, paymentId: id });
        setChanged((s) => new Set(s).add(id));
        const t = setTimeout(() => { setChanged((s) => { const n = new Set(s); n.delete(id); return n; }); timers.delete(t); }, FLASH_MS);
        timers.add(t);
      },
      onReady: ({ reconnected }) => { if (reconnected) refreshAll(); }, // full refresh after any gap
      onResync: refreshAll,
    });
    return () => { stop(); batcher.dispose(); clearTimeout(invalidateTimer.current); timers.forEach(clearTimeout); };
  }, [refreshAll, qc, notify, view]);

  const reload = useCallback(async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["payments"] }), qc.invalidateQueries({ queryKey: ["summary"] }), qc.invalidateQueries({ queryKey: ["reconciliation"] }), qc.invalidateQueries({ queryKey: MERCHANTS_KEY })]); }, [qc]);

  // --- connection state ---------------------------------------------------
  // A stream that was live and then dropped for a few seconds is reported; the initial connect and brief flaps stay quiet.
  useEffect(() => {
    if (live === "live") {
      if (dropped.current) { dropped.current = false; notify({ type: "success", category: "dashboard", title: "Connection restored", description: "Live updates have resumed.", dedupeKey: "conn-restored" }); }
      return;
    }
    if (live !== "reconnecting") return;
    const t = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // the offline alert already covers it
      dropped.current = true;
      notify({ type: "warning", category: "dashboard", title: "Live updates interrupted", description: "Reconnecting. Data refreshes every 15 seconds meanwhile.", dedupeKey: "conn-lost", duration: 7000 });
    }, 3000);
    return () => clearTimeout(t);
  }, [live, notify]);
  // The browser's own connectivity signal is reported immediately; recovery is announced once the stream is actually live again.
  useEffect(() => {
    const offline = () => { dropped.current = true; notify({ type: "warning", category: "dashboard", title: "You're offline", description: "Changes can't be saved until your connection returns.", dedupeKey: "net-offline", duration: 7000 }); };
    const online = () => {
      void reload();
      if (liveRef.current === "live" && dropped.current) { dropped.current = false; notify({ type: "success", category: "dashboard", title: "Connection restored", description: "You're back online.", dedupeKey: "conn-restored" }); }
    };
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [notify, reload]);

  /** Runs a mutation and only reports an outcome the backend confirmed. A failure is kept per payment (see opErrors) so the
   *  detail screen can show it after the toast is gone. No optimistic cache writes. */
  const run = useCallback(async (op: () => Promise<unknown>, done: (r: unknown) => NotifyInput, failTitle: string, paymentId?: string, provider?: string): Promise<OpResult> => {
    inFlight.current++; setBusy(true);
    if (paymentId) own.current.mark(paymentId);
    try {
      const r = await op();
      const settled = r as Partial<Payment> & { paymentId?: string };
      const id = settled.paymentId ?? settled.id ?? paymentId;
      if (id) { own.current.mark(id); setOpErrors((e) => { if (!(id in e)) return e; const n = { ...e }; delete n[id]; return n; }); }
      notify(done(r));
      // Said once per session, and only after a real Visa response that was not a rejection or an unknown outcome.
      if (!visaVerified.current && settled.provider === "VISA_SANDBOX" && settled.status && VISA_ANSWERED.has(settled.status)) {
        visaVerified.current = true;
        notify({ type: "info", category: "provider", title: "Visa sandbox connection verified", description: "The sandbox answered a live request from PayFlow.", dedupeKey: "visa-verified" });
      }
      await reload(); return { ok: true };
    } catch (e) {
      const n = apiFailureNotice(e, { title: failTitle, paymentId, provider, view });
      notify(n);
      if (paymentId) setOpErrors((x) => ({ ...x, [paymentId]: { message: n.description ?? "Operation failed", title: n.title, at: Date.now() } }));
      void reload(); return { ok: false, error: e instanceof Error ? e.message : "Operation failed" };
    } finally { inFlight.current--; if (inFlight.current === 0) setBusy(false); }
  }, [notify, reload, view]);

  const refresh = useCallback(async () => {
    await reload();
    const failed = qc.getQueryState(["payments"])?.status === "error" || qc.getQueryState(["summary", DAYS[range]])?.status === "error";
    notify(failed
      ? { type: "error", category: "dashboard", title: "Refresh failed", description: "Cannot reach PayFlow. Data on screen may be out of date.", dedupeKey: "refresh-failed" }
      : { type: "info", category: "dashboard", title: "Data refreshed", description: "Transactions and summary are up to date.", dedupeKey: "refresh-ok" });
  }, [qc, reload, notify, range]);

  // Background polling failures: say so once per outage. The persistent ApiError banner stays on the page.
  const lastError = useRef("");
  useEffect(() => {
    const err = (paymentsQ.error ?? summaryQ.error) as Error | null;
    const msg = err ? err.message : "";
    if (msg && msg !== lastError.current) notify({ type: "error", category: "dashboard", title: isConnection(msg) ? "Connection failed" : "Data refresh failed", description: msg, dedupeKey: "poll-failed" });
    lastError.current = msg;
  }, [paymentsQ.error, summaryQ.error, notify]);

  // Provider health comes from persisted operations (not a live probe), so only a change in that evidence is reported.
  const health = useRef(new Map<string, string>());
  useEffect(() => {
    for (const p of summaryQ.data?.providers ?? []) {
      const before = health.current.get(p.name);
      health.current.set(p.name, p.health);
      if (before === undefined || before === p.health) continue;
      if (p.health === "DEGRADED") notify({ type: "warning", category: "provider", title: "Payment provider degraded", description: `${p.name}: ${p.healthDetail}`, dedupeKey: `health|${p.name}|degraded`, duration: 8000 });
      else if (before === "DEGRADED" && p.health === "HEALTHY") notify({ type: "success", category: "provider", title: "Payment provider recovered", description: `${p.name}: ${p.healthDetail}`, dedupeKey: `health|${p.name}|healthy` });
    }
  }, [summaryQ.data, notify]);

  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const paymentsRef = useRef<Payment[]>([]);
  paymentsRef.current = payments;
  const payment = (id: string) => paymentsRef.current.find((p) => p.id === id);
  const merchants = useMemo(() => merchantsQ.data ?? [], [merchantsQ.data]);
  const summary: Summary | null = summaryQ.data ?? null;
  const pendingOps = summary ? summary.totals.pendingCaptures + summary.totals.pendingRefunds + summary.totals.pendingAuthorizations : 0;
  const lastSync = Math.max(paymentsQ.dataUpdatedAt, summaryQ.dataUpdatedAt) || null;
  const firstError = paymentsQ.error ?? summaryQ.error;
  const error = firstError ? (firstError instanceof Error ? firstError.message : "Cannot connect to the payment API") : "";
  const dismissOpError = useCallback((id: string) => setOpErrors((e) => { const n = { ...e }; delete n[id]; return n; }), []);

  const value = useMemo<Ctx>(() => ({
    payments, merchants, merchantsLoading: merchantsQ.isPending, summary, loading: paymentsQ.isPending || summaryQ.isPending, error, reload, lastSync, refreshing: paymentsQ.isFetching || summaryQ.isFetching, live, pendingOps, changed,
    query, setQuery, status, setStatus, range, setRange, selectedId, select, createOpen, setCreateOpen, busy, refresh, opErrors, dismissOpError,
    updateMerchant: async (id, payload) => {
      merchantOwn.current.inflight++;
      try { return await updateMerchantFlow({ update: api.updateMerchant, notify, client: qc }, id, payload); }
      finally { merchantOwn.current.inflight--; merchantOwn.current.at = Date.now(); }
    },
    create: (amountMinor, simulateDecline, provider = "SIMULATED") => run(() => api.create(amountMinor, "GBP", simulateDecline, provider), (r) => authorizationNotice(r as Payment, view), "Payment processing failed", undefined, provider),
    capture: (id) => run(() => api.capture(id), (r) => captureNotice(r as Payment, view), "Payment processing failed", id, payment(id)?.provider),
    reconcile: (id) => run(() => api.reconcile(id), (r) => reconcileNotice(r as Payment, view), "Reconciliation failed", id, payment(id)?.provider),
    refund: (id, amountMinor) => { const before = payment(id); return run(() => api.refund(id, amountMinor), (r) => refundNotice(r as Refund, before, view), "Refund failed", id, before?.provider); },
  }), [payments, merchants, merchantsQ.isPending, qc, notify, view, summary, paymentsQ.isPending, summaryQ.isPending, paymentsQ.isFetching, summaryQ.isFetching, error, reload, lastSync, live, pendingOps, changed, query, status, range, selectedId, createOpen, busy, refresh, run, opErrors, dismissOpError]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
