"use client";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { canRefund, providerLabel, refundableMinor } from "../../lib/analytics";
import { formatDate, formatMoney } from "../../lib/api";
import { useNotification } from "../../hooks/useNotification";
import { useData } from "../../lib/data";
import { classifyProviderFailure, providerFailureNotice } from "../../lib/notifications/notification-utils";
import type { Payment } from "../../lib/types";
import { DetailDrawer, DetailRow } from "../ui/DetailDrawer";
import { Mono } from "../ui/Mono";
import { StatusChip } from "../ui/StatusChip";
import { RefundDialog } from "./RefundDialog";

const NO_REFUND_BALANCE = ["DECLINED", "AUTHORIZED", "PENDING_AUTHORIZATION", "CAPTURE_PENDING", "REVIEW_REQUIRED"];

function Body({ p }: { p: Payment }) {
  const { capture, reconcile, busy, opErrors, dismissOpError } = useData();
  const { notify } = useNotification();
  // Failures stay here after the toast is gone: the last failed operation (until a later attempt succeeds), plus
  // credential or provider problems recorded on the payment itself.
  const opError = opErrors[p.id];
  const failure = classifyProviderFailure(p);
  const providerNote = failure ? providerFailureNotice(failure, p, () => ({ label: "", onClick: () => undefined })) : null;
  const [refundOpen, setRefundOpen] = useState(false);
  const remaining = refundableMinor(p);
  const copy = async () => { try { await navigator.clipboard.writeText(p.id); notify.info("Payment ID copied", { category: "dashboard" }); } catch { notify.error("Copy unavailable", { description: "Copying is not available in this browser.", category: "dashboard" }); } };

  return (
    <>
      <Box sx={{ px: 2, py: 0.5 }}>
        <DetailRow label="Payment ID"><Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}><Mono>{p.id}</Mono><Tooltip title="Copy"><IconButton size="small" aria-label="Copy payment ID" onClick={() => void copy()}><ContentCopyRounded sx={{ fontSize: 14 }} /></IconButton></Tooltip></Box></DetailRow>
        <DetailRow label="Merchant"><Mono>{p.merchantId.slice(0, 8)}…</Mono></DetailRow>
        <DetailRow label="Provider">{providerLabel(p.provider)}</DetailRow>
        <DetailRow label="Created">{formatDate(p.createdAt)}</DetailRow>
        <DetailRow label="Refunded">{formatMoney(p.refundedAmountMinor, p.currency)}</DetailRow>
        <DetailRow label="Refundable balance">{NO_REFUND_BALANCE.includes(p.status) ? "—" : formatMoney(remaining, p.currency)}</DetailRow>
      </Box>
      <Stack spacing={1.25} sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        {opError && <Alert severity="error" role="alert" onClose={() => dismissOpError(p.id)}><Typography variant="subtitle2" component="p">{opError.title}</Typography>{opError.message}</Alert>}
        {providerNote && <Alert severity="error"><Typography variant="subtitle2" component="p">{providerNote.title}</Typography>{providerNote.description}</Alert>}
        {p.status === "AUTHORIZED" && <>
          <Typography variant="h4">Capture payment</Typography>
          <Typography variant="body2" color="text.secondary">Captures the full authorized amount and records balanced ledger entries.</Typography>
          <Button variant="contained" size="large" disabled={busy} onClick={() => void capture(p.id)}>{busy ? "Processing…" : "Capture full amount"}</Button>
        </>}
        {canRefund(p) && <>
          <Typography variant="h4">Refund</Typography>
          <Typography variant="body2" color="text.secondary">Up to {formatMoney(remaining, p.currency)} can still be refunded.</Typography>
          <Button variant="contained" size="large" onClick={() => setRefundOpen(true)}>Issue refund…</Button>
          <RefundDialog payment={p} open={refundOpen} onClose={() => setRefundOpen(false)} />
        </>}
        {(p.status === "CAPTURE_PENDING" || p.status === "REFUND_PENDING") && <>
          <Alert severity="warning">The provider accepted the request but has not confirmed settlement. Do not resend it.</Alert>
          <Button variant="contained" size="large" disabled={busy} onClick={() => void reconcile(p.id)}>{busy ? "Checking…" : "Check provider status"}</Button>
        </>}
        {p.status === "REVIEW_REQUIRED" && <Alert severity="error">The outcome is unknown: the request may have reached Visa. Check merchant transaction management using this payment ID before doing anything else. Do not resubmit.</Alert>}
        {p.status === "PENDING_AUTHORIZATION" && <Alert severity="info">Authorization is in progress.</Alert>}
        {p.status === "DECLINED" && <Alert severity="info">Declined. It cannot be captured.</Alert>}
        {p.status === "REFUNDED" && <Alert severity="info">This payment has been fully refunded.</Alert>}
        <Typography variant="caption" color="text.secondary">Simulator payments make no card network connection. Visa sandbox payments use test data only.</Typography>
      </Stack>
    </>
  );
}

export function PaymentDrawer() {
  const { payments, selectedId, select } = useData();
  const payment = payments.find((p) => p.id === selectedId) ?? null;
  return (
    <DetailDrawer open={!!payment} onClose={() => select(null)} ariaLabel="Payment details" eyebrow="Transaction details"
      title={payment ? formatMoney(payment.amountMinor, payment.currency) : ""} status={payment ? <StatusChip status={payment.status} size="medium" /> : null}>
      {payment ? <Body key={payment.id} p={payment} /> : null}
    </DetailDrawer>
  );
}
