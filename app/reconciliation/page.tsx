"use client";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { providerLabel } from "../../lib/analytics";
import { formatDate, formatMoney } from "../../lib/api";
import { useNotification } from "../../hooks/useNotification";
import { useData, useReconciliation } from "../../lib/data";
import { ApiError } from "../../components/ui/ApiError";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { MetricCard } from "../../components/ui/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { StatusChip } from "../../components/ui/StatusChip";

export default function ReconciliationPage() {
  const { select, reconcile, busy } = useData();
  const { data, isPending, error, isFetching, refetch } = useReconciliation();
  const { notify } = useNotification();
  const PROVIDER = "provider" as const;
  const rerun = async () => {
    const r = await refetch();
    if (r.error || !r.data) { notify({ type: "error", category: PROVIDER, title: "Reconciliation unavailable", description: r.error instanceof Error ? r.error.message : "The report could not be generated.", dedupeKey: "recon-run-failed" }); return; }
    const issues = r.data.discrepancies.length + r.data.unbalancedJournals, waiting = r.data.awaiting.length;
    if (issues) notify({ type: "error", category: PROVIDER, title: "Reconciliation discrepancy detected", description: `${issues} issue${issues === 1 ? "" : "s"} need review below.`, dedupeKey: "recon-run" });
    else if (waiting) notify({ type: "warning", category: PROVIDER, title: "Reconciliation pending", description: `${waiting} payment${waiting === 1 ? " is" : "s are"} awaiting provider confirmation or review.`, dedupeKey: "recon-run" });
    else notify({ type: "success", category: PROVIDER, title: "Reconciliation completed", description: `${r.data.paymentsChecked} payments and ${r.data.journals} journals checked.`, dedupeKey: "recon-run" });
  };
  const bad = data?.discrepancies ?? [], awaiting = data?.awaiting ?? [];
  const n = (v: number | undefined) => (v === undefined ? "—" : String(v));

  return (
    <>
      <PageHeader title="Reconciliation" subtitle="Integrity checks over payments, provider operations and the ledger."
        actions={<Button variant="outlined" color="inherit" size="small" disabled={isFetching} onClick={() => void rerun()}>{isFetching ? "Checking…" : "Re-run checks"}</Button>} />
      <ApiError />
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error instanceof Error ? error.message : "Reconciliation report unavailable"}</Alert>}
      <Alert severity="info" sx={{ mb: 1.5 }}>Calculated in PostgreSQL over all records. Captures and refunds that the provider has accepted but not confirmed are checked automatically every 30 seconds with read-only lookups; unknown outcomes are never retried and need a person.</Alert>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, mb: 1.5 }}>
        <MetricCard loading={isPending} label="Payments checked" value={n(data?.paymentsChecked)} />
        <MetricCard loading={isPending} tone={awaiting.length ? "warning" : "success"} label="Awaiting provider or review" value={n(data ? awaiting.length : undefined)} />
        <MetricCard loading={isPending} tone={bad.length ? "error" : "success"} label="Record discrepancies" value={n(data ? bad.length : undefined)} />
        <MetricCard loading={isPending} tone={data && data.unbalancedJournals ? "error" : "success"} label="Unbalanced ledger journals" value={n(data?.unbalancedJournals)} hint={data ? `${data.journals} journals checked` : undefined} />
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" } }}>
        <Panel title="Awaiting provider or review" subtitle={awaiting.length ? `${awaiting.length} to resolve` : undefined} flush>
          {isPending ? <LoadingState rows={3} /> : awaiting.length === 0 ? <EmptyState icon={<CheckCircleOutline />} title="Nothing outstanding" body="Every payment has a confirmed outcome." /> : (
            <TableContainer><Table size="small" aria-label="Payments awaiting provider or review">
              <TableHead><TableRow><TableCell scope="col">Payment</TableCell><TableCell scope="col">Status</TableCell><TableCell align="right" scope="col">Amount</TableCell><TableCell scope="col" sx={{ display: { xs: "none", md: "table-cell" } }}>Since</TableCell><TableCell align="right" scope="col">Action</TableCell></TableRow></TableHead>
              <TableBody>{awaiting.map((r) => (
                <TableRow key={r.paymentId} hover sx={{ "&:last-child td": { border: 0 } }}>
                  <TableCell><Box component="button" type="button" onClick={() => select(r.paymentId)} sx={{ all: "unset", cursor: "pointer", typography: "code", textDecoration: "underline", "&:focus-visible": { outline: 2, outlineOffset: 2 } }} aria-label={`Open payment ${r.paymentId}`}>{r.paymentId.slice(0, 8)}…</Box>
                    <Typography variant="meta" color="text.secondary" component="p">{providerLabel(r.provider)}{r.operationKind ? ` · ${r.operationKind.toLowerCase()}` : ""}</Typography></TableCell>
                  <TableCell><StatusChip status={r.status} /></TableCell>
                  <TableCell align="right">{formatMoney(r.amountMinor, r.currency)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", display: { xs: "none", md: "table-cell" } }}>{formatDate(r.since)}</TableCell>
                  <TableCell align="right">
                    {r.operationState === "AWAITING_PROVIDER" ? <Button size="small" variant="outlined" disabled={busy} onClick={() => void reconcile(r.paymentId)}>Check now</Button>
                      : <Typography variant="meta" color="text.secondary">{r.status === "REVIEW_REQUIRED" ? "Manual review" : "In flight"}</Typography>}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></TableContainer>
          )}
          {awaiting.some((r) => r.status === "REVIEW_REQUIRED") && <Alert severity="error" sx={{ m: 1.5 }}>Review-required payments may have reached Visa. Check the Visa sandbox business center using the payment ID before doing anything else. Do not resubmit.</Alert>}
        </Panel>
        <Panel title="Record discrepancies" subtitle={bad.length ? `${bad.length} to review` : undefined} flush>
          {isPending ? <LoadingState rows={3} /> : bad.length === 0 ? <EmptyState icon={<CheckCircleOutline />} title="No discrepancies" body="Statuses, refunds, provider operations and ledger entries agree." /> : (
            <TableContainer><Table size="small" aria-label="Record discrepancies">
              <TableHead><TableRow><TableCell scope="col">Issue</TableCell><TableCell scope="col">Payment</TableCell></TableRow></TableHead>
              <TableBody>{bad.map((d, i) => (
                <TableRow key={`${d.paymentId}-${i}`} hover tabIndex={0} onClick={() => select(d.paymentId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d.paymentId); } }} sx={{ cursor: "pointer", "&:last-child td": { border: 0 } }}>
                  <TableCell sx={{ color: "error.text" }}>{d.issue}</TableCell><TableCell sx={{ typography: "code" }}>{d.paymentId.slice(0, 8)}…</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></TableContainer>
          )}
        </Panel>
      </Box>
      <Typography variant="meta" color="text.secondary" component="p" sx={{ mt: 1.5 }}>{data ? `Report generated ${formatDate(data.generatedAt)}. ` : ""}Select a row to open the payment.</Typography>
    </>
  );
}
