import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import { statusLabels } from "../../lib/analytics";
import type { Status } from "../../lib/types";

type Tone = "primary" | "success" | "error" | "warning" | "secondary";
const tone: Record<Status, Tone> = {
  PENDING_AUTHORIZATION: "primary", AUTHORIZED: "primary", CAPTURE_PENDING: "warning", REFUND_PENDING: "warning", REVIEW_REQUIRED: "error",
  CAPTURED: "success", DECLINED: "error", PARTIALLY_REFUNDED: "warning", REFUNDED: "secondary",
};

/** Payment status chip. The label carries the meaning; colour is reinforcement. Uses AA-contrast `text` colours on a tinted fill. */
export function StatusChip({ status, size = "small" }: { status: Status; size?: "small" | "medium" }) {
  const t = tone[status];
  return (
    <Chip size={size} label={statusLabels[status]}
      sx={(th) => ({ color: th.vars!.palette[t].text, bgcolor: alpha(th.palette[t].main, 0.12), ...(size === "medium" && { height: 24, fontSize: "0.75rem" }) })} />
  );
}
