"use client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useNotification } from "../../hooks/useNotification";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  const { notify } = useNotification();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("payflow.sidebar") === "1"); } catch { /* ignore */ } }, []);
  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences are stored in this browser only." />
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, alignItems: "start" }}>
        <Panel title="Appearance" collapsible>
          <Typography variant="label" color="text.secondary" component="p" sx={{ mb: 0.75 }}>Theme</Typography>
          <ToggleButtonGroup exclusive size="small" value={mode ?? "system"} onChange={(_, v) => { if (v && v !== mode) { setMode(v); notify.info("Theme updated", { description: v === "system" ? "Following your device setting." : `${v === "dark" ? "Dark" : "Light"} theme is on.`, category: "account" }); } }} aria-label="Colour theme" fullWidth sx={{ maxWidth: 360, "& .MuiToggleButton-root": { minHeight: 36 } }}>
            <ToggleButton value="light">Light</ToggleButton><ToggleButton value="dark">Dark</ToggleButton><ToggleButton value="system">System</ToggleButton>
          </ToggleButtonGroup>
          <Divider sx={{ my: 1.5 }} />
          <FormControlLabel control={<Switch size="small" checked={collapsed} onChange={(e) => {
            setCollapsed(e.target.checked);
            try { localStorage.setItem("payflow.sidebar", e.target.checked ? "1" : "0"); notify.success("Preferences saved", { description: "Stored in this browser only.", category: "account" }); }
            catch { notify.error("Preferences not saved", { description: "This browser blocked local storage, so the setting will not persist.", category: "account" }); }
          }} />} label={<Typography variant="body2">Start with the sidebar collapsed (applies on next load, desktop)</Typography>} />
        </Panel>
        <Panel title="Account" collapsible>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <TextField size="small" label="Operator" value="Demo operator" slotProps={{ input: { readOnly: true } }} />
            <TextField size="small" label="Merchant" value="Acme Demo Store" slotProps={{ input: { readOnly: true } }} />
          </Box>
        </Panel>
        <Panel title="Security & configuration" collapsible>
          <Alert severity="info" sx={{ mb: 1.5 }}>There is no end-user sign-in in this milestone. The API key stays on the Next.js server and is never exposed to browser JavaScript.</Alert>
          <Typography variant="body2" color="text.secondary">Before any public deployment: OAuth2/JWT, user-scoped RBAC, merchant isolation, secret management, rate limiting, audit logging and a threat review (see the README).</Typography>
        </Panel>
      </Box>
    </>
  );
}
