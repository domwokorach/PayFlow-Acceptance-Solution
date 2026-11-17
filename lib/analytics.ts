import type { Payment } from "./types";

export type Range = "7d" | "30d" | "all";
export const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "all", label: "All loaded" },
];
const DAY = 86_400_000;

export const isCaptured = (p: Payment) => p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED" || p.status === "REFUNDED";

export function inRange(payments: Payment[], range: Range, now = Date.now()): Payment[] {
  if (range === "all") return payments;
  const from = now - (range === "7d" ? 7 : 30) * DAY;
  return payments.filter((p) => new Date(p.createdAt).getTime() >= from);
}

/** Payments in the window immediately before `range` (same length), for period-over-period comparison. Null for "all". */
export function previousInRange(payments: Payment[], range: Range, now = Date.now()): Payment[] | null {
  if (range === "all") return null;
  const len = (range === "7d" ? 7 : 30) * DAY;
  return payments.filter((p) => { const t = new Date(p.createdAt).getTime(); return t >= now - 2 * len && t < now - len; });
}

/** Percentage change from `prev` to `cur`; null when there is no baseline to compare against. */
export const pctChange = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export const providerLabels: Record<string, string> = { SIMULATED: "Simulator", VISA_SANDBOX: "Visa Acceptance sandbox" };
export const providerLabel = (name: string) => providerLabels[name] ?? name;

export function kpis(payments: Payment[]) {
  const total = payments.length;
  const declined = payments.filter((p) => p.status === "DECLINED").length;
  const pending = payments.filter((p) => p.status === "AUTHORIZED").length;
  const captured = payments.filter(isCaptured);
  const capturedMinor = captured.reduce((a, p) => a + p.amountMinor, 0);
  const refundedMinor = payments.reduce((a, p) => a + p.refundedAmountMinor, 0);
  return {
    total, declined, pending, capturedCount: captured.length, capturedMinor, refundedMinor, netMinor: capturedMinor - refundedMinor,
    successful: total - declined, successRate: total ? ((total - declined) / total) * 100 : 0, declineRate: total ? (declined / total) * 100 : 0,
  };
}

export interface DayPoint { date: string; label: string; capturedMinor: number; refundedMinor: number; successful: number; declined: number }
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const dayLabel = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

/** One point per UTC day. 7d/30d are zero-filled so the axis is continuous; "all" only shows days that have activity. */
export function dailySeries(payments: Payment[], range: Range, now = Date.now()): DayPoint[] {
  const map = new Map<string, DayPoint>();
  const make = (k: string): DayPoint => ({ date: k, label: dayLabel(k), capturedMinor: 0, refundedMinor: 0, successful: 0, declined: 0 });
  if (range !== "all") for (let i = (range === "7d" ? 6 : 29); i >= 0; i--) { const k = dayKey(new Date(now - i * DAY)); map.set(k, make(k)); }
  for (const p of payments) {
    const k = dayKey(new Date(p.createdAt));
    const e = map.get(k) ?? (range === "all" ? make(k) : null);
    if (!e) continue;
    if (p.status === "DECLINED") e.declined++; else e.successful++;
    if (isCaptured(p)) e.capturedMinor += p.amountMinor;
    e.refundedMinor += p.refundedAmountMinor;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const statusLabels: Record<Payment["status"], string> = {
  PENDING_AUTHORIZATION: "Authorizing", AUTHORIZED: "Authorized", DECLINED: "Declined", CAPTURE_PENDING: "Capture pending", CAPTURED: "Captured", REFUND_PENDING: "Refund pending", PARTIALLY_REFUNDED: "Partially refunded", REFUNDED: "Refunded", REVIEW_REQUIRED: "Review required",
};

export function statusCounts(payments: Payment[]) {
  return (Object.keys(statusLabels) as Payment["status"][]).map((s) => ({ status: s, label: statusLabels[s], value: payments.filter((p) => p.status === s).length })).filter((x) => x.value > 0);
}

/** Amount string → minor units, or an error message. Same rules as the original UI (≤2 dp, positive). */
export function parseMoney(input: string, maxMinor: number): { minor: number } | { error: string } {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Enter a positive amount with up to two decimal places." };
  const minor = Math.round(Number(t) * 100);
  if (minor <= 0) return { error: "Amount must be greater than zero." };
  if (minor > maxMinor) return { error: "Amount exceeds the allowed maximum." };
  return { minor };
}

/** Remaining refundable amount in minor units. */
export const refundableMinor = (p: Payment) => p.amountMinor - p.refundedAmountMinor;
export const canRefund = (p: Payment) => (p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED") && refundableMinor(p) > 0;
export const canCapture = (p: Payment) => p.status === "AUTHORIZED";

/** One-line spoken summaries and table data for the charts, so their values are available without the graphic. */
type Money = (minor: number) => string;
const peakOf = <T,>(rows: T[], by: (r: T) => number) => rows.reduce<T | null>((best, r) => (best === null || by(r) > by(best) ? r : best), null);

export function volumeChartData(series: DayPoint[], money: Money) {
  const total = series.reduce((a, d) => a + d.capturedMinor, 0), top = peakOf(series, (d) => d.capturedMinor);
  return {
    summary: top && total > 0 ? `${series.length} days. Total ${money(total)}. Highest ${top.label}, ${money(top.capturedMinor)}.` : `${series.length} days. No captured volume.`,
    table: { columns: ["Day", "Captured", "Refunded"], rows: series.map((d) => [d.label, money(d.capturedMinor), money(d.refundedMinor)]) },
  };
}
export function outcomeChartData(series: DayPoint[]) {
  const ok = series.reduce((a, d) => a + d.successful, 0), no = series.reduce((a, d) => a + d.declined, 0);
  return { summary: `${series.length} days. ${ok} successful, ${no} declined.`, table: { columns: ["Day", "Successful", "Declined"], rows: series.map((d) => [d.label, d.successful, d.declined]) } };
}
export function refundChartData(series: DayPoint[], money: Money) {
  const total = series.reduce((a, d) => a + d.refundedMinor, 0), top = peakOf(series, (d) => d.refundedMinor);
  return {
    summary: top && total > 0 ? `${series.length} days. Total refunded ${money(total)}. Highest ${top.label}, ${money(top.refundedMinor)}.` : `${series.length} days. No refunds.`,
    table: { columns: ["Day", "Refunded"], rows: series.map((d) => [d.label, money(d.refundedMinor)]) },
  };
}
export function statusChartData(data: { label: string; value: number }[]) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return { summary: `${total} payments. ${data.map((d) => `${d.label} ${d.value}`).join(", ")}.`, table: { columns: ["Status", "Payments"], rows: data.map((d) => [d.label, d.value]) } };
}
export function hourlyChartData(data: { hour: string; count: number }[]) {
  const total = data.reduce((a, d) => a + d.count, 0), top = peakOf(data, (d) => d.count);
  return { summary: top && total > 0 ? `${total} payments. Busiest hour ${top.hour}, ${top.count}.` : "No payments.", table: { columns: ["Hour", "Payments"], rows: data.map((d) => [d.hour, d.count]) } };
}
