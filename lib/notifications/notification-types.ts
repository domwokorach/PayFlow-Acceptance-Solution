export type NotificationType = "success" | "error" | "warning" | "info";
export type NotificationCategory = "payment" | "merchant" | "provider" | "dashboard" | "account" | "system";

export interface NotificationAction { label: string; onClick: () => void }

export interface NotifyOptions {
  description?: string;
  /** Milliseconds before auto-dismiss; `null` keeps it until dismissed. Defaults by type (4s, 4s, 6s, 8s). */
  duration?: number | null;
  /** Notifications with the same key are collapsed. Defaults to type + title + description. */
  dedupeKey?: string;
  action?: NotificationAction;
  category?: NotificationCategory;
  /** Record in the notification centre without showing a popup. */
  silent?: boolean;
}
export interface NotifyInput extends NotifyOptions { type: NotificationType; title: string }

export interface QueuedNotification extends NotifyInput { id: number; key: string }

/** One entry in the notification centre. Held in this browser tab's memory only; it is not stored on the server. */
export interface NotificationRecord {
  id: number; type: NotificationType; category: NotificationCategory; title: string; description?: string;
  createdAt: number; read: boolean; action?: NotificationAction;
}

type Shorthand = (title: string, options?: NotifyOptions) => number;
export interface NotifyFn {
  (input: NotifyInput): number;
  success: Shorthand; error: Shorthand; warning: Shorthand; info: Shorthand;
}

export interface NotificationApi {
  notify: NotifyFn;
  dismiss: (id?: number) => void;
  dismissAll: () => void;
  history: readonly NotificationRecord[];
  unreadCount: number;
  markRead: (id: number) => void;
  markAllRead: () => void;
  clearHistory: () => void;
}
