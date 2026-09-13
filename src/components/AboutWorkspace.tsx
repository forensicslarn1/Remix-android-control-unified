import React from "react";
import { ShieldCheck, Terminal, Cpu, Usb, Github, FileText, CheckCircle2, Lock } from "lucide-react";

interface AboutWorkspaceProps {
  language: "en" | "ar" | "other";
}

export default function AboutWorkspace({ language }: AboutWorkspaceProps) {
  const isArabic = language === "ar";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <span className="kicker text-[#59869c]">
          {isArabic ? "حول المنصة" : "System Information"}
        </span>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#14253a] dark:text-[#f6f2ea]">
          Android Control Center (ACC)
        </h2>
        <p className="mt-1 text-xs text-[#526273] dark:text-[#9bb2ca] leading-relaxed">
          {isArabic
            ? "بيئة متقدمة لإدارة، وإلغاء تثبيت برامج الشركات (Debloat)، وفحص حزم APK، وعرض الشاشة عبر WebUSB مباشرة من متصفح الويب."
            : "Direct-browser hardware management workbench for Android devices using WebUSB, WebCodecs, and client-side cryptographic ledger architecture."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="service-card p-4 rounded-md space-y-2">
          <div className="flex items-center gap-2 text-[#527321]">
            <Lock size={16} />
            <h3 className="font-bold text-sm text-[#14253a] dark:text-[#f6f2ea]">
              {isArabic ? "أمان محلي 100% (Offline-First)" : "Client-Side Zero Trust"}
            </h3>
          </div>
          <p className="text-xs text-[#526273] dark:text-[#9bb2ca] leading-relaxed">
            {isArabic
              ? "لا يتم إرسال بيانات هاتفك أو قائمة تطبيقاتك إلى أي خادم خارجي. كافة أوامر ADB واتصالات USB تُنفذ محلياً داخل جلسة المتصفح."
              : "No telemetry, package inventories, or commands leave your browser. ADB keys and USB communication terminate directly inside the client sandbox."}
          </p>
        </div>

        <div className="service-card p-4 rounded-md space-y-2">
          <div className="flex items-center gap-2 text-[#59869c]">
            <Terminal size={16} />
            <h3 className="font-bold text-sm text-[#14253a] dark:text-[#f6f2ea]">
              {isArabic ? "سجل إيصالات غير متطاير" : "Field Service Command Ledger"}
            </h3>
          </div>
          <p className="text-xs text-[#526273] dark:text-[#9bb2ca] leading-relaxed">
            {isArabic
              ? "كل تعديل يتم إجراؤه ينتج عنه أمر استعادة مضاد قابل للمراجعة والتراجع لحماية أجهزة المستخدمين من التوقف المفاجئ."
              : "Every destructive or state-altering package action logs an immutable audit receipt with a deterministic recovery rollback command."}
          </p>
        </div>
      </div>

      <div className="service-card p-5 rounded-md space-y-3">
        <h3 className="font-bold text-sm text-[#14253a] dark:text-[#f6f2ea]">
          {isArabic ? "التقنيات والمكتبات المدمجة" : "Core Technologies & Standards"}
        </h3>
        <ul className="text-xs text-[#526273] dark:text-[#9bb2ca] space-y-2">
          <li className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#527321]" />
            <span><strong>@yume-chan/adb:</strong> WebUSB-based Android Debug Bridge protocol implementation in TypeScript.</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#527321]" />
            <span><strong>WebCodecs Scrcpy:</strong> Low-latency hardware H.264 video decoding rendered on HTML5 Canvas.</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#527321]" />
            <span><strong>UAD-ng Catalog:</strong> Universal Android Debloater community database integration.</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#527321]" />
            <span><strong>Web Crypto:</strong> SubtleCrypto PBKDF2 + AES-256-GCM encrypted ledger snapshots.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
