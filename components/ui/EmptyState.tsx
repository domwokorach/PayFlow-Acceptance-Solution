import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: "center", py: 4, px: 2, color: "text.secondary", display: "grid", placeItems: "center", height: "100%" }}>
      <Box>
        {icon ? <Box aria-hidden sx={{ mb: 1, "& svg": { fontSize: 28, opacity: 0.6 } }}>{icon}</Box> : null}
        <Typography variant="subtitle2" color="text.primary">{title}</Typography>
        {body ? <Typography variant="body2" sx={{ mt: 0.5, maxWidth: "44ch", mx: "auto" }}>{body}</Typography> : null}
        {action ? <Box sx={{ mt: 1.5 }}>{action}</Box> : null}
      </Box>
    </Box>
  );
}
