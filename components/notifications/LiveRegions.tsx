"use client";
import Box from "@mui/material/Box";
import { useEffect } from "react";
import { useNotification } from "../../hooks/useNotification";
import type { Announcement } from "../../lib/notifications/notification-types";

const visuallyHidden = { position: "absolute", width: 1, height: 1, p: 0, m: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

/** Persistent live regions: present before content changes so announcements are reliable and spoken exactly once. */
export function LiveRegions({ announce }: { announce: Announcement | null }) {
  return (
    <Box sx={visuallyHidden}>
      <div role="status" aria-live="polite" aria-atomic="true" data-testid="live-polite">{announce?.polite && <span key={announce.id}>{announce.text}</span>}</div>
      <div role="alert" aria-live="assertive" aria-atomic="true" data-testid="live-assertive">{announce && !announce.polite && <span key={announce.id}>{announce.text}</span>}</div>
    </Box>
  );
}

/**
 * MUI sets aria-hidden on every body sibling while a Dialog or Drawer is open, which silences the provider's regions.
 * Render this inside each modal: it registers the modal (so the body copy goes quiet) and announces from within it.
 */
export function ModalLiveRegions() {
  const { announcement, registerModal } = useNotification();
  useEffect(registerModal, [registerModal]);
  return <LiveRegions announce={announcement} />;
}
