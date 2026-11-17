"use client";
import AddRounded from "@mui/icons-material/AddRounded";
import HourglassEmptyRounded from "@mui/icons-material/HourglassEmptyRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import NextLink from "next/link";
import { useMemo } from "react";
import { inRange, outcomeChartData, pctChange, statusChartData, volumeChartData } from "../lib/analytics";
import { formatMoney } from "../lib/api";
import { useData } from "../lib/data";
import { StatusPie, SuccessDeclineChart, VolumeAreaChart } from "../components/charts/charts";
import { PaymentsTable } from "../components/payments/PaymentsTable";
import { ApiError } from "../components/ui/ApiError";
import { DateRangeFilter } from "../components/ui/DateRangeFilter";
import { EmptyState } from "../components/ui/EmptyState";
import { MetricCard, type Delta } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { ChartArea, Panel } from "../components/ui/Panel";
import { ProviderHealth } from "../components/ui/ProviderHealth";
import { dayPoints, statusRows, successRate } from "../lib/summary";

export default function DashboardPage() {
  const { payments, summary, loading, range, setRange, refresh, refreshing, setCreateOpen, error } = useData();
  const rows = useMemo(() => inRange(payments, range), [payments, range]);
  const t = summary?.totals, prev = summary?.previous ?? null;
  const series = useMemo(() => (summary ? dayPoints(summary) : []), [summary]);
  const statuses = useMemo(() => (summary ? statusRows(summary) : []), [summary]);
  const days = range === "7d" ? 7 : 30;
  const versus = `previous ${days} days`;
  // Deltas and sparklines only exist when there is real history to compare against.
  const delta = (cur: number | undefined, prv: number | undefined, better: Delta["better"]): Delta | null => {
    const v = cur !== undefined && prv !== undefined && prev && prev.total > 0 ? pctChange(cur, prv) : null;
    return v === null ? null : { value: v, better, versus };
  };
  const hasSeries = range !== "all" || series.length > 1;
  const rate = (s: { successful: number; declined: number }) => (s.successful + s.declined ? (s.successful / (s.successful + s.declined)) * 100 : 0);
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-GB"));
  const money = (v: number | undefined) => (v === undefined ? "—" : formatMoney(v));
  const rateNow = t ? successRate(t) : undefined, ratePrev = prev ? successRate(prev) : undefined;
  const noPayments = !loading && summary !== null && summary.totalTransactions === 0;

  return (
    <>
      <PageHeader title="Overview" subtitle="Live payment activity for Acme Demo Store."
        actions={<>
          <DateRangeFilter value={range} onChange={setRange} />
          <Button variant="outlined" color="inherit" size="small" startIcon={<RefreshRounded />} disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh"}</Button>
          <Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)} sx={{ display: { sm: "none" } }}>New payment</Button>
        </>} />
      <ApiError />
      {noPayments && (
        <Panel title="No payments yet">
          <EmptyState icon={<HourglassEmptyRounded />} title="Nothing has been processed" body="Create a payment to see volume, status and provider activity here. Figures update live as the backend commits changes." action={<Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>New payment</Button>} />
        </Panel>
      )}
      <Box sx={{ display: noPayments ? "none" : "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, mb: 1.5 }}>
        <MetricCard loading={loading} label="Captured volume" value={money(t?.capturedVolumeMinor)} hint={t ? `Net ${formatMoney(t.capturedVolumeMinor - t.refundedVolumeMinor)}` : undefined} delta={delta(t?.capturedVolumeMinor, prev?.capturedVolumeMinor, "up")}
          spark={hasSeries ? series.map((d) => d.capturedMinor) : undefined} info="Gross volume of captured, partially refunded and refunded payments in range. Net is after refunds." />
        <MetricCard loading={loading} tone="warning" label="Refunded" value={money(t?.refundedVolumeMinor)} hint={t && t.capturedVolumeMinor ? `${((t.refundedVolumeMinor / t.capturedVolumeMinor) * 100).toFixed(1)}% of captured` : undefined}
          delta={delta(t?.refundedVolumeMinor, prev?.refundedVolumeMinor, "down")} spark={hasSeries ? series.map((d) => d.refundedMinor) : undefined} info="Completed refunds on payments created in range." />
        <MetricCard loading={loading} tone="success" label="Successful transactions" value={n(t?.successful)} hint={t ? `${t.capturedCount} captured` : undefined}
          delta={delta(t?.successful, prev?.successful, "up")} spark={hasSeries ? series.map((d) => d.successful) : undefined} info="Authorized or later. Excludes declined, authorizing and unknown-outcome attempts." />
        <MetricCard loading={loading} label="Success rate" value={rateNow === undefined ? "—" : `${rateNow.toFixed(1)}%`} hint={t ? `${t.successful + t.declined} decided attempts` : undefined}
          delta={delta(rateNow, ratePrev, "up")} spark={hasSeries ? series.map(rate) : undefined} info="Successful ÷ (successful + declined). Attempts still in flight or under review are not counted." />
        <MetricCard loading={loading} tone="error" label="Declined" value={n(t?.declined)} hint={t && t.successful + t.declined ? `${((t.declined / (t.successful + t.declined)) * 100).toFixed(1)}% of decided` : undefined}
          delta={delta(t?.declined, prev?.declined, "down")} spark={hasSeries ? series.map((d) => d.declined) : undefined} info="Authorizations declined by the provider." />
        <MetricCard loading={loading} tone="warning" label="Authorized" value={n(t?.authorized)} hint="Awaiting capture" info="Authorized payments that still need to be captured." />
        <MetricCard loading={loading} tone="warning" label="Pending provider" value={n(t ? t.pendingCaptures + t.pendingRefunds : undefined)} hint={t ? `${t.pendingCaptures} capture · ${t.pendingRefunds} refund` : undefined} info="Accepted by the provider but not yet confirmed. Resolved automatically; see Reconciliation." />
        <MetricCard loading={loading} tone={t && t.reviewRequired ? "error" : "primary"} label="Needs review" value={n(t?.reviewRequired)} hint="Outcome unknown" info="The request may have reached the provider. These are never retried automatically." />
      </Box>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, mb: 1.5 }}>
        <Panel title="Captured volume" subtitle={`Daily gross captured volume (GBP) · ${range === "all" ? "all loaded data" : `last ${days} days`}`} collapsible>
          <ChartArea height={220} label="Area chart of daily captured payment volume" {...volumeChartData(series, formatMoney)}>
            {(t?.total ?? 0) === 0 && !loading ? <EmptyState icon={<HourglassEmptyRounded />} title="No activity in this range" /> : <VolumeAreaChart data={series} />}
          </ChartArea>
        </Panel>
        <Panel title="Status distribution" subtitle="Payments by current status" collapsible>
          <ChartArea height={220} label="Donut chart of payments by status" {...statusChartData(statuses)}>
            {statuses.length === 0 ? <EmptyState title="No payments yet" /> : <StatusPie data={statuses} />}
          </ChartArea>
        </Panel>
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, mb: 1.5 }}>
        <Panel title="Success vs decline" subtitle="Daily transaction outcomes (count)" collapsible>
          <ChartArea height={200} label="Stacked bar chart of successful and declined payments per day" {...outcomeChartData(series)}>
            {(t?.total ?? 0) === 0 ? <EmptyState title="No activity in this range" /> : <SuccessDeclineChart data={series} />}
          </ChartArea>
        </Panel>
        <Panel title="Provider health" subtitle={error ? "Last known state: the API did not answer" : "From persisted provider operations"} collapsible>
          <ProviderHealth providers={summary?.providers ?? []} />
        </Panel>
      </Box>
      <Panel title="Recent transactions" subtitle="Latest 100 payments, updated live" flush actions={<Link component={NextLink} href="/payments" variant="body2">View all</Link>}>
        <PaymentsTable rows={rows} pageSize={8} compact />
      </Panel>
    </>
  );
}
