"use client";
import PowerOutlined from "@mui/icons-material/PowerOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { providerLabel } from "../../lib/analytics";
import { providerHealthLabel, providerHealthTone } from "../../lib/summary";
import { formatDate } from "../../lib/api";
import { useData } from "../../lib/data";
import { ApiError } from "../../components/ui/ApiError";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { StatusIndicator } from "../../components/ui/StatusIndicator";
import { ModalLiveRegions } from "../../components/notifications/LiveRegions";

const DESCRIPTIONS: Record<string, string> = { SIMULATED: "Local authorization simulator, no network calls", VISA_SANDBOX: "Visa Acceptance sandbox, called from the backend with test data" };

export default function ConnectorsPage() {
  const { summary, error, lastSync } = useData();
  const [config, setConfig] = useState<string | null>(null);
  const providers = summary?.providers ?? [];

  return (
    <>
      <PageHeader title="Connectors" subtitle="Payment providers connected to PayFlow." />
      <ApiError />
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" } }}>
        {providers.length === 0 && <Panel title="Providers"><EmptyState title={error ? "Provider data unavailable" : "Loading providers…"} /></Panel>}
        {providers.map((p) => (
          <Panel key={p.name} title={providerLabel(p.name)} subtitle={DESCRIPTIONS[p.name] ?? "Payment provider"}
            actions={<><Chip size="small" label="Sandbox" variant="outlined" /><StatusIndicator tone={providerHealthTone(p.health)} label={providerHealthLabel(p.health)} /></>}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>{p.healthDetail}</Typography>
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.25, m: 0 }}>
              {[["Transactions", String(p.total)], ["Auth success", p.successful + p.declined ? `${((p.successful / (p.successful + p.declined)) * 100).toFixed(1)}%` : "—"], ["Declined", String(p.declined)], ["Last used", p.lastUsed ? formatDate(p.lastUsed) : "Not used yet"]].map(([l, v]) => (
                <Box key={l}><Typography variant="label" color="text.secondary" component="dt">{l}</Typography><Typography variant="body2" component="dd" sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}>{v}</Typography></Box>
              ))}
            </Box>
            <Button size="small" color="inherit" variant="outlined" startIcon={p.name === "VISA_SANDBOX" ? <PowerOutlined /> : <SettingsOutlined />} sx={{ mt: 1.5 }} onClick={() => setConfig(p.name)}>Configuration</Button>
          </Panel>
        ))}
      </Box>
      <Typography variant="meta" color="text.secondary" component="p" sx={{ mt: 1.5 }}>Health is derived from persisted provider operations: unknown outcomes in the last 24 hours or operations waiting over 15 minutes mark a provider as degraded.{lastSync ? ` Last synced ${new Date(lastSync).toLocaleTimeString("en-GB")}.` : ""}</Typography>

      <Dialog open={!!config} onClose={() => setConfig(null)} fullWidth maxWidth="sm" aria-labelledby="cfg-title">
        <ModalLiveRegions />
        <DialogTitle id="cfg-title">{config ? providerLabel(config) : ""} configuration</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>Provider settings live in server environment variables. Credentials are never sent to or shown in the browser.</Alert>
          <Stack spacing={2}>
            <TextField size="small" label="Provider" value={config ?? ""} slotProps={{ input: { readOnly: true } }} />
            <TextField size="small" label="API origin" value="PAYFLOW_API_ORIGIN (server-side)" slotProps={{ input: { readOnly: true } }} />
            <TextField size="small" label="API key" value="PAYFLOW_DEMO_API_KEY (server-side, hidden)" slotProps={{ input: { readOnly: true } }} />
            {config === "VISA_SANDBOX" && <TextField size="small" label="Visa sandbox credentials" value="PAYFLOW_VISA_* (backend only, hidden)" slotProps={{ input: { readOnly: true } }} />}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setConfig(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
