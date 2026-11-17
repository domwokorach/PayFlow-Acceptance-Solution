"use client";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import TrendingDownRounded from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { Sparkline } from "../charts/charts";
import { AnimatedValue } from "./AnimatedValue";

export type Tone = "primary" | "success" | "warning" | "error";
export interface Delta { value: number; /** Which direction is an improvement for this metric. */ better: "up" | "down"; versus: string }

function DeltaBadge({ delta }: { delta: Delta }) {
  const up = delta.value >= 0;
  const flat = Math.abs(delta.value) < 0.05;
  const good = flat ? null : up === (delta.better === "up");
  const Icon = up ? TrendingUpRounded : TrendingDownRounded;
  const text = `${up ? "+" : "−"}${Math.abs(delta.value).toFixed(1)}%`;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, typography: "meta", fontWeight: 500, color: good === null ? "text.secondary" : good ? "success.text" : "error.text" }}>
      <Icon aria-hidden sx={{ fontSize: 14 }} />{text}
      <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{` ${up ? "up" : "down"} versus ${delta.versus}`}</Box>
    </Box>
  );
}

/** KPI card: small label, tabular value, optional period-over-period delta and sparkline (only when real history is supplied). */
export function MetricCard({ label, value, hint, tone = "primary", delta, spark, sparkLabel, info, loading }: {
  label: string; value: string; hint?: ReactNode; tone?: Tone; delta?: Delta | null; spark?: number[]; sparkLabel?: string; info?: string; loading?: boolean;
}) {
  return (
    <Card sx={{ height: "100%", px: 1.75, py: 1.5, display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        <Typography variant="label" color="text.secondary" noWrap>{label}</Typography>
        {info ? <Tooltip title={info} describeChild><IconButton size="small" aria-label={`About ${label}`} sx={{ p: 0.25, color: "text.secondary" }}><InfoOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip> : null}
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 1, minWidth: 0 }}>
        {loading ? <Skeleton variant="text" sx={{ typography: "metric", width: "55%" }} /> : <Typography variant="metric" sx={{ color: tone === "primary" ? "text.primary" : `${tone}.text`, overflowWrap: "anywhere", position: "relative" }}><AnimatedValue value={value} /></Typography>}
        {!loading && spark ? <Sparkline data={spark} tone={tone} label={sparkLabel ?? `${label} trend`} /> : null}
      </Box>
      {loading ? <Skeleton variant="text" width="70%" /> : (delta || hint) ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", position: "relative" }}>
          {delta ? <DeltaBadge delta={delta} /> : null}
          {hint ? <Typography variant="meta" color="text.secondary" component="span">{hint}</Typography> : null}
        </Box>
      ) : null}
    </Card>
  );
}
