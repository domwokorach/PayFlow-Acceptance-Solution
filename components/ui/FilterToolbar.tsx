"use client";
import SearchRounded from "@mui/icons-material/SearchRounded";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import type { ReactNode } from "react";

/** Inline filter row that sits flush on top of a table panel: wraps on tablet, stacks on phones. */
export function FilterToolbar({ children }: { children: ReactNode }) {
  return <Box role="search" sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", "& > .grow": { flex: "1 1 220px" }, "@media (max-width:599.95px)": { "& > *": { width: "100%" } } }}>{children}</Box>;
}

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <TextField className="grow" size="small" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      slotProps={{ htmlInput: { "aria-label": label }, input: { startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18 }} /></InputAdornment> } }} />
  );
}
