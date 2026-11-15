"use client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { parseMoney } from "../../lib/analytics";
import { useData } from "../../lib/data";

const MAX_MINOR = 100_000_000; // £1,000,000, matching the original demo limit

export function CreatePaymentDialog() {
  const { createOpen, setCreateOpen, create, busy } = useData();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [amount, setAmount] = useState("125.00");
  const [decline, setDecline] = useState(false);
  const [provider, setProvider] = useState("SIMULATED");
  const [error, setError] = useState("");

  const [failure, setFailure] = useState("");
  const close = () => { if (!busy) { setCreateOpen(false); setError(""); setFailure(""); } };
  const submit = async () => {
    const parsed = parseMoney(amount, MAX_MINOR);
    if ("error" in parsed) { setError(parsed.error); return; }
    setFailure("");
    const r = await create(parsed.minor, provider === "SIMULATED" && decline, provider);
    if (r.ok) { setCreateOpen(false); setError(""); setDecline(false); } else setFailure(r.error); // stays on screen after the toast is gone
  };

  return (
    <Dialog open={createOpen} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="create-title">
      <DialogTitle id="create-title">Create payment</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Creates a GBP authorization. Capture and refund it from the payment details.</DialogContentText>
        <TextField autoFocus fullWidth label="Amount" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} error={!!error} helperText={error || "Up to £1,000,000.00"}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">£</InputAdornment> } }} />
        <TextField select fullWidth sx={{ mt: 2 }} label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}
          helperText={provider === "VISA_SANDBOX" ? "Sends a fixed test card to Visa's sandbox from the backend. Requires sandbox credentials." : "Local simulator, no network calls."}>
          <MenuItem value="SIMULATED">Simulator</MenuItem>
          <MenuItem value="VISA_SANDBOX">Visa Acceptance sandbox</MenuItem>
        </TextField>
        {failure && <Alert severity="error" sx={{ mt: 1.5 }}>{failure}</Alert>}
        {provider === "SIMULATED" && <FormControlLabel sx={{ mt: 1.5 }} control={<Switch checked={decline} onChange={(e) => setDecline(e.target.checked)} />} label="Simulate a declined authorization" />}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit" disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>{busy ? "Creating…" : "Create authorization"}</Button>
      </DialogActions>
    </Dialog>
  );
}
