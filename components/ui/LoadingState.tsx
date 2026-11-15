import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

/** Skeleton rows that match compact table row height, announced politely to screen readers. */
export function LoadingState({ rows = 5, height = 32 }: { rows?: number; height?: number }) {
  return (
    <Box role="status" aria-live="polite" aria-label="Loading" sx={{ display: "grid", gap: 0.75, p: 2 }}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} variant="rounded" height={height} />)}
    </Box>
  );
}
