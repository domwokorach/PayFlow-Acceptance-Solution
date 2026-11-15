"use client";
import EditOutlined from "@mui/icons-material/EditOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { isCaptured, kpis } from "../../lib/analytics";
import { formatDate, formatMoney } from "../../lib/api";
import { useData } from "../../lib/data";
import { EditMerchantDialog } from "../../components/merchants/EditMerchantDialog";
import { PaymentsTable } from "../../components/payments/PaymentsTable";
import { ApiError } from "../../components/ui/ApiError";
import { DetailRow } from "../../components/ui/DetailDrawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { Mono } from "../../components/ui/Mono";
import { MetricCard } from "../../components/ui/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { StatusIndicator } from "../../components/ui/StatusIndicator";

const DAY = 86_400_000;
const visuallyHidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

export default function MerchantsPage() {
  const { payments, merchants: profiles, merchantsLoading, loading } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Profiles come from the merchants API; transaction statistics are aggregated from the loaded payments.
  const [now] = useState(() => Date.now()); // "active" is judged as of page load; keeps render pure
  const merchants = useMemo(() => profiles.map((profile) => {
    const rows = payments.filter((p) => p.merchantId === profile.id);
    const last = rows.reduce((a, p) => (p.createdAt > a ? p.createdAt : a), "");
    return { id: profile.id, profile, rows, k: kpis(rows), last, active: !!last && now - new Date(last).getTime() < 30 * DAY };
  }), [payments, profiles, now]);
  const selected = merchants.find((m) => m.id === (open ?? merchants[0]?.id));

  return (
    <>
      <PageHeader title="Merchants" subtitle="Merchant accounts and their transaction statistics." />
      <ApiError />
      {(loading || merchantsLoading) && merchants.length === 0 ? <Panel title="Merchants" flush><LoadingState rows={3} /></Panel> : merchants.length === 0 ? (
        <Panel title="Merchants"><EmptyState icon={<StorefrontOutlined />} title="No merchants yet" body="No merchant profile is available for this account yet." /></Panel>
      ) : (
        <>
          <Panel title="Merchant accounts" subtitle={`${merchants.length} ${merchants.length === 1 ? "merchant" : "merchants"}`} flush sx={{ mb: 1.5 }}>
            <TableContainer>
              <Table size="small" aria-label="Merchants" sx={{ minWidth: 560 }}>
                <TableHead><TableRow>
                  <TableCell scope="col">Merchant</TableCell><TableCell scope="col">Status</TableCell>
                  <TableCell align="right" scope="col">Transactions</TableCell><TableCell align="right" scope="col">Captured</TableCell><TableCell align="right" scope="col">Success</TableCell><TableCell scope="col">Last activity</TableCell><TableCell align="right" scope="col" sx={{ width: 48 }}><Box component="span" sx={visuallyHidden}>Actions</Box></TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {merchants.map((m) => (
                    <TableRow key={m.id} hover selected={selected?.id === m.id} tabIndex={0} aria-selected={selected?.id === m.id} onClick={() => setOpen(m.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(m.id); } }} sx={{ cursor: "pointer", "&:last-child td": { border: 0 } }}>
                      <TableCell><Typography variant="h4" component="span">{m.profile.displayName}</Typography><Typography variant="code" color="text.secondary" component="p">{m.id.slice(0, 8)}…</Typography></TableCell>
                      <TableCell><StatusIndicator tone={m.active ? "success" : "neutral"} label={m.active ? "Active" : "Dormant"} /></TableCell>
                      <TableCell align="right">{m.k.total}</TableCell>
                      <TableCell align="right">{formatMoney(m.k.capturedMinor)}</TableCell>
                      <TableCell align="right">{m.k.successRate.toFixed(0)}%</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{m.last ? formatDate(m.last) : "No activity yet"}</TableCell>
                      <TableCell align="right" sx={{ py: 0.25 }}>
                        <Tooltip title="Edit merchant"><IconButton size="small" aria-label={`Edit ${m.profile.displayName}`} onClick={(e) => { e.stopPropagation(); setOpen(m.id); setEditing(true); }} onKeyDown={(e) => e.stopPropagation()}><EditOutlined fontSize="small" /></IconButton></Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
          {selected && (
            <>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, mb: 1.5 }}>
                <MetricCard label="Net processed" value={formatMoney(selected.k.netMinor)} />
                <MetricCard tone="success" label="Captured payments" value={String(selected.rows.filter(isCaptured).length)} />
                <MetricCard tone="error" label="Decline rate" value={`${selected.k.declineRate.toFixed(1)}%`} />
                <MetricCard label="Last activity" value={selected.last ? formatDate(selected.last) : "None yet"} />
              </Box>
              <Panel title="Merchant profile" subtitle="Saved in PayFlow" sx={{ mb: 1.5 }}
                actions={<Button size="small" variant="outlined" color="inherit" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Edit merchant</Button>}>
                <Box sx={{ maxWidth: 560 }}>
                  <DetailRow label="Display name">{selected.profile.displayName}</DetailRow>
                  <DetailRow label="Business name">{selected.profile.businessName || "Not set"}</DetailRow>
                  <DetailRow label="Contact email">{selected.profile.contactEmail || "Not set"}</DetailRow>
                  <DetailRow label="Merchant ID"><Mono>{selected.id}</Mono></DetailRow>
                  <DetailRow label="Last updated">{formatDate(selected.profile.updatedAt)}</DetailRow>
                </Box>
              </Panel>
              <EditMerchantDialog key={selected.id} merchant={selected.profile} open={editing} onClose={() => setEditing(false)} />
              <Panel title="Recent transactions" subtitle={`Merchant ${selected.id.slice(0, 8)}…`} flush><PaymentsTable rows={selected.rows} pageSize={6} compact /></Panel>
            </>
          )}
        </>
      )}
    </>
  );
}
