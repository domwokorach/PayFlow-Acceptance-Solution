"use client";
import CloseRounded from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** Right-hand detail drawer: full-width on phones, 420px otherwise. Header shows eyebrow, title and an optional status slot. */
export function DetailDrawer({ open, onClose, ariaLabel, eyebrow, title, status, children }: {
  open: boolean; onClose: () => void; ariaLabel: string; eyebrow: string; title: string; status?: ReactNode; children: ReactNode;
}) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100vw", sm: 420 }, maxWidth: "100vw" }, role: "dialog", "aria-label": ariaLabel } }}>
      <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">{eyebrow}</Typography>
          <Typography variant="metric" component="h2" sx={{ mt: 0.25 }}>{title}</Typography>
          {status ? <Box sx={{ mt: 0.75 }}>{status}</Box> : null}
        </Box>
        <IconButton aria-label="Close details" onClick={onClose}><CloseRounded /></IconButton>
      </Box>
      <Divider />
      {children}
    </Drawer>
  );
}

/** Label/value line for detail drawers and summaries. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.875, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
      <Typography variant="label" color="text.secondary" component="span">{label}</Typography>
      <Typography variant="body2" component="span" sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right", overflowWrap: "anywhere" }}>{children}</Typography>
    </Box>
  );
}
