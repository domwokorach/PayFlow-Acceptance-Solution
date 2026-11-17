"use client";
import Box from "@mui/material/Box";
import Snackbar, { type SnackbarCloseReason } from "@mui/material/Snackbar";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import type { Announcement, NotificationApi, NotificationRecord, NotifyFn, NotifyInput, NotifyOptions, QueuedNotification } from "../../lib/notifications/notification-types";
import { durationOf, ENTER_MS, EXIT_MS, NotificationQueue } from "../../lib/notifications/notification-utils";
import { LiveRegions } from "./LiveRegions";
import { NotificationToast, TopTransition } from "./NotificationToast";

export type { NotifyInput } from "../../lib/notifications/notification-types";
export const NotificationContext = createContext<NotificationApi | null>(null);

const HISTORY_LIMIT = 50;

/** Centralised popups and the notification centre's history. Everything here lives in this tab's memory. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new NotificationQueue()); // one mutable queue for the provider's lifetime
  const [current, setCurrent] = useState<QueuedNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState<Announcement | null>(null);
  const [modals, setModals] = useState(0);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  const sync = useCallback(() => { const s = queue.snapshot(); setCurrent(s.current); setOpen(s.open); }, [queue]);
  const announceItem = useCallback((item: QueuedNotification) => {
    const assertive = item.type === "error" || item.type === "warning";
    setAnnounce({ id: item.id, polite: !assertive, text: item.description ? `${item.title}. ${item.description}` : item.title });
  }, []);

  const notifyInput = useCallback((input: NotifyInput) => {
    const q = queue;
    const record = (id: number) => setHistory((h) => [{ id, type: input.type, category: input.category ?? "system", title: input.title, description: input.description, createdAt: Date.now(), read: false, action: input.action }, ...h].slice(0, HISTORY_LIMIT));
    if (input.silent) { const id = q.allocId(); record(id); return id; }
    const r = q.offer(input);
    if (r.status === "duplicate") return -1;
    record(r.item.id);
    if (r.status === "shown") { sync(); announceItem(r.item); }
    return r.item.id;
  }, [queue, sync, announceItem]);

  const notify = useMemo<NotifyFn>(() => {
    const make = (type: NotifyInput["type"]) => (title: string, options?: NotifyOptions) => notifyInput({ ...options, type, title });
    return Object.assign((input: NotifyInput) => notifyInput(input), { success: make("success"), error: make("error"), warning: make("warning"), info: make("info") });
  }, [notifyInput]);

  const close = useCallback((id: number) => { if (queue.close(id)) sync(); }, [queue, sync]);
  const dismiss = useCallback((id?: number) => { const target = id ?? queue.currentId(); if (target !== undefined) close(target); }, [queue, close]);
  const dismissAll = useCallback(() => { queue.clearPending(); dismiss(); }, [queue, dismiss]);

  const onExited = useCallback(() => {
    const next = queue.advance();
    sync();
    if (next) announceItem(next); else setAnnounce(null);
  }, [queue, sync, announceItem]);

  useEffect(() => () => queue.reset(), [queue]);

  const markRead = useCallback((id: number) => setHistory((h) => h.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAllRead = useCallback(() => setHistory((h) => h.map((n) => (n.read ? n : { ...n, read: true }))), []);
  const clearHistory = useCallback(() => setHistory([]), []);
  const unreadCount = useMemo(() => history.reduce((n, r) => n + (r.read ? 0 : 1), 0), [history]);

  const registerModal = useCallback(() => { setModals((n) => n + 1); return () => setModals((n) => n - 1); }, []);

  const api = useMemo<NotificationApi>(() => ({ notify, announcement: announce, registerModal, dismiss, dismissAll, history, unreadCount, markRead, markAllRead, clearHistory }),
    [notify, announce, registerModal, dismiss, dismissAll, history, unreadCount, markRead, markAllRead, clearHistory]);

  const onClose = (_: Event | SyntheticEvent | null, reason: SnackbarCloseReason) => {
    // Clickaway would dismiss financial messages by accident; document-wide Escape is handled on the toast itself.
    if (reason === "clickaway" || reason === "escapeKeyDown") return;
    if (current) close(current.id);
  };
  const timeout = reduced ? 0 : { enter: ENTER_MS, exit: EXIT_MS };

  return (
    <NotificationContext.Provider value={api}>
      {children}
      {/* Modals aria-hide this copy, so they mount their own (ModalLiveRegions); stay silent while one is open to avoid double speech. */}
      <LiveRegions announce={modals === 0 ? announce : null} />
      {current && (
        <Snackbar
          key={current.id}
          open={open}
          autoHideDuration={durationOf(current)}
          onClose={onClose}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
          slots={{ transition: TopTransition }}
          transitionDuration={timeout}
          slotProps={{ transition: { onExited } }}
          sx={(t) => ({
            // Above the AppBar (1100), drawers and dialogs (1300); position:fixed so page content never shifts.
            zIndex: t.zIndex.snackbar + 100, left: "50%", right: "auto", transform: "translateX(-50%)",
            width: "calc(100% - 24px)", maxWidth: 460, pointerEvents: "none", "& > *": { pointerEvents: "auto" },
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            // Tablet sits below the 48px app header; desktop floats 20px from the top.
            [t.breakpoints.between("sm", "md")]: { top: "calc(env(safe-area-inset-top, 0px) + 60px)", width: "calc(100% - 48px)" },
            [t.breakpoints.up("md")]: { top: "calc(env(safe-area-inset-top, 0px) + 20px)" },
            "@media (max-width:599.95px)": { maxWidth: "none", left: "calc(env(safe-area-inset-left, 0px) + 12px)", right: "calc(env(safe-area-inset-right, 0px) + 12px)", width: "auto", transform: "none" },
          })}
        >
          <Box sx={{ width: "100%" }}><NotificationToast type={current.type} title={current.title} description={current.description} action={modals === 0 ? current.action : undefined} onClose={() => close(current.id)} /></Box>
        </Snackbar>
      )}
    </NotificationContext.Provider>
  );
}

