import Box from "@mui/material/Box";
import type { ReactNode } from "react";

/** Text for screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <Box component="span" sx={{ position: "absolute", width: 1, height: 1, p: 0, m: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>{children}</Box>;
}
