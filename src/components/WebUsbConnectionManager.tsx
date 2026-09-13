import { Button } from "@/components/ui/button";
import type { DeviceProfile } from "@/lib/adbClient";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Terminal,
  Unplug,
  Usb,
  XCircle,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export interface WebUsbConnectionManagerProps {
  device: DeviceProfile | null;
  connecting: boolean;
  root?: boolean;
  packageCount?: number;
  language?: "en" | "ar" | "other";
  onConnect: () => Promise<void> | void;
  onDisconnect?: () => Promise<void> | void;
  onRefreshProps?: () => Promise<void> | void;
  className?: string;
  showTroubleshooting?: boolean;
}

interface PairedUsbDevice {
  productName?: string;
  manufacturerName?: string;
  vendorId: number;
  productId: number;
  serialNumber?: string;
}

export function WebUsbConnectionManager({
  device,
  connecting,
  root = false,
  packageCount,
  language = "en",
  onConnect,
  onDisconnect,
  onRefreshProps,
  className = "",
  showTroubleshooting = true,
}: WebUsbConnectionManagerProps) {
  const isArabic = language === "ar";
  const isConnected = Boolean(device);
  const [copiedSerial, setCopiedSerial] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<PairedUsbDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectedSince, setConnectedSince] = useState<Date | null>(null);
  const [usbEventLog, setUsbEventLog] = useState<string | null>(null);

  // Track session timer when device is connected
  useEffect(() => {
    if (isConnected) {
      setConnectedSince(new Date());
    } else {
      setConnectedSince(null);
    }
  }, [isConnected]);

  // Capability checks
  const capabilities = useMemo(() => {
    const hasUsb = typeof navigator !== "undefined" && "usb" in navigator;
    const isSecure = typeof window !== "undefined" && window.isSecureContext;
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isChromium = /Chrome|Chromium|Edg|OPR|Brave/i.test(userAgent) && !/Firefox|FxiOS|Safari(?!\s*Mobile)/i.test(userAgent);

    return {
      hasUsb,
      isSecure,
      isChromium,
    };
  }, []);

  // Query already-paired WebUSB devices if supported
  const loadPairedDevices = async () => {
    if (typeof navigator !== "undefined" && "usb" in navigator) {
      try {
        const list = await (navigator as any).usb.getDevices();
        setPairedDevices(
          list.map((d: any) => ({
            productName: d.productName || "Android Device",
            manufacturerName: d.manufacturerName || "USB Device",
            vendorId: d.vendorId,
            productId: d.productId,
            serialNumber: d.serialNumber,
          }))
        );
      } catch {
        // Ignore failure to query paired devices
      }
    }
  };

  useEffect(() => {
    loadPairedDevices();

    // Listen to physical USB connect and disconnect events
    if (typeof navigator !== "undefined" && "usb" in navigator) {
      const handleUsbConnect = (event: any) => {
        const name = event.device?.productName || event.device?.manufacturerName || "USB Device";
        const msg = isArabic
          ? `تم رصد جهاز USB جديد متصل: ${name}`
          : `Physical USB device detected: ${name}`;
        setUsbEventLog(msg);
        toast.info(msg);
        loadPairedDevices();
      };

      const handleUsbDisconnect = (event: any) => {
        const name = event.device?.productName || event.device?.manufacturerName || "USB Device";
        const msg = isArabic
          ? `تم فصل جهاز USB: ${name}`
          : `Physical USB device detached: ${name}`;
        setUsbEventLog(msg);
        toast.warning(msg);
        loadPairedDevices();
      };

      (navigator as any).usb.addEventListener("connect", handleUsbConnect);
      (navigator as any).usb.addEventListener("disconnect", handleUsbDisconnect);

      return () => {
        (navigator as any).usb.removeEventListener("connect", handleUsbConnect);
        (navigator as any).usb.removeEventListener("disconnect", handleUsbDisconnect);
      };
    }
  }, [isArabic]);

  const handleCopySerial = () => {
    if (!device?.serial) return;
    navigator.clipboard.writeText(device.serial);
    setCopiedSerial(true);
    toast.success(isArabic ? "تم نسخ الرقم التسلسلي." : "Serial number copied to clipboard.");
    setTimeout(() => setCopiedSerial(false), 2000);
  };

  const handleRefresh = async () => {
    if (!onRefreshProps) return;
    setRefreshing(true);
    try {
      await onRefreshProps();
      toast.success(isArabic ? "تم تحديث بيانات الجهاز." : "Device properties refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!onDisconnect) return;
    setDisconnecting(true);
    try {
      await onDisconnect();
      toast.info(isArabic ? "تم إنهاء اتصال USB بأمان." : "WebUSB session closed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect error");
    } finally {
      setDisconnecting(false);
    }
  };

  // Status computation
  const statusConfig = useMemo(() => {
    if (!capabilities.hasUsb) {
      return {
        label: isArabic ? "WebUSB غير مدعوم" : "WebUSB Unsupported",
        badgeClass: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
        description: isArabic
          ? "المتصفح الحالي لا يدعم واجهة WebUSB. يُرجى فتح هذه الصفحة في متصفح Chromium (مثل Chrome أو Edge) عبر HTTPS."
          : "WebUSB API is not available. Please open this workbench in a Chromium-based browser (Chrome, Edge, Brave) over HTTPS.",
        tone: "error",
      };
    }
    if (connecting) {
      return {
        label: isArabic ? "جارٍ التفويض والاتصال..." : "Connecting & Authorizing...",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 animate-pulse",
        description: isArabic
          ? "افحص شاشة الهاتف للموافقة على تصحيح USB ورمز المصادقة RSA."
          : "Negotiating WebUSB ADB connection. Check your phone's screen to tap 'Allow USB debugging'.",
        tone: "busy",
      };
    }
    if (isConnected) {
      return {
        label: isArabic ? "الجهاز متصل ومفوض" : "Connected & Authorized",
        badgeClass: "bg-[#eef8cd] text-[#426117] border-[#b9da71] dark:bg-[#1f3611] dark:text-[#c8f04a] dark:border-[#385e1d]",
        description: isArabic
          ? "تم إنشاء قناة نقل آمنة عبر WebUSB مباشرة مع خادم ADB على جهازك."
          : "Secure browser-to-device WebUSB channel active with authenticated ADB daemon.",
        tone: "success",
      };
    }
    return {
      label: isArabic ? "بانتظار توصيل الجهاز" : "Awaiting Device",
      badgeClass: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700",
      description: isArabic
        ? "وصّل هاتف أندرويد عبر كابل USB-C واضغط على 'طلب الوصول عبر WebUSB'."
        : "Plug your Android phone via USB-C and click 'Request Access via WebUSB' to authorize.",
      tone: "idle",
    };
  }, [capabilities.hasUsb, connecting, isConnected, isArabic]);

  return (
    <div
      className={`webusb-manager border border-[#d8d1c4] bg-[#fffdf8] text-[#14253a] shadow-xs dark:border-[#2f4860] dark:bg-[#14253a] dark:text-[#f6f2ea] ${className}`}
      id="webusb-connection-manager"
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d1c4] bg-[#f7f4ed] px-5 py-3.5 dark:border-[#2f4860] dark:bg-[#10243a]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#14253a] text-[#c8f04a] dark:bg-[#1b3048]">
            <Usb size={17} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="kicker text-[#687584] dark:text-[#8e9eae]">
                {isArabic ? "بروتوكول النقل" : "Transport Layer"} / WebUSB
              </span>
              <span className="mono text-[0.62rem] text-[#8e9eae]">ADB Daemon</span>
            </div>
            <h3 className="text-sm font-bold tracking-tight sm:text-base">
              {isArabic ? "مدير اتصال WebUSB لأجهزة أندرويد" : "WebUSB Device Connection Manager"}
            </h3>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ${statusConfig.badgeClass}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? "bg-[#527321] dark:bg-[#c8f04a]"
                  : connecting
                  ? "bg-amber-500 animate-ping"
                  : capabilities.hasUsb
                  ? "bg-stone-400"
                  : "bg-red-500"
              }`}
            />
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Main Connection Control Panel */}
      <div className="p-5 sm:p-6">
        {/* If Connected: Full Device Profile Display */}
        {isConnected && device ? (
          <div className="space-y-5">
            <div className="rounded-sm border border-[#b9da71] bg-[#fbfdf7] p-4 dark:border-[#2f5524] dark:bg-[#132715]/40">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#527321]/15 text-[#527321] dark:bg-[#c8f04a]/20 dark:text-[#c8f04a]">
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-bold tracking-tight">
                        {device.manufacturer} {device.model}
                      </h4>
                      <span className="rounded border border-[#b9da71] bg-[#eef8cd] px-1.5 py-0.5 mono text-[0.68rem] font-semibold text-[#426117] dark:bg-[#203c15] dark:text-[#c8f04a] dark:border-[#3d6e27]">
                        Android {device.androidVersion} (API {device.sdk})
                      </span>
                      {root && (
                        <span className="rounded border border-[#dba193] bg-[#fbe5df] px-1.5 py-0.5 mono text-[0.68rem] font-semibold text-[#934639] dark:bg-[#4a1d17] dark:text-[#f8b4a7] dark:border-[#7a2e24]">
                          Root Su UID 0
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#526273] dark:text-[#9fb2c2]">
                      {statusConfig.description}
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {onRefreshProps && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="h-8 border-[#14253a] text-xs hover:bg-[#eef8cd] dark:border-[#527089] dark:hover:bg-[#1f3611]"
                      title={isArabic ? "تحديث خصائص الجهاز" : "Refresh device properties"}
                    >
                      <RefreshCw size={13} className={`mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                      {isArabic ? "تحديث" : "Refresh"}
                    </Button>
                  )}
                  {onDisconnect && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="h-8 border-[#934639] text-xs text-[#934639] hover:bg-[#fbe5df] dark:border-[#e28373] dark:text-[#f1a38e] dark:hover:bg-[#4a1d17]"
                    >
                      {disconnecting ? (
                        <Loader2 size={13} className="mr-1.5 animate-spin" />
                      ) : (
                        <Unplug size={13} className="mr-1.5" />
                      )}
                      {isArabic ? "قطع الاتصال" : "Disconnect"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Hardware Spec Grid */}
              <div className="mt-4 grid gap-3 border-t border-[#e2edd3] pt-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-[#223f1e]">
                <div>
                  <p className="kicker text-[0.62rem] text-[#687584] dark:text-[#8e9eae]">
                    {isArabic ? "الرقم التسلسلي" : "Device Serial"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="mono text-xs font-semibold">{device.serial}</span>
                    <button
                      onClick={handleCopySerial}
                      className="rounded p-1 text-[#687584] hover:bg-stone-200 dark:text-[#8e9eae] dark:hover:bg-[#20364c]"
                      title={isArabic ? "نسخ الرقم التسلسلي" : "Copy serial number"}
                    >
                      {copiedSerial ? <Check size={12} className="text-[#527321]" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="kicker text-[0.62rem] text-[#687584] dark:text-[#8e9eae]">
                    {isArabic ? "بروتوكول التفويض" : "Authorization Authority"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#14253a] dark:text-[#e7eef3]">
                    {root ? (isArabic ? "صلاحيات Root (su)" : "Root (su) Shell") : (isArabic ? "تصحيح USB (المستخدم 0)" : "USB Debugging (User 0)")}
                  </p>
                </div>

                <div>
                  <p className="kicker text-[0.62rem] text-[#687584] dark:text-[#8e9eae]">
                    {isArabic ? "حالة الأمان والشهادة" : "Key Store"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#14253a] dark:text-[#e7eef3]">
                    WebCrypto RSA-2048
                  </p>
                </div>

                <div>
                  <p className="kicker text-[0.62rem] text-[#687584] dark:text-[#8e9eae]">
                    {isArabic ? "الجرد والتطبيقات" : "Inventoried Packages"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#14253a] dark:text-[#e7eef3]">
                    {typeof packageCount === "number"
                      ? `${packageCount} ${isArabic ? "حزمة" : "packages"}`
                      : isArabic
                      ? "جاهز للفحص"
                      : "Ready"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Disconnected or Connecting State */
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-semibold tracking-tight">
                  {isArabic ? "ربط هاتف أندرويد عبر منفذ USB" : "Connect your Android Device via USB"}
                </h4>
                <p className="mt-1 max-w-xl text-xs leading-5 text-[#526273] dark:text-[#9fb2c2]">
                  {statusConfig.description}
                </p>
              </div>

              {/* Primary Connect Button */}
              <Button
                onClick={onConnect}
                disabled={connecting || !capabilities.hasUsb}
                className="action-button h-10 shrink-0 bg-[#14253a] px-5 font-semibold text-[#f6f2ea] hover:bg-[#223952] disabled:opacity-50 dark:bg-[#c8f04a] dark:text-[#14253a] dark:hover:bg-[#d6fa5c]"
                id="request-webusb-access-btn"
              >
                {connecting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    {isArabic ? "جارٍ طلب الوصول..." : "Requesting Device..."}
                  </>
                ) : (
                  <>
                    <PlugZap size={16} className="mr-2" />
                    {isArabic ? "طلب الوصول عبر WebUSB" : "Request Access via WebUSB"}
                  </>
                )}
              </Button>
            </div>

            {/* If WebUSB is completely unsupported */}
            {!capabilities.hasUsb && (
              <div className="flex items-start gap-3 rounded-sm border border-red-300 bg-red-50 p-3.5 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                <XCircle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="text-xs leading-5">
                  <p className="font-semibold">
                    {isArabic ? "متصفحك يفتقر إلى دعم WebUSB" : "WebUSB API Not Supported in this Browser"}
                  </p>
                  <p className="mt-1">
                    {isArabic
                      ? "المتصفحات مثل Firefox و Safari تعطل WebUSB لأسباب أمنية. لتشغيل لوحة تحكم أندرويد هذه، استخدم Google Chrome أو Microsoft Edge أو Brave أو Opera مع تفعيل HTTPS."
                      : "Browsers such as Firefox and Safari intentionally do not implement WebUSB. To manage your device directly, open this workbench in Google Chrome, Microsoft Edge, Brave, or Chromium over HTTPS."}
                  </p>
                </div>
              </div>
            )}

            {/* Paired devices shortcut if any */}
            {pairedDevices.length > 0 && !isConnected && (
              <div className="rounded-sm border border-[#d8d1c4] bg-[#f8f5ee] p-3 text-xs dark:border-[#2f4860] dark:bg-[#182a3d]">
                <p className="kicker text-[0.62rem] text-[#687584] dark:text-[#8e9eae]">
                  {isArabic ? "أجهزة تم تفويضها سابقاً في هذا المتصفح" : "Previously Permitted Devices in this Browser"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pairedDevices.map((dev, idx) => (
                    <button
                      key={idx}
                      onClick={onConnect}
                      className="inline-flex items-center gap-1.5 rounded border border-[#14253a] bg-white px-2.5 py-1 text-xs font-medium text-[#14253a] hover:bg-[#eef8cd] dark:border-[#527089] dark:bg-[#10243a] dark:text-[#e7eef3]"
                    >
                      <Usb size={12} className="text-[#59869c]" />
                      <span>{dev.productName || "Android"}</span>
                      <span className="mono text-[0.6rem] text-[#687584]">
                        VID:{dev.vendorId.toString(16).padStart(4, "0")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* USB Event Log banner if recent event */}
        {usbEventLog && (
          <div className="mt-3 flex items-center justify-between rounded border border-[#59869c]/40 bg-[#59869c]/10 px-3 py-1.5 text-xs text-[#14253a] dark:text-[#cdd7df]">
            <span className="flex items-center gap-2">
              <Info size={14} className="text-[#59869c]" />
              <span className="mono text-[0.7rem]">{usbEventLog}</span>
            </span>
            <button
              onClick={() => setUsbEventLog(null)}
              className="mono text-[0.65rem] text-[#687584] hover:underline"
            >
              {isArabic ? "إغلاق" : "dismiss"}
            </button>
          </div>
        )}

        {/* Expandable Section 1: System Readiness & Environment Diagnostics */}
        <div className="mt-5 border-t border-[#d8d1c4] pt-4 dark:border-[#2f4860]">
          <button
            onClick={() => setDiagnosticsExpanded(!diagnosticsExpanded)}
            className="flex w-full items-center justify-between py-1 text-xs font-semibold text-[#687584] hover:text-[#14253a] dark:text-[#8e9eae] dark:hover:text-[#f6f2ea]"
          >
            <span className="flex items-center gap-2">
              <Cpu size={14} />
              <span>
                {isArabic
                  ? "فحص جاهزية بيئة WebUSB والمتصفح"
                  : "WebUSB Environment & Browser Compatibility Radar"}
              </span>
            </span>
            {diagnosticsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {diagnosticsExpanded && (
            <div className="mt-3 grid gap-2.5 rounded-sm border border-[#d8d1c4] bg-[#f8f5ee] p-3.5 text-xs sm:grid-cols-3 dark:border-[#2f4860] dark:bg-[#10243a]">
              <div className="flex items-start gap-2">
                {capabilities.hasUsb ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#527321] dark:text-[#c8f04a]" />
                ) : (
                  <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                )}
                <div>
                  <p className="font-semibold">{isArabic ? "واجهة WebUSB API" : "WebUSB API"}</p>
                  <p className="mt-0.5 mono text-[0.65rem] text-[#687584] dark:text-[#8e9eae]">
                    {capabilities.hasUsb
                      ? isArabic
                        ? "متاحة في navigator.usb"
                        : "Available (navigator.usb)"
                      : isArabic
                      ? "غير مدعومة"
                      : "Missing / Blocked"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                {capabilities.isSecure ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#527321] dark:text-[#c8f04a]" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold">{isArabic ? "السياق الآمن (HTTPS)" : "Secure Context"}</p>
                  <p className="mt-0.5 mono text-[0.65rem] text-[#687584] dark:text-[#8e9eae]">
                    {capabilities.isSecure
                      ? isArabic
                        ? "نعم (window.isSecureContext)"
                        : "Yes (HTTPS / localhost)"
                      : isArabic
                      ? "غير آمن - يتطلب HTTPS"
                      : "Insecure Context"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                {capabilities.isChromium ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#527321] dark:text-[#c8f04a]" />
                ) : (
                  <Info size={16} className="mt-0.5 shrink-0 text-[#59869c]" />
                )}
                <div>
                  <p className="font-semibold">{isArabic ? "محرك المتصفح" : "Browser Engine"}</p>
                  <p className="mt-0.5 mono text-[0.65rem] text-[#687584] dark:text-[#8e9eae]">
                    {capabilities.isChromium
                      ? "Chromium-based (Optimal)"
                      : "Non-Chromium detected"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Expandable Section 2: Step-by-Step Connection & Troubleshooting Guide */}
        {showTroubleshooting && (
          <div className="mt-3 border-t border-[#d8d1c4] pt-3 dark:border-[#2f4860]">
            <button
              onClick={() => setGuideExpanded(!guideExpanded)}
              className="flex w-full items-center justify-between py-1 text-xs font-semibold text-[#687584] hover:text-[#14253a] dark:text-[#8e9eae] dark:hover:text-[#f6f2ea]"
            >
              <span className="flex items-center gap-2">
                <HelpCircle size={14} />
                <span>
                  {isArabic
                    ? "دليل توصيل USB وتصحيح الأخطاء خطوة بخطوة"
                    : "Step-by-Step USB Setup & Troubleshooting Guide"}
                </span>
              </span>
              {guideExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {guideExpanded && (
              <div className="mt-3 space-y-3 rounded-sm border border-[#d8d1c4] bg-[#f8f5ee] p-4 text-xs dark:border-[#2f4860] dark:bg-[#10243a]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border-l-2 border-[#14253a] bg-white p-3 dark:border-[#c8f04a] dark:bg-[#14253a]">
                    <span className="mono text-[0.62rem] font-bold text-[#59869c]">STEP 01</span>
                    <p className="mt-1 font-semibold">{isArabic ? "تفعيل خيارات المطور" : "Enable Developer Options"}</p>
                    <p className="mt-1 leading-4 text-[#526273] dark:text-[#9fb2c2]">
                      {isArabic
                        ? "الإعدادات > حول الهاتف > اضغط على 'رقم الإصدار' (Build number) سبع مرات."
                        : "Settings > About Phone > Tap 'Build number' 7 times rapidly."}
                    </p>
                  </div>

                  <div className="border-l-2 border-[#59869c] bg-white p-3 dark:border-[#59869c] dark:bg-[#14253a]">
                    <span className="mono text-[0.62rem] font-bold text-[#59869c]">STEP 02</span>
                    <p className="mt-1 font-semibold">{isArabic ? "تفعيل تصحيح USB" : "Enable USB Debugging"}</p>
                    <p className="mt-1 leading-4 text-[#526273] dark:text-[#9fb2c2]">
                      {isArabic
                        ? "الإعدادات > النظام > خيارات المطور > فعّل 'تصحيح أخطاء USB'."
                        : "Settings > System > Developer Options > Toggle 'USB Debugging' ON."}
                    </p>
                  </div>

                  <div className="border-l-2 border-[#c8f04a] bg-white p-3 dark:border-[#c8f04a] dark:bg-[#14253a]">
                    <span className="mono text-[0.62rem] font-bold text-[#59869c]">STEP 03</span>
                    <p className="mt-1 font-semibold">{isArabic ? "الموافقة على التفويض" : "Authorize Key on Phone"}</p>
                    <p className="mt-1 leading-4 text-[#526273] dark:text-[#9fb2c2]">
                      {isArabic
                        ? "اضغط على زر 'طلب الوصول'، اختر جهازك، ثم حدد 'السماح دائماً' على شاشة الهاتف."
                        : "Click 'Request Access', choose device in popup, and check 'Always allow' on phone screen."}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#d8d1c4] pt-3 text-[0.72rem] leading-5 text-[#526273] dark:border-[#2f4860] dark:text-[#9fb2c2]">
                  <p className="font-semibold text-[#14253a] dark:text-[#f6f2ea]">
                    {isArabic ? "نصائح إضافية لحل المشاكل:" : "Common Troubleshooting Tips:"}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 rtl:pr-4 rtl:pl-0">
                    <li>
                      {isArabic
                        ? "إذا لم يظهر الجهاز في قائمة المتصفح، جرّب تبديل وضع USB على الهاتف إلى 'نقل الملفات' (File Transfer) أو 'شحن فقط'."
                        : "If the device does not appear in the browser popup, switch the phone's USB mode from 'No data transfer' to 'File Transfer (MTP)'."}
                    </li>
                    <li>
                      {isArabic
                        ? "تأكد من استخدام كابل USB أصلي ينقل البيانات (بعض الكابلات مخصصة للشحن فقط)."
                        : "Use a genuine high-speed data USB cable (charge-only cables will not expose ADB endpoints)."}
                    </li>
                    <li>
                      {isArabic
                        ? "على نظام Windows، قد تحتاج لتثبيت تعريفات Google USB Driver من Android SDK."
                        : "On Windows, make sure you have the official Google USB Driver or OEM ADB driver installed."}
                    </li>
                    <li>
                      {isArabic
                        ? "لا يتم إرسال أي بيانات أو سجلات إلى خوادم سحابية؛ الاتصال محلي 100% بين المتصفح والهاتف."
                        : "Zero telemetry: all ADB packets and credentials remain strictly contained within this browser session."}
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WebUsbConnectionManager;
