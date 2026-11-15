"use client";
import CheckRounded from "@mui/icons-material/CheckRounded";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useNotification } from "../../hooks/useNotification";
import { formatDate, formatMoney } from "../../lib/api";
import { useData } from "../../lib/data";
import type { NotificationType } from "../../lib/notifications/notification-types";
import { timeAgo } from "../../lib/notifications/notification-utils";

const ICON = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info } as const satisfies Record<NotificationType, unknown>;

/**
 * The header bell. "Recent notifications" is this tab's in-memory history (cleared on reload). "Needs attention" is read
 * from payment statuses that PayFlow stores, so it survives reloads.
 */
export function NotificationCenter() {
  const { history, unreadCount, markRead, markAllRead, clearHistory } = useNotification();
  const { payments, select } = useData();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const headingId = useId();
  const open = !!anchor;
  const attention = useMemo(() => payments.filter((p) => p.status === "DECLINED" || p.status === "AUTHORIZED" || p.status === "REVIEW_REQUIRED").slice(0, 5), [payments]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 30_000); // keep "2m ago" honest while the panel stays open
    return () => clearInterval(t);
  }, [open]);

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={(e) => { setNow(Date.now()); setAnchor(e.currentTarget); }}>
          <Badge color="error" badgeContent={unreadCount} max={9} sx={{ "& .MuiBadge-badge": { fontSize: "0.625rem", height: 16, minWidth: 16 } }}><NotificationsNoneOutlined fontSize="small" /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { role: "dialog", "aria-labelledby": headingId, sx: { width: 380, maxWidth: "calc(100vw - 24px)", maxHeight: "min(560px, calc(100dvh - 72px))", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "12px", border: 1, borderColor: "divider" } } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25 }}>
          <Typography id={headingId} variant="h3" component="h2" sx={{ flex: 1 }}>Notifications{unreadCount > 0 ? <Typography component="span" variant="meta" color="text.secondary"> · {unreadCount} unread</Typography> : null}</Typography>
          <Button size="small" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</Button>
          <Button size="small" color="inherit" onClick={clearHistory} disabled={history.length === 0}>Clear</Button>
        </Box>
        <Divider />
        <Box sx={{ overflowY: "auto", flex: 1 }}>
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2.5 }}>No notifications yet. Results of payments, refunds and updates appear here.</Typography>
          ) : (
            <Box component="ul" aria-label="Recent notifications" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {history.map((n) => {
                const Icon = ICON[n.type];
                const activate = () => { markRead(n.id); if (n.action) { n.action.onClick(); setAnchor(null); } };
                return (
                  <Box component="li" key={n.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: "divider", bgcolor: n.read ? "transparent" : "action.hover" }}>
                    <Box aria-hidden sx={{ color: `${n.type}.text`, mt: "3px", display: "flex" }}><Icon size={16} /></Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" component="p" sx={{ fontWeight: n.read ? 400 : 600 }}>
                        {!n.read && <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Unread. </Box>}{n.title}
                      </Typography>
                      {n.description && <Typography variant="body2" color="text.secondary" component="p" sx={{ overflowWrap: "anywhere" }}>{n.description}</Typography>}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
                        <Typography variant="meta" color="text.secondary" component="time" dateTime={new Date(n.createdAt).toISOString()}>{timeAgo(n.createdAt, now)}</Typography>
                        {n.action && <Button size="small" variant="text" onClick={activate} sx={{ minHeight: 24, py: 0 }}>{n.action.label}</Button>}
                      </Box>
                    </Box>
                    {!n.read && <Tooltip title="Mark as read"><IconButton size="small" aria-label={`Mark "${n.title}" as read`} onClick={() => markRead(n.id)}><CheckRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
                  </Box>
                );
              })}
            </Box>
          )}
          {attention.length > 0 && (
            <Box component="section" aria-label="Needs attention">
              <Typography variant="label" component="h3" color="text.secondary" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>Needs attention</Typography>
              <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                {attention.map((p) => (
                  <li key={p.id}>
                    <Box component="button" type="button" onClick={() => { setAnchor(null); select(p.id); }} sx={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", px: 2, py: 0.75, minHeight: 44, "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: 2, outlineOffset: -2, outlineColor: "primary.main" } }}>
                      <Typography variant="body2" component="span" sx={{ display: "block" }}>{p.status === "DECLINED" ? "Declined" : p.status === "REVIEW_REQUIRED" ? "Needs review" : "Awaiting capture"} · {formatMoney(p.amountMinor, p.currency)}</Typography>
                      <Typography variant="meta" color="text.secondary" component="span">{formatDate(p.createdAt)}</Typography>
                    </Box>
                  </li>
                ))}
              </Box>
            </Box>
          )}
        </Box>
        <Divider />
        <Typography variant="meta" color="text.secondary" component="p" sx={{ px: 2, py: 1 }}>Notifications are kept in this browser tab only and clear when you reload. Payment statuses are stored by PayFlow.</Typography>
      </Popover>
    </>
  );
}
