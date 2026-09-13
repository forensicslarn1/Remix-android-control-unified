/**
 * Notification data structures and helpers.
 */

export type NotificationTone = "success" | "error" | "warning" | "info";

export interface AppNotification {
  id: string;
  tone: NotificationTone;
  title: { en: string; ar: string };
  body: { en: string; ar: string };
  createdAt: string;
  read: boolean;
}

export const NOTIFICATIONS_STORAGE_KEY = "acc-notifications-v1";

export function loadStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredNotifications(notifications: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications.slice(0, 100)));
  } catch {
    // Ignore quota errors
  }
}
