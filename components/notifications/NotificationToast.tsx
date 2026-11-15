"use client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slide from "@mui/material/Slide";
import Typography from "@mui/material/Typography";
import type { TransitionProps } from "@mui/material/transitions";
import { Info, TriangleAlert } from "lucide-react";
import { forwardRef, useEffect, useRef, type KeyboardEvent, type ReactElement } from "react";
import { ENTER_MS, EXIT_MS } from "../../lib/notifications/notification-utils";
import type { NotificationAction, NotificationType } from "../../lib/notifications/notification-types";
import { BadgeAlertIcon, type BadgeAlertIconHandle } from "./icons/badge-alert";
import { CircleCheckIcon, type CircleCheckIconHandle } from "./icons/circle-check";
import { XIcon } from "./icons/x";

export { ENTER_MS, EXIT_MS };
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/** Static Lucide icons get a soft one-shot pop. Disabled under reduced motion. */
const popIn = {
  "@media (prefers-reduced-motion: no-preference)": {
    animation: "pf-icon-pop 360ms cubic-bezier(0, 0, 0.2, 1) both",
    "@keyframes pf-icon-pop": { from: { opacity: 0, transform: "scale(0.7)" }, to: { opacity: 1, transform: "scale(1)" } },
  },
} as const;

/** Lucide Animated icons (success tick, error badge) play once on mount; warning and info have no animated version, so they use static Lucide. */
function StatusIcon({ type }: { type: NotificationType }) {
  const ref = useRef<CircleCheckIconHandle & BadgeAlertIconHandle>(null);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (reduced) return;
    // Wait for the slide/fade-in to finish so the icon motion is actually seen.
    const t = setTimeout(() => ref.current?.startAnimation(), ENTER_MS - 40);
    return () => clearTimeout(t);
  }, [reduced]);
  if (type === "success") return <CircleCheckIcon ref={ref} startHidden={!reduced} size={20} aria-hidden style={{ display: "flex" }} />;
  if (type === "error") return <BadgeAlertIcon ref={ref} size={20} aria-hidden style={{ display: "flex" }} />;
  const Icon = type === "warning" ? TriangleAlert : Info;
  return <Box component="span" aria-hidden sx={{ display: "inline-flex", ...popIn }}><Icon size={20} strokeWidth={2} /></Box>;
}

/** Slides down from above the viewport while fading in, and slides back up while fading out. Respects reduced motion via a zero timeout. */
export const TopTransition = forwardRef<unknown, TransitionProps & { children: ReactElement }>(function TopTransition({ children, in: open, timeout, ...rest }, ref) {
  const reduced = timeout === 0;
  return (
    <Slide ref={ref} {...rest} in={open} direction="down" timeout={timeout} easing={{ enter: EASE_OUT, exit: EASE_IN }}>
      <Box sx={{ opacity: open ? 1 : 0, transition: reduced ? "none" : `opacity ${open ? ENTER_MS : EXIT_MS}ms ${open ? EASE_OUT : EASE_IN}` }}>{children}</Box>
    </Slide>
  );
});

export function NotificationToast({ type, title, description, action, onClose }: {
  type: NotificationType; title: string; description?: string; action?: NotificationAction; onClose: () => void;
}) {
  // Escape is handled on the toast itself (not document-wide) so it never competes with an open dialog's own Escape handling.
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
  return (
    <Alert
      // No live-region role here: announcements come from the provider's persistent live regions, so screen readers hear each message once.
      role="group" aria-label={`${type} notification`} severity={type} variant="standard" onKeyDown={onKeyDown}
      icon={<StatusIcon type={type} />}
      action={<IconButton size="small" color="inherit" aria-label="Dismiss notification" onClick={onClose} sx={{ color: "text.secondary", mt: -0.25 }}><XIcon size={16} aria-hidden style={{ display: "flex" }} /></IconButton>}
      sx={(t) => ({
        width: "100%", alignItems: "flex-start", gap: 0.5, py: 1.25, pl: 1.75, pr: 1,
        bgcolor: "background.paper", color: "text.primary", border: 1, borderColor: "divider", borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)",
        ...t.applyStyles("dark", { boxShadow: "0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)" }),
        "& .MuiAlert-icon": { color: `${type}.text`, p: 0, mr: 1.25, mt: "2px", opacity: 1 },
        "& .MuiAlert-message": { p: 0, flex: 1, minWidth: 0 },
        "& .MuiAlert-action": { p: 0, ml: 0.5, mr: 0, alignItems: "flex-start" },
      })}
    >
      <Typography variant="subtitle2" component="p" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{title}</Typography>
      {description && <Typography variant="body2" component="p" color="text.secondary" sx={{ mt: 0.25, overflowWrap: "anywhere" }}>{description}</Typography>}
      {action && <Button size="small" variant="text" color="primary" onClick={() => { action.onClick(); onClose(); }} sx={{ mt: 0.5, ml: -0.75, minHeight: 28 }}>{action.label}</Button>}
    </Alert>
  );
}
