"use client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { parseMoney } from "../../lib/analytics";
import { formatMoney } from "../../lib/api";
import { useData } from "../../lib/data";
import type { Payment } from "../../lib/types";

export function RefundDialog({ payment, open, onClose }: { payment: Payment; open: boolean; onClose: () => void }) {
  const { refund, busy } = useData();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
  const remaining = payment.amountMinor - payment.refundedAmountMinor;
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState("");

  const submit = async () => {
    const parsed = parseMoney(amount, remaining);
    if ("error" in parsed) { setError(parsed.error.startsWith("Amount exceeds") ? `Enter an amount up to ${formatMoney(remaining, payment.currency)}.` : parsed.error); return; }
    setFailure("");
    const r = await refund(payment.id, parsed.minor);
    if (r.ok) { setAmount(""); setError(""); onClose(); } else setFailure(r.error); // stays on screen after the toast is gone
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="refund-title">
      <DialogTitle id="refund-title">Issue refund</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Refundable balance: <strong>{formatMoney(remaining, payment.currency)}</strong>. A balanced ledger journal is recorded.</DialogContentText>
        <TextField autoFocus fullWidth label="Refund amount" value={amount} placeholder="0.00" onChange={(e) => { setAmount(e.target.value); setError(""); }} error={!!error} helperText={error || " "}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">£</InputAdornment> } }} />
        {failure && <Alert severity="error" sx={{ mt: 1 }}>{failure}</Alert>}
        <Button size="small" onClick={() => { setAmount((remaining / 100).toFixed(2)); setError(""); }} sx={{ mt: 0.5 }}>Refund full remaining</Button>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>{busy ? "Processing…" : "Submit refund"}</Button>
      </DialogActions>
    </Dialog>
  );
}
