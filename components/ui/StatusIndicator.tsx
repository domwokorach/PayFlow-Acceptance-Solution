import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export type IndicatorTone = "success" | "warning" | "error" | "neutral";

/** Dot + text status. The dot is decorative; the text is what assistive tech reads. */
export function StatusIndicator({ tone, label }: { tone: IndicatorTone; label: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box aria-hidden component="span" sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: tone === "neutral" ? "text.disabled" : `${tone}.main`, transition: "background-color 200ms" }} />
      <Typography variant="label" component="span" sx={{ color: tone === "neutral" ? "text.secondary" : `${tone}.text` }}>{label}</Typography>
    </Box>
  );
}
