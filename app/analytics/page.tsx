"use client";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { inRange, pctChange } from "../../lib/analytics";
import { dayPoints, statusRows, successRate } from "../../lib/summary";
import { formatMoney } from "../../lib/api";
import { useData } from "../../lib/data";
import { HourlyChart, RefundChart, StatusPie, SuccessDeclineChart, VolumeAreaChart } from "../../components/charts/charts";
import { ApiError } from "../../components/ui/ApiError";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { EmptyState } from "../../components/ui/EmptyState";
import { MetricCard, type Delta } from "../../components/ui/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { ChartArea, Panel } from "../../components/ui/Panel";

export default function AnalyticsPage() {
  const { payments, summary, range, setRange, loading } = useData();
  const rows = useMemo(() => inRange(payments, range), [payments, range]);
  const t = summary?.totals, prev = summary?.previous ?? null;
  const series = useMemo(() => (summary ? dayPoints(summary) : []), [summary]);
  const statuses = useMemo(() => (summary ? statusRows(summary) : []), [summary]);
  const hourly = useMemo(() => Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2, "0"), count: rows.filter((p) => new Date(p.createdAt).getHours() === h).length })), [rows]);
  const avg = t && t.capturedCount ? t.capturedVolumeMinor / t.capturedCount : 0;
  const avgPrev = prev && prev.capturedCount ? prev.capturedVolumeMinor / prev.capturedCount : undefined;
  const none = !loading && (t?.total ?? 0) === 0;
  const empty = <EmptyState icon={<InsightsOutlined />} title="No data in this range" body="Try a wider date range or create some payments." />;
  const versus = `previous ${range === "7d" ? 7 : 30} days`;
  const delta = (cur: number | undefined, prv: number | undefined, better: Delta["better"]): Delta | null => {
    const v = cur !== undefined && prv !== undefined && prev && prev.total > 0 ? pctChange(cur, prv) : null;
    return v === null ? null : { value: v, better, versus };
  };
  const rate = t ? successRate(t) : undefined, ratePrev = prev ? successRate(prev) : undefined;
  const money = (v: number | undefined) => (v === undefined ? "—" : formatMoney(v));

  return (
    <>
      <PageHeader title="Analytics" subtitle="Volume, success and decline trends." actions={<DateRangeFilter value={range} onChange={setRange} />} />
      <ApiError />
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, mb: 1.5 }}>
        <MetricCard loading={loading} label="Gross captured" value={money(t?.capturedVolumeMinor)} delta={delta(t?.capturedVolumeMinor, prev?.capturedVolumeMinor, "up")} />
        <MetricCard loading={loading} tone="warning" label="Refunded" value={money(t?.refundedVolumeMinor)} delta={delta(t?.refundedVolumeMinor, prev?.refundedVolumeMinor, "down")} />
        <MetricCard loading={loading} tone="success" label="Success rate" value={rate === undefined ? "—" : `${rate.toFixed(1)}%`} delta={delta(rate, ratePrev, "up")} />
        <MetricCard loading={loading} label="Average captured ticket" value={t ? formatMoney(avg) : "—"} delta={delta(avg, avgPrev, "up")} />
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" } }}>
        <Panel title="Payment volume" subtitle="Daily captured volume (GBP)" collapsible><ChartArea height={220} label="Daily captured volume">{none ? empty : <VolumeAreaChart data={series} />}</ChartArea></Panel>
        <Panel title="Success vs decline" subtitle="Daily transaction outcomes (count)" collapsible><ChartArea height={220} label="Daily successful and declined payments">{none ? empty : <SuccessDeclineChart data={series} />}</ChartArea></Panel>
        <Panel title="Refund trend" subtitle="Daily refunded amount (GBP)" collapsible><ChartArea height={220} label="Daily refunded amount">{none ? empty : <RefundChart data={series} />}</ChartArea></Panel>
        <Panel title="Transactions by status" subtitle="Current status of payments in range" collapsible><ChartArea height={220} label="Payments by status">{none ? empty : <StatusPie data={statuses} />}</ChartArea></Panel>
        <Box sx={{ gridColumn: { lg: "1 / -1" }, minWidth: 0 }}><Panel title="Activity by hour" subtitle="Latest 100 payments by hour of day (your local time)" collapsible><ChartArea height={200} label="Transactions by hour of day">{none ? empty : <HourlyChart data={hourly} />}</ChartArea></Panel></Box>
      </Box>
      <Typography variant="meta" color="text.secondary" component="p" sx={{ mt: 1.5 }}>Figures are aggregated by the backend from all persisted payments and update live. Deltas compare with the {versus} when payments exist in it (not shown for “All”). The hourly chart uses the latest {payments.length} payments.</Typography>
    </>
  );
}
