import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Usb, ShieldCheck, Cpu, Smartphone, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface FirstRunSetupDialogProps {
  open: boolean;
  language: "en" | "ar" | "other";
  usbSupported: boolean;
  cryptoSupported: boolean;
  connecting: boolean;
  onOpenChange: (open: boolean) => void;
  onStartAuthorization: () => void;
  onDefer: () => void;
}

export function FirstRunSetupDialog({
  open,
  language,
  usbSupported,
  cryptoSupported,
  connecting,
  onOpenChange,
  onStartAuthorization,
  onDefer,
}: FirstRunSetupDialogProps) {
  const isArabic = language === "ar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] border border-[#dcd5c9] dark:border-[#263c52] bg-[#fdfbf7] dark:bg-[#14253a] p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="kicker text-[#59869c]">
              {isArabic ? "الإعداد لأول مرة" : "First-Run Workstation Setup"}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "تهيئة بيئة Android Control Center" : "Initialize Android Control Center"}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#526273] dark:text-[#9bb2ca] leading-relaxed mt-1">
            {isArabic
              ? "منصة فحص وإدارة أجهزة Android مباشرة من المتصفح عبر WebUSB وWebCodecs دون تثبيت برامج طرف ثالث."
              : "Direct-browser Android diagnostics, debloating, and screen mirroring via WebUSB and WebCodecs without third-party desktop tools."}
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-[#e5dfd3] dark:border-[#223952] bg-[#f3efe6]/40 dark:bg-[#192c3f] p-3 text-xs">
            <div className={`p-1.5 rounded ${usbSupported ? "bg-[#eef8cd] text-[#527321]" : "bg-[#fbe5df] text-[#c95a4b]"}`}>
              <Usb size={16} />
            </div>
            <div>
              <p className="font-semibold text-[#14253a] dark:text-[#f6f2ea]">
                {isArabic ? "واجهة WebUSB" : "WebUSB Hardware Interface"}
              </p>
              <p className="text-[#526273] dark:text-[#9bb2ca] mt-0.5">
                {usbSupported
                  ? (isArabic ? "مدعومة في هذا المتصفح. يمكنك اختيار وتوصيل الجهاز." : "Supported in this browser. Ready for direct device pairing.")
                  : (isArabic ? "غير مدعومة. يرجى استخدام متصفح قائم على Chromium مثل Chrome أو Edge." : "Not supported. Please use a Chromium-based browser (Chrome, Edge, Brave).")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-[#e5dfd3] dark:border-[#223952] bg-[#f3efe6]/40 dark:bg-[#192c3f] p-3 text-xs">
            <div className={`p-1.5 rounded ${cryptoSupported ? "bg-[#eef8cd] text-[#527321]" : "bg-[#fbe5df] text-[#c95a4b]"}`}>
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="font-semibold text-[#14253a] dark:text-[#f6f2ea]">
                {isArabic ? "مكتبة Web Crypto ومفاتيح ADB" : "Web Crypto & Local RSA Keys"}
              </p>
              <p className="text-[#526273] dark:text-[#9bb2ca] mt-0.5">
                {cryptoSupported
                  ? (isArabic ? "تنشئ مفاتيح تشفير محلية 2048-bit في المتصفح لتفويض ADB." : "Generates ephemeral 2048-bit RSA auth pairs locally in browser.")
                  : (isArabic ? "تشفير غير متوفر في هذا السياق." : "SubtleCrypto unavailable in current browser context.")}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-[#dcd5c9] dark:border-[#263c52] bg-[#f8f5ee] dark:bg-[#162738] p-3 text-[0.72rem] text-[#526273] dark:text-[#9bb2ca] space-y-1.5">
            <p className="font-semibold text-[#14253a] dark:text-[#f6f2ea]">
              {isArabic ? "خطوات تجهيز الهاتف:" : "Quick phone preparation:"}
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>{isArabic ? "فعّل خيارات المطور (Developer Options) بالضغط 7 مرات على رقم الإصدار (Build Number)." : "Enable Developer Options by tapping Build Number 7 times."}</li>
              <li>{isArabic ? "فعّل تصحيح أخطاء USB (USB Debugging)." : "Enable USB Debugging in Developer Options."}</li>
              <li>{isArabic ? "صل كابل USB واختر 'دائماً اسمح من هذا الحاسوب' عند ظهور نافذة التفويض." : "Connect via USB and check 'Always allow from this computer'."}</li>
            </ol>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={onDefer} className="text-xs">
            {isArabic ? "تخطي الآن" : "Explore desk first"}
          </Button>
          <Button
            onClick={onStartAuthorization}
            disabled={!usbSupported || connecting}
            className="bg-[#c8f04a] text-[#14253a] hover:bg-[#b8e23b] font-semibold text-xs h-9 px-4"
          >
            {connecting ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                {isArabic ? "جاري الاتصال..." : "Connecting..."}
              </>
            ) : (
              <>
                <Usb size={14} className="mr-2" />
                {isArabic ? "بدء اقتران جهاز USB" : "Connect USB Device"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
