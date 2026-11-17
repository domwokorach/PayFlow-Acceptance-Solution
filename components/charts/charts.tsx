"use client";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPoint } from "../../lib/analytics";

import { formatMoney } from "../../lib/api";
import type { Status } from "../../lib/types";
import { AnimatedValue } from "../ui/AnimatedValue";

const DRAW_MS = 900;

/** Colours come from CSS variables so charts follow light/dark without re-rendering the palette. */
function useChartTheme() {
  const t = useTheme();
  const v = t.vars!.palette;
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  return {
    animate: !reduced, grid: v.divider, axis: v.text.secondary, text: v.text.primary, paper: v.background.paper,
    // Marks need 3:1 against the panel, so green and amber use the `text` variants rather than the brighter fills.
    blue: v.primary.main, green: v.success.text, amber: v.warning.text, red: v.error.main,
    tick: { fontSize: 11, fill: v.text.secondary, fontVariantNumeric: "tabular-nums" },
    // Shared draw-in: bars grow and lines trace left to right with a gentle ease-out. Off under reduced motion.
    draw: { isAnimationActive: !reduced, animationDuration: DRAW_MS, animationEasing: "ease-out" as const },
  };
}
const interval = (n: number) => (n > 20 ? Math.ceil(n / 7) - 1 : n > 8 ? 1 : 0);
const compact = (minor: number) => {
  const pounds = minor / 100, abs = Math.abs(pounds);
  if (abs >= 1_000_000) return `£${Math.round(pounds / 100_000) / 10}m`;
  if (abs >= 1000) return `£${Math.round(pounds / 100) / 10}k`;
  return `£${Math.round(pounds)}`;
};

interface Row { name?: string | number; value?: number | string; color?: string; dataKey?: string | number }
/** One tooltip for every chart: a quiet card with the period as a heading and one tabular row per series. */
function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: Row[]; label?: string | number; format: (row: Row) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <Box role="presentation" sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1.5, boxShadow: "0 6px 16px rgba(16,24,40,0.10)", px: 1.25, py: 0.875, minWidth: 128 }}>
      {label !== undefined && label !== "" ? <Typography variant="meta" color="text.secondary" component="p" sx={{ mb: 0.5 }}>{label}</Typography> : null}
      {payload.map((r) => (
        <Box key={String(r.dataKey ?? r.name)} sx={{ display: "flex", alignItems: "center", gap: 1, typography: "body2" }}>
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: r.color, flexShrink: 0 }} />
          <Box component="span" sx={{ color: "text.secondary", flex: 1 }}>{r.name}</Box>
          <Box component="span" sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{format(r)}</Box>
        </Box>
      ))}
    </Box>
  );
}
const money = (r: Row) => formatMoney(Number(r.value));
const count = (r: Row) => Number(r.value).toLocaleString("en-GB");

const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const;
const cursor = (c: { grid: string }) => ({ fill: c.grid, fillOpacity: 0.35 });

export function VolumeAreaChart({ data }: { data: DayPoint[] }) {
  const c = useChartTheme();
  const hasRefunds = data.some((d) => d.refundedMinor > 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="volFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={c.blue} stopOpacity={0.22} /><stop offset="100%" stopColor={c.blue} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} strokeOpacity={0.8} vertical={false} />
        <XAxis dataKey="label" tick={c.tick} {...AXIS} interval={interval(data.length)} />
        <YAxis tick={c.tick} {...AXIS} tickMargin={4} tickFormatter={compact} width={46} />
        <Tooltip content={<ChartTooltip format={money} />} cursor={{ stroke: c.axis, strokeOpacity: 0.35, strokeDasharray: "3 3" }} />
        {hasRefunds && <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} height={24} wrapperStyle={{ fontSize: 11, color: "inherit" }} />}
        <Area type="monotone" dataKey="capturedMinor" name="Captured" stroke={c.blue} strokeWidth={2} fill="url(#volFill)" activeDot={{ r: 4, stroke: c.paper, strokeWidth: 2 }} {...c.draw} />
        {hasRefunds && <Line type="monotone" dataKey="refundedMinor" name="Refunded" stroke={c.amber} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3.5, stroke: c.paper, strokeWidth: 2 }} {...c.draw} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SuccessDeclineChart({ data }: { data: DayPoint[] }) {
  const c = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke={c.grid} strokeOpacity={0.8} vertical={false} />
        <XAxis dataKey="label" tick={c.tick} {...AXIS} interval={interval(data.length)} />
        <YAxis tick={c.tick} {...AXIS} tickMargin={4} allowDecimals={false} width={32} />
        <Tooltip content={<ChartTooltip format={count} />} cursor={cursor(c)} />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} height={24} wrapperStyle={{ fontSize: 11 }} />
        <defs>
          {/* Hatching tells Declined apart from Successful without relying on red versus green. */}
          <pattern id="declinedHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={c.red} />
            <rect width="2" height="6" fill={c.paper} fillOpacity={0.55} />
          </pattern>
        </defs>
        <Bar dataKey="successful" name="Successful" stackId="a" fill={c.green} stroke={c.paper} strokeWidth={1} maxBarSize={20} {...c.draw} />
        <Bar dataKey="declined" name="Declined" stackId="a" fill="url(#declinedHatch)" stroke={c.paper} strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={20} {...c.draw} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RefundChart({ data }: { data: DayPoint[] }) {
  const c = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke={c.grid} strokeOpacity={0.8} vertical={false} />
        <XAxis dataKey="label" tick={c.tick} {...AXIS} interval={interval(data.length)} />
        <YAxis tick={c.tick} {...AXIS} tickMargin={4} tickFormatter={compact} width={46} />
        <Tooltip content={<ChartTooltip format={money} />} cursor={cursor(c)} />
        <Bar dataKey="refundedMinor" name="Refunded" fill={c.amber} radius={[3, 3, 0, 0]} maxBarSize={20} {...c.draw} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with the total in the middle and a legend that shows each status's count and share. */
export function StatusPie({ data }: { data: { status: Status; label: string; value: number }[] }) {
  const c = useChartTheme();
  const colour: Record<Status, string> = { CAPTURED: c.green, AUTHORIZED: c.blue, DECLINED: c.red, PARTIALLY_REFUNDED: c.amber, REFUNDED: c.axis,
    PENDING_AUTHORIZATION: c.blue, CAPTURE_PENDING: c.amber, REFUND_PENDING: c.amber, REVIEW_REQUIRED: c.red };
  const total = data.reduce((a, d) => a + d.value, 0);
  const rows: { key: string; node: ReactNode }[] = data.map((d) => ({
    key: d.status,
    node: (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, py: 0.25 }}>
        <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: colour[d.status], flexShrink: 0 }} />
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{d.label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{d.value.toLocaleString("en-GB")}</Typography>
        <Typography variant="meta" color="text.secondary" sx={{ width: 34, textAlign: "right", flexShrink: 0 }}>{total ? `${Math.round((d.value / total) * 100)}%` : "0%"}</Typography>
      </Box>
    ),
  }));
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 }, height: "100%", minWidth: 0 }}>
      {/* On phones the donut gives up width so the status names and counts stay readable. */}
      <Box sx={{ position: "relative", flex: { xs: "0 0 38%", sm: "0 0 50%" }, maxWidth: 220, height: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Tooltip content={<ChartTooltip format={count} />} />
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="94%" paddingAngle={2} cornerRadius={3} stroke="none" startAngle={90} endAngle={-270} {...c.draw}>
              {data.map((d) => <Cell key={d.status} fill={colour[d.status]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Box aria-hidden sx={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center", pointerEvents: "none" }}>
          <Typography variant="metric" component="span" sx={{ lineHeight: 1.1 }}><AnimatedValue value={String(total)} /></Typography>
          <Typography variant="meta" color="text.secondary" component="span">payments</Typography>
        </Box>
      </Box>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, flex: 1, minWidth: 0, maxHeight: "100%", overflowY: "auto" }}>
        {rows.map((r) => <li key={r.key}>{r.node}</li>)}
      </Box>
    </Box>
  );
}

export function HourlyChart({ data }: { data: { hour: string; count: number }[] }) {
  const c = useChartTheme();
  const peak = Math.max(0, ...data.map((d) => d.count));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid stroke={c.grid} strokeOpacity={0.8} vertical={false} />
        <XAxis dataKey="hour" tick={c.tick} {...AXIS} interval={2} />
        <YAxis tick={c.tick} {...AXIS} tickMargin={4} allowDecimals={false} width={32} />
        <Tooltip content={<ChartTooltip format={count} />} cursor={cursor(c)} />
        <Bar dataKey="count" name="Transactions" fill={c.blue} radius={[3, 3, 0, 0]} maxBarSize={18} {...c.draw}>
          {/* The busiest hour is full strength; the rest recede so the peak reads at a glance. */}
          {data.map((d) => <Cell key={d.hour} fill={c.blue} fillOpacity={peak > 0 && d.count === peak ? 1 : 0.7} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const toneKey = { primary: "blue", success: "green", warning: "amber", error: "red" } as const;

/** Tiny inline trend line for KPI cards. Decorative: the value and delta carry the information, so it is hidden from assistive tech. */
export function Sparkline({ data, tone = "primary", label }: { data: number[]; tone?: keyof typeof toneKey; label: string }) {
  const c = useChartTheme();
  if (data.length < 2 || data.every((n) => n === 0)) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden data-label={label} style={{ width: 72, height: 28, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey="v" stroke={c[toneKey[tone]]} strokeWidth={1.5} dot={false} {...c.draw} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
