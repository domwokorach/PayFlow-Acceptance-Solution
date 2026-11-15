import Box from "@mui/material/Box";
import type { ReactNode } from "react";

/** Identifiers and code-like values (payment IDs, merchant IDs) in the theme's `code` variant. */
export function Mono({ children }: { children: ReactNode }) {
  return <Box component="span" sx={{ typography: "code" }}>{children}</Box>;
}
