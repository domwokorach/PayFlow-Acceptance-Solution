"use client";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { useNotification } from "../../hooks/useNotification";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";

const KEY = "local-only-change-me";
const ENDPOINTS = [
  ["GET", "/api/v1/payments", "Latest 100 payments; ?q= and ?status= filters"],
  ["GET", "/api/v1/payments/{id}", "Payment details"],
  ["POST", "/api/v1/payments", "Create a payment (provider SIMULATED or VISA_SANDBOX)"],
  ["POST", "/api/v1/payments/{id}/capture", "Capture the full authorized amount"],
  ["POST", "/api/v1/payments/{id}/refunds", "Refund an eligible captured payment"],
  ["POST", "/api/v1/payments/{id}/reconcile", "Check the provider for a pending capture or refund"],
  ["GET", "/api/v1/dashboard/summary", "Aggregates from PostgreSQL; ?days=7|30|0 (0 = all time)"],
  ["GET", "/api/v1/reconciliation", "Awaiting-provider payments, ledger balance and record discrepancies"],
  ["GET", "/api/v1/events/stream", "Server-Sent Events; resume with Last-Event-ID or ?lastEventId="],
];
const EXAMPLES = [
  { label: "Create", code: `curl -s -X POST http://localhost:8080/api/v1/payments \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Demo-Api-Key: ${KEY}' \\\n  -H 'Idempotency-Key: demo_create_0001' \\\n  -d '{"amountMinor":12500,"currency":"GBP","simulateDecline":false}'`, res: `{\n  "id": "3f2b9c1e-…",\n  "status": "AUTHORIZED",\n  "amountMinor": 12500,\n  "currency": "GBP",\n  "refundedAmountMinor": 0\n}` },
  { label: "Capture", code: `curl -s -X POST http://localhost:8080/api/v1/payments/<PAYMENT_UUID>/capture \\\n  -H 'X-Demo-Api-Key: ${KEY}' \\\n  -H 'Idempotency-Key: demo_capture_0001'`, res: `{ "id": "3f2b9c1e-…", "status": "CAPTURED" }` },
  { label: "Refund", code: `curl -s -X POST http://localhost:8080/api/v1/payments/<PAYMENT_UUID>/refunds \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Demo-Api-Key: ${KEY}' \\\n  -H 'Idempotency-Key: demo_refund_0001' \\\n  -d '{"amountMinor":2500}'`, res: `{ "paymentId": "3f2b9c1e-…", "amountMinor": 2500 }` },
  { label: "Summary", code: `curl -s http://localhost:8080/api/v1/dashboard/summary \\\n  -H 'X-Demo-Api-Key: ${KEY}'`, res: `{ "generatedAt": "…", "days": 30, "totals": { "total": …, "declined": …, "capturedVolumeMinor": … }, "previous": { … }, "daily": [ … ], "providers": [ … ] }` },
  { label: "Events", code: `curl -N http://localhost:8080/api/v1/events/stream \\\n  -H 'X-Demo-Api-Key: ${KEY}'`, res: `event: ready\ndata: {"latestEventId":41}\n\nid: 42\nevent: PAYMENT_STATUS_CHANGED\ndata: {"eventId":"evt_42","type":"PAYMENT_STATUS_CHANGED","paymentId":"…","status":"CAPTURED","occurredAt":"…"}` },
];

function Code({ text, label }: { text: string; label: string }) {
  const { notify } = useNotification();
  const copy = async () => { try { await navigator.clipboard.writeText(text); notify.info(`${label} copied`, { category: "dashboard" }); } catch { notify.error("Copy unavailable", { description: "Copying is not available in this browser.", category: "dashboard" }); } };
  return (
    <Box sx={{ position: "relative" }}>
      <Tooltip title="Copy"><IconButton aria-label={`Copy ${label}`} onClick={() => void copy()} size="small" sx={{ position: "absolute", top: 8, right: 8, color: "#CBD5E1" }}><ContentCopyRounded fontSize="small" /></IconButton></Tooltip>
      <Box component="pre" tabIndex={0} sx={{ m: 0, p: 1.5, pr: 6, borderRadius: 1, bgcolor: "#0B1220", color: "#E2E8F0", typography: "code", overflowX: "auto", maxWidth: "100%" }}>{text}</Box>
    </Box>
  );
}

export default function DevelopersPage() {
  const [tab, setTab] = useState(0);
  const ex = EXAMPLES[tab];
  return (
    <>
      <PageHeader title="Developers" subtitle="REST API reference and sandbox integration notes." />
      <Alert severity="warning" sx={{ mb: 1.5 }}>The demo key shown here is the documented local-only value for <code>localhost</code>. The dashboard never sends it from the browser: the Next.js server proxy adds it. Do not deploy this milestone publicly.</Alert>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, alignItems: "start" }}>
        <Panel title="Endpoints" flush>
          <TableContainer><Table size="small" aria-label="API endpoints"><TableHead><TableRow><TableCell scope="col">Method</TableCell><TableCell scope="col">Endpoint</TableCell><TableCell scope="col">Result</TableCell></TableRow></TableHead>
            <TableBody>{ENDPOINTS.map(([m, e, d]) => <TableRow key={m + e} sx={{ "&:last-child td": { border: 0 } }}><TableCell><Chip size="small" label={m} sx={(t) => ({ minWidth: 44, color: m === "GET" ? t.vars!.palette.primary.text : t.vars!.palette.success.text, bgcolor: alpha(m === "GET" ? t.palette.primary.main : t.palette.success.main, 0.12) })} /></TableCell><TableCell sx={{ typography: "code", whiteSpace: "nowrap" }}>{e}</TableCell><TableCell>{d}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, maxWidth: "72ch", borderTop: 1, borderColor: "divider" }}>Money is in minor units (<code>12500</code> = £125.00; GBP only). Every POST needs a unique <code>Idempotency-Key</code> (8–128 chars: letters, digits, hyphen, underscore). Replaying the same key and payload is safe; reusing it for a different request returns HTTP 409.</Typography>
        </Panel>
        <Panel title="Examples">
          <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="Request examples" sx={{ mb: 1.5, mt: -0.5 }}>{EXAMPLES.map((e) => <Tab key={e.label} label={e.label} />)}</Tabs>
          <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 0.5 }}>Request</Typography><Code text={ex.code} label="request" />
          <Typography variant="overline" color="text.secondary" component="p" sx={{ mt: 1.5, mb: 0.5 }}>Response (abridged)</Typography><Code text={ex.res} label="response" />
        </Panel>
      </Box>
    </>
  );
}
