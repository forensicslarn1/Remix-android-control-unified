import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface ShortcutGuideDialogProps {
  open: boolean;
  language: "en" | "ar" | "other";
  onOpenChange: (open: boolean) => void;
}

export function ShortcutGuideDialog({
  open,
  language,
  onOpenChange,
}: ShortcutGuideDialogProps) {
  const isArabic = language === "ar";

  const shortcuts = isArabic
    ? [
        { key: "Alt + 1…9", desc: "التنقل السريع بين أقسام لوحة التحكم (1-9)" },
        { key: "Alt + 0", desc: "الانتقال إلى القسم العاشر (الأدلة الرقمية)" },
        { key: "Ctrl + K / /", desc: "التركيز السريع على حقل البحث في التطبيقات" },
        { key: "Esc", desc: "إغلاق النوافذ المنبثقة واللوحات الفرعية" },
        { key: "Space", desc: "إيقاف / استئناف بث السجلات (Logcat)" },
      ]
    : [
        { key: "Alt + 1…9", desc: "Quick jump between workstations 01 through 09" },
        { key: "Alt + 0", desc: "Jump to workstation 10 (Evidence Snapshot)" },
        { key: "Ctrl + K / /", desc: "Quickly focus package search filter input" },
        { key: "Esc", desc: "Dismiss active modal, review drawer, or popover" },
        { key: "Space", desc: "Toggle pause / resume in active Logcat stream" },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] border border-[#dcd5c9] dark:border-[#263c52] bg-[#fdfbf7] dark:bg-[#14253a] p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Keyboard size={16} className="text-[#59869c]" />
            <span className="kicker text-[#59869c]">
              {isArabic ? "اختصارات لوحة المفاتيح" : "Keyboard Shortcuts"}
            </span>
          </div>
          <DialogTitle className="text-lg font-bold text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "دليل الاختصارات السريعة" : "Desk Navigation Shortcuts"}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#526273] dark:text-[#9bb2ca]">
            {isArabic
              ? "تحكم أسرع بلوحة الإدارة دون رفع يديك عن لوحة المفاتيح."
              : "Operate the workstation efficiently without leaving the keyboard."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-2.5">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded border border-[#e5dfd3] dark:border-[#223952] bg-[#f3efe6]/40 dark:bg-[#182a3c] px-3 py-2 text-xs"
            >
              <span className="text-[#526273] dark:text-[#9bb2ca]">{s.desc}</span>
              <kbd className="mono rounded bg-[#e8e2d5] dark:bg-[#223952] px-2 py-0.5 text-[0.7rem] font-semibold text-[#14253a] dark:text-[#f6f2ea]">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
