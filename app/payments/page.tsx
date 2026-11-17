"use client";
import AddRounded from "@mui/icons-material/AddRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { inRange, statusLabels } from "../../lib/analytics";
import { useNotification } from "../../hooks/useNotification";
import { useData } from "../../lib/data";
import { PaymentsTable } from "../../components/payments/PaymentsTable";
import { ApiError } from "../../components/ui/ApiError";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { FilterToolbar, SearchField } from "../../components/ui/FilterToolbar";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";

export default function PaymentsPage() {
  const { payments, query, setQuery, status, setStatus, range, setRange, setCreateOpen } = useData();
  const { notify } = useNotification();
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange(payments, range).filter((p) => (!status || p.status === status) && (!q || `${p.id} ${p.currency} ${p.status} ${p.provider}`.toLowerCase().includes(q)));
  }, [payments, query, status, range]);

  function exportCsv() {
    try {
      const header = "Payment ID,Date,Amount Minor,Currency,Status,Refunded Minor,Provider";
      const lines = rows.map((p) => [p.id, p.createdAt, p.amountMinor, p.currency, p.status, p.refundedAmountMinor, p.provider].join(","));
      const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "payflow-transactions.csv"; a.click(); URL.revokeObjectURL(a.href);
      notify.success("Export completed", { description: `${rows.length} transaction${rows.length === 1 ? "" : "s"} exported to CSV.`, category: "dashboard" });
    } catch { notify.error("Export failed", { description: "The CSV file could not be created.", category: "dashboard" }); }
  }

  return (
    <>
      <PageHeader title="Payments" subtitle="Review authorizations, captures, declines and refunds."
        actions={<><Button variant="outlined" color="inherit" size="small" startIcon={<DownloadRounded />} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button><Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>New payment</Button></>} />
      <ApiError />
      <Panel title="Transactions" subtitle={`${rows.length.toLocaleString("en-GB")} shown`} flush>
        <FilterToolbar>
          <SearchField value={query} onChange={setQuery} placeholder="Search by ID, status, provider…" label="Filter transactions" />
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            <MenuItem value="">All statuses</MenuItem>
            {Object.entries(statusLabels).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </TextField>
          <DateRangeFilter value={range} onChange={setRange} />
        </FilterToolbar>
        <PaymentsTable rows={rows} />
      </Panel>
      <Typography variant="meta" color="text.secondary" component="p" sx={{ mt: 1 }}>Select a row for details. Capture and refund are available inline and in the details panel.</Typography>
    </>
  );
}
