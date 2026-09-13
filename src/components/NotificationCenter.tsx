import React, { useState } from "react";
import { Bell, Check, Trash2, X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { type AppNotification, type NotificationTone, loadStoredNotifications, saveStoredNotifications } from "@/lib/notificationUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export const loadLocalNotifications = loadStoredNotifications;

interface NotificationCenterProps {
  language: "en" | "ar" | "other";
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
}

export function NotificationCenter({ language, notifications, setNotifications }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const isArabic = language === "ar";
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveStoredNotifications(updated);
      return updated;
    });
  };

  const clearAll = () => {
    setNotifications([]);
    saveStoredNotifications([]);
  };

  const removeOne = (id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      saveStoredNotifications(updated);
      return updated;
    });
  };

  const getToneIcon = (tone: NotificationTone) => {
    switch (tone) {
      case "success":
        return <CheckCircle2 size={16} className="text-[#527321] shrink-0" />;
      case "error":
        return <AlertCircle size={16} className="text-[#c95a4b] shrink-0" />;
      case "warning":
        return <AlertTriangle size={16} className="text-[#b37416] shrink-0" />;
      case "info":
      default:
        return <Info size={16} className="text-[#59869c] shrink-0" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="action-button relative flex items-center justify-center rounded-md border border-[#3d566e] bg-[#14253a] p-2 text-[#cad3dc] hover:border-[#c8f04a] hover:text-white"
          aria-label={isArabic ? "الإشعارات" : "Notifications"}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c8f04a] px-1 text-[0.625rem] font-bold text-[#14253a]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={isArabic ? "start" : "end"}
        className="w-80 sm:w-96 p-0 border border-[#dcd5c9] dark:border-[#263c52] bg-[#fdfbf7] dark:bg-[#14253a] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#e5dfd3] dark:border-[#223952] p-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{isArabic ? "مركز الإشعارات" : "Notification Center"}</span>
            {unreadCount > 0 && (
              <span className="status-stamp text-[0.65rem] border-[#c8f04a] text-[#527321] dark:text-[#c8f04a]">
                {unreadCount} {isArabic ? "جديد" : "new"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-[#526273] dark:text-[#cad3dc]"
                onClick={markAllAsRead}
              >
                <Check size={13} className="mr-1" />
                {isArabic ? "تحديد كمقروء" : "Read all"}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-[#934639] hover:bg-[#fbe5df]"
                onClick={clearAll}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-[#e5dfd3] dark:divide-[#223952]">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#687584]">
              {isArabic ? "لا توجد إشعارات حالياً." : "No notifications recorded yet."}
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 flex items-start gap-2.5 transition-colors ${
                  !n.read ? "bg-[#f3efe6]/50 dark:bg-[#1a2f44]" : "hover:bg-[#f8f5ee] dark:hover:bg-[#182a3c]"
                }`}
              >
                {getToneIcon(n.tone)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold truncate text-[#14253a] dark:text-[#f6f2ea]">
                      {isArabic ? n.title.ar : n.title.en}
                    </p>
                    <span className="text-[0.625rem] text-[#687584] mono shrink-0">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#526273] dark:text-[#9bb2ca] break-words">
                    {isArabic ? n.body.ar : n.body.en}
                  </p>
                </div>
                <button
                  onClick={() => removeOne(n.id)}
                  className="text-[#8e9ca8] hover:text-[#c95a4b] p-0.5"
                  aria-label="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
