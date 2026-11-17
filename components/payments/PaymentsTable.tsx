"use client";
import CheckRounded from "@mui/icons-material/CheckRounded";
import KeyboardReturnRounded from "@mui/icons-material/KeyboardReturnRounded";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { canCapture, canRefund, providerLabel, statusLabels } from "../../lib/analytics";
import { formatDate, formatMoney } from "../../lib/api";
import { useData } from "../../lib/data";
import type { Payment } from "../../lib/types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { StatusChip } from "../ui/StatusChip";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { RefundDialog } from "./RefundDialog";

type SortKey = "createdAt" | "amountMinor" | "status" | "provider";
const flash = keyframes`from { background-color: color-mix(in srgb, var(--mui-palette-primary-main) 20%, transparent); } to { background-color: transparent; }`;
/** Subtle highlight for a row the backend just changed. Reduced motion gets a static tint instead of a fade. */
const flashSx = (on: boolean) => (on ? { animation: `${flash} 2.4s ease-out`, "@media (prefers-reduced-motion: reduce)": { animation: "none", bgcolor: "action.selected" } } : {});
const hideBelowLg = { display: { xs: "none", lg: "table-cell" } } as const;

/** Compact payments table: sortable, paginated, keyboard-navigable rows with inline capture/refund. Phones get tappable cards. */
export function PaymentsTable({ rows, pageSize = 10, compact }: { rows: Payment[]; pageSize?: number; compact?: boolean }) {
  const { select, selectedId, loading, capture, busy, changed } = useData();
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  // Each row's one control, so focus can return to it when an inline action removes the button that had it.
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { setPage(0); }, [rows.length]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const c = sortKey === "amountMinor" ? a.amountMinor - b.amountMinor : sortKey === "createdAt" ? a.createdAt.localeCompare(b.createdAt) : a[sortKey].localeCompare(b[sortKey]);
    return dir === "asc" ? c : -c;
  }), [rows, sortKey, dir]);
  const view = compact ? sorted.slice(0, pageSize) : sorted.slice(page * size, page * size + size);
  const sortBy = (k: SortKey) => { if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc"); else { setSortKey(k); setDir(k === "status" || k === "provider" ? "asc" : "desc"); } };

  if (loading && rows.length === 0) return <LoadingState rows={compact ? 4 : 8} />;
  if (rows.length === 0) return <EmptyState icon={<ReceiptLongOutlined />} title="No payments match" body="Adjust the search, status or date range, or create a new payment." />;

  const head = (k: SortKey, label: string, align?: "right", sx?: object) => (
    <TableCell align={align} sx={sx} sortDirection={sortKey === k ? dir : false}><TableSortLabel active={sortKey === k} direction={sortKey === k ? dir : "asc"} onClick={() => sortBy(k)}>{label}</TableSortLabel></TableCell>
  );

  return (
    <>
      {/* Phones: essential information first, whole card opens details. */}
      <Stack component="ul" aria-label="Payments" sx={{ display: { xs: "flex", sm: "none" }, listStyle: "none", m: 0, p: 1.5, gap: 1 }}>
        {view.map((p) => (
          <li key={p.id}>
            <ButtonBase onClick={() => select(p.id)} sx={{ display: "block", width: "100%", textAlign: "left", p: 1.5, minHeight: 64, border: 1, borderColor: p.id === selectedId ? "primary.main" : "divider", borderRadius: 1, bgcolor: "background.paper", ...flashSx(changed.has(p.id)) }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle1" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(p.amountMinor, p.currency)}</Typography>
                <StatusChip status={p.status} />
              </Box>
              <Typography variant="meta" color="text.secondary" component="p" sx={{ mt: 0.5 }}>{formatDate(p.createdAt)} · {providerLabel(p.provider)}</Typography>
              <Typography variant="code" color="text.secondary" component="p">{p.id.slice(0, 8)}…</Typography>
            </ButtonBase>
          </li>
        ))}
      </Stack>
      <TableContainer tabIndex={0} role="region" aria-label="Payments table" sx={{ display: { xs: "none", sm: "block" } }}>
        <Table size="small" aria-label="Payments" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell scope="col">Transaction</TableCell>
              {head("createdAt", "Date")}
              <TableCell scope="col" sx={hideBelowLg}>Merchant</TableCell>
              {head("provider", "Provider", undefined, hideBelowLg)}
              {head("status", "Status")}
              {head("amountMinor", "Amount", "right")}
              <TableCell align="right" scope="col" sx={hideBelowLg}>Refunded</TableCell>
              <TableCell align="right" scope="col"><Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</Box></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.map((p) => (
              <TableRow key={p.id} hover selected={p.id === selectedId} onClick={() => select(p.id)}
                sx={{ cursor: "pointer", "&:last-child td": { border: 0 }, ...flashSx(changed.has(p.id)) }}>
                <TableCell>
                  {/* The row click is a mouse shortcut; this is the keyboard and screen reader control, named with what the row shows. */}
                  <ButtonBase ref={(el: HTMLButtonElement | null) => { if (el) rowButtons.current.set(p.id, el); else rowButtons.current.delete(p.id); }} onClick={(e) => { e.stopPropagation(); select(p.id); }} sx={{ typography: "code", borderRadius: 0.5 }}>
                    {p.id.slice(0, 8)}…<VisuallyHidden>, {formatMoney(p.amountMinor, p.currency)}, {statusLabels[p.status]}{p.id === selectedId ? ", selected" : ""}</VisuallyHidden>
                  </ButtonBase>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</TableCell>
                <TableCell sx={{ ...hideBelowLg, typography: "code" }}>{p.merchantId.slice(0, 8)}…</TableCell>
                <TableCell sx={hideBelowLg}>{providerLabel(p.provider)}</TableCell>
                <TableCell><StatusChip status={p.status} /></TableCell>
                <TableCell align="right" sx={{ fontWeight: 500 }}>{formatMoney(p.amountMinor, p.currency)}</TableCell>
                <TableCell align="right" sx={{ ...hideBelowLg, color: p.refundedAmountMinor ? "text.primary" : "text.secondary" }}>{p.refundedAmountMinor ? formatMoney(p.refundedAmountMinor, p.currency) : "—"}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {canCapture(p) && <Tooltip title="Capture full amount" describeChild><span><IconButton size="small" disabled={busy} aria-label={`Capture payment ${p.id}`} onClick={(e) => { e.stopPropagation(); void capture(p.id).then(() => rowButtons.current.get(p.id)?.focus()); }}><CheckRounded fontSize="small" /></IconButton></span></Tooltip>}
                  {canRefund(p) && <Tooltip title="Refund"><IconButton size="small" aria-label={`Refund payment ${p.id}`} onClick={(e) => { e.stopPropagation(); setRefundFor(p); }}><KeyboardReturnRounded fontSize="small" /></IconButton></Tooltip>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!compact && <TablePagination component="div" count={sorted.length} page={page} onPageChange={(_, n) => setPage(n)} rowsPerPage={size} onRowsPerPageChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} sx={{ borderTop: 1, borderColor: "divider" }} />}
      {refundFor && <RefundDialog payment={refundFor} open onClose={() => setRefundFor(null)} />}
    </>
  );
}
