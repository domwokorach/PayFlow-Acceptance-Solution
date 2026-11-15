"use client";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { RANGES, type Range } from "../../lib/analytics";

export function DateRangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v: Range | null) => { if (v) onChange(v); }} aria-label="Date range" sx={{ "& .MuiToggleButton-root": { minHeight: 30, "@media (max-width:599.95px)": { minHeight: 40, flex: 1 } } }}>
      {RANGES.map((r) => <ToggleButton key={r.value} value={r.value}>{r.label}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}
