"use client";
import Box from "@mui/material/Box";
import { useCountUp } from "../../hooks/useCountUp";

const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** A formatted number that counts up. Screen readers get only the final value, never the intermediate ticks. */
export function AnimatedValue({ value, duration }: { value: string; duration?: number }) {
  const shown = useCountUp(value, duration);
  return (
    <>
      <Box component="span" aria-hidden sx={{ fontVariantNumeric: "tabular-nums" }}>{shown}</Box>
      <Box component="span" sx={srOnly}>{value}</Box>
    </>
  );
}
