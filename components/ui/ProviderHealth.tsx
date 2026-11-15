import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { providerLabel } from "../../lib/analytics";
import { formatDate } from "../../lib/api";
import { providerHealthLabel, providerHealthTone } from "../../lib/summary";
import type { ProviderStat } from "../../lib/types";
import { EmptyState } from "./EmptyState";
import { StatusIndicator } from "./StatusIndicator";

/** Provider health from the backend: derived from persisted provider operations, not from whether the page loaded. */
export function ProviderHealth({ providers }: { providers: ProviderStat[] }) {
  if (providers.length === 0) return <EmptyState title="No provider data" body="Provider health appears once the API responds." />;
  return (
    <Box component="ul" aria-label="Payment providers" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1.5 }}>
      {providers.map((p) => {
        const decided = p.successful + p.declined;
        const rate = decided ? (p.successful / decided) * 100 : 0;
        return (
          <Box component="li" key={p.name} sx={{ display: "grid", gap: 0.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography variant="h4" component="span" noWrap>{providerLabel(p.name)}</Typography>
              <StatusIndicator tone={providerHealthTone(p.health)} label={providerHealthLabel(p.health)} />
            </Box>
            {decided > 0 && <LinearProgress variant="determinate" value={rate} aria-label={`${providerLabel(p.name)} authorization success rate`} color={rate >= 90 ? "success" : rate >= 70 ? "warning" : "error"} sx={{ height: 4, borderRadius: 2, bgcolor: "action.hover" }} />}
            <Typography variant="meta" color="text.secondary">{p.healthDetail}</Typography>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="meta" color="text.secondary">{decided ? `${rate.toFixed(1)}% auth success · ` : ""}{p.total.toLocaleString("en-GB")} txns</Typography>
              <Typography variant="meta" color="text.secondary">{p.lastUsed ? `Last used ${formatDate(p.lastUsed)}` : "Not used yet"}</Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
