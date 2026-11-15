"use client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useRef, useState, type FormEvent } from "react";
import { useData } from "../../lib/data";
import { changedFields, toForm, validateMerchant, type MerchantForm, type MerchantFormErrors } from "../../lib/merchants";
import type { Merchant } from "../../lib/types";

/** Edits the display name, contact email and business name. The form is prefilled from the saved merchant and keeps the user's input if saving fails. */
export function EditMerchantDialog({ merchant, open, onClose }: { merchant: Merchant; open: boolean; onClose: () => void }) {
  const { updateMerchant } = useData();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [form, setForm] = useState<MerchantForm>(() => toForm(merchant));
  const [errors, setErrors] = useState<MerchantFormErrors>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false); // blocks a second submit in the same tick, before React re-renders the disabled button

  const payload = changedFields(merchant, form);
  const dirty = Object.keys(payload).length > 0;
  const set = (k: keyof MerchantForm) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); setFailure(""); };
  const reset = () => { setForm(toForm(merchant)); setErrors({}); setFailure(""); };
  const close = () => { if (!saving) onClose(); };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || !dirty) return;
    const found = validateMerchant(form);
    if (Object.keys(found).length) { setErrors(found); return; }
    inFlight.current = true; setSaving(true); setFailure("");
    const r = await updateMerchant(merchant.id, payload);
    inFlight.current = false; setSaving(false);
    if (r.ok) { onClose(); return; }
    setErrors(r.fields); setFailure(r.error); // form values stay exactly as the user typed them
  };

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="edit-merchant-title"
      slotProps={{ transition: { onExited: reset } }}>
      <form onSubmit={(e) => void submit(e)} noValidate style={{ display: "contents" }}>
        <DialogTitle id="edit-merchant-title">Edit merchant</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>Update how this merchant appears in PayFlow. Merchant ID and API credentials cannot be changed here.</DialogContentText>
          <Stack spacing={2}>
            <TextField autoFocus fullWidth required label="Display name" value={form.displayName} onChange={set("displayName")} error={!!errors.displayName} helperText={errors.displayName || " "} disabled={saving}
              slotProps={{ htmlInput: { maxLength: 120, autoComplete: "organization" } }} />
            <TextField fullWidth label="Contact email" type="email" value={form.contactEmail} onChange={set("contactEmail")} error={!!errors.contactEmail} helperText={errors.contactEmail || "Optional"} disabled={saving}
              slotProps={{ htmlInput: { maxLength: 254, autoComplete: "email", inputMode: "email" } }} />
            <TextField fullWidth label="Business name" value={form.businessName} onChange={set("businessName")} error={!!errors.businessName} helperText={errors.businessName || "Optional. Registered or legal name."} disabled={saving}
              slotProps={{ htmlInput: { maxLength: 120, autoComplete: "organization" } }} />
          </Stack>
          {failure && <Alert severity="error" sx={{ mt: 1.5 }}>{failure}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || !dirty} startIcon={saving ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
