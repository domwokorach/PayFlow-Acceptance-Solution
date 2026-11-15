"use client";
import { useContext } from "react";
import { NotificationContext } from "../components/notifications/NotificationProvider";
import type { NotificationApi } from "../lib/notifications/notification-types";

/**
 * `notify.success("Payment captured", { description })` and the matching `error`, `warning` and `info`.
 * `notify({ type, title, ... })` takes the full form. Also exposes dismiss and the notification centre's history.
 */
export function useNotification(): NotificationApi {
  const api = useContext(NotificationContext);
  if (!api) throw new Error("useNotification must be used inside NotificationProvider");
  return api;
}
