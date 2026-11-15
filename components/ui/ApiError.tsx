"use client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useData } from "../../lib/data";

/** Shown on every page when the API can't be reached; data already on screen is kept. */
export function ApiError() {
  const { error, refresh } = useData();
  if (!error) return null;
  return <Alert severity="error" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" onClick={() => void refresh()}>Retry</Button>}>{error}</Alert>;
}
