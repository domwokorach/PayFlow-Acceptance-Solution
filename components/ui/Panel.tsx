"use client";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { useId, useState, type ReactNode } from "react";

/** Compact panel header: title, optional subtitle, right-aligned actions and an optional collapse toggle. */
export function PanelHeader({ title, subtitle, actions, id }: { title: string; subtitle?: string; actions?: ReactNode; id?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", minWidth: 0 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h3" component="h2" id={id}>{title}</Typography>
        {subtitle ? <Typography variant="meta" color="text.secondary" component="p">{subtitle}</Typography> : null}
      </Box>
      {actions ? <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>{actions}</Box> : null}
    </Box>
  );
}

/** Flat bordered surface with a compact header. `flush` removes body padding (tables); `collapsible` adds an accessible toggle. */
export function Panel({ title, subtitle, actions, collapsible, defaultOpen = true, flush, children, sx }: {
  title: string; subtitle?: string; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; flush?: boolean; children: ReactNode; sx?: SxProps<Theme>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useId();
  const bodyId = `${uid}-body`;
  const toggle = collapsible ? (
    <IconButton size="small" aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? "Collapse" : "Expand"} ${title}`} onClick={() => setOpen((o) => !o)}
      sx={{ "& svg": { transition: (t) => t.transitions.create("transform", { duration: 120 }), transform: open ? "none" : "rotate(-90deg)" } }}><ExpandMoreRounded fontSize="small" /></IconButton>
  ) : null;
  return (
    <Card component="section" aria-labelledby={`${uid}-title`} sx={[{ minWidth: 0, display: "flex", flexDirection: "column" }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box sx={{ px: 2, py: 1.25, borderBottom: open ? 1 : 0, borderColor: "divider" }}>
        <PanelHeader id={`${uid}-title`} title={title} subtitle={subtitle} actions={<>{actions}{toggle}</>} />
      </Box>
      <Collapse in={open} id={bodyId} unmountOnExit={false} sx={{ flex: 1 }}>
        <Box sx={{ p: flush ? 0 : 2, height: "100%" }}>{children}</Box>
      </Collapse>
    </Card>
  );
}

export interface ChartTable { columns: string[]; rows: (string | number)[][] }

/**
 * Fixed-height chart region. The chart is an image whose name carries a one-line summary; the same numbers are
 * available as a table behind a toggle, so the values are not locked inside the graphic.
 */
export function ChartArea({ height = 220, label, summary, table, children }: { height?: number; label: string; summary?: string; table?: ChartTable; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <Box component="figure" sx={{ m: 0 }}>
      <Box role="img" aria-label={summary ? `${label}. ${summary}` : label} sx={{ height, width: "100%", minWidth: 0 }}>{children}</Box>
      {table && table.rows.length > 0 && (
        <>
          <Button size="small" color="inherit" aria-expanded={show} aria-controls={id} onClick={() => setShow((s) => !s)} sx={{ mt: 0.5 }}>{show ? "Hide" : "Show"} data table</Button>
          {show && (
            <TableContainer id={id} tabIndex={0} role="region" aria-label={`${label} data`} sx={{ maxHeight: 240, mt: 0.5 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>{table.columns.map((c, i) => <TableCell key={c} scope="col" align={i ? "right" : "left"}>{c}</TableCell>)}</TableRow></TableHead>
                <TableBody>{table.rows.map((r, i) => <TableRow key={i}>{r.map((v, j) => <TableCell key={j} align={j ? "right" : "left"} {...(j === 0 && { component: "th", scope: "row" })}>{v}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
