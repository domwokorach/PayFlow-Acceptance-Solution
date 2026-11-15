import { dayLabel, statusLabels, type DayPoint } from "./analytics";
import type { Status, Summary, Totals } from "./types";

/** Share of decided attempts that were not declined. Attempts still authorizing or under review are not counted either way. */
export const successRate = (t: Totals) => (t.successful + t.declined ? (t.successful / (t.successful + t.declined)) * 100 : 0);

export const dayPoints = (s: Summary): DayPoint[] =>
  s.daily.map((d) => ({ date: d.date, label: dayLabel(d.date), capturedMinor: d.capturedMinor, refundedMinor: d.refundedMinor, successful: d.successful, declined: d.declined }));

export const statusRows = (s: Summary) =>
  (Object.keys(statusLabels) as Status[]).map((k) => ({ status: k, label: statusLabels[k], value: s.statusCounts[k] ?? 0 })).filter((x) => x.value > 0);

export const providerHealthTone = (h: string) => (h === "HEALTHY" ? "success" : h === "DEGRADED" ? "warning" : h === "NOT_CONFIGURED" ? "error" : "neutral") as "success" | "warning" | "error" | "neutral";
export const providerHealthLabel = (h: string) => ({ HEALTHY: "Healthy", DEGRADED: "Degraded", IDLE: "Idle", NOT_CONFIGURED: "Not configured" } as Record<string, string>)[h] ?? h;
