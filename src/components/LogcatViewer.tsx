import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { BrowserAdbClient, type DeviceProfile, type LogcatEntry, type LogcatLevel, type LogcatStreamSession, type CommandResult } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Trash2,
  Download,
  Copy,
  Search,
  Filter,
  ArrowDown,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  Terminal,
  Layers,
  ChevronRight,
  Maximize2,
  Check,
  Zap,
  SlidersHorizontal,
  FileText,
  Smartphone,
  X
} from "lucide-react";
import { toast } from "sonner";

interface LogcatViewerProps {
  adb: React.MutableRefObject<BrowserAdbClient>;
  device: DeviceProfile | null;
  language: "en" | "ar" | "other";
  onAddReceipt?: (result: CommandResult, label: string, authority?: "USB" | "Root" | "Browser") => void;
}

const LOG_LEVELS: Array<{ id: LogcatLevel; label: string; fullLabel: string; tone: string; badgeTone: string }> = [
  { id: "E", label: "E", fullLabel: "Error", tone: "text-[#c2362b] bg-[#fbe5df] border-[#dba193]", badgeTone: "bg-[#c2362b] text-white" },
  { id: "W", label: "W", fullLabel: "Warning", tone: "text-[#b46b02] bg-[#fff0ce] border-[#e6c473]", badgeTone: "bg-[#b46b02] text-white" },
  { id: "I", label: "I", fullLabel: "Info", tone: "text-[#1d5c8a] bg-[#e8f1f7] border-[#a9c7de]", badgeTone: "bg-[#1d5c8a] text-white" },
  { id: "D", label: "D", fullLabel: "Debug", tone: "text-[#3f7a18] bg-[#eef8cd] border-[#b9da71]", badgeTone: "bg-[#3f7a18] text-white" },
  { id: "V", label: "V", fullLabel: "Verbose", tone: "text-[#5a6a7c] bg-[#eee9df] border-[#d8d1c4]", badgeTone: "bg-[#5a6a7c] text-white" },
];

const SIMULATED_SYSTEM_LOGS = [
  { level: "I" as LogcatLevel, tag: "ActivityManager", message: "START u0 {act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] flg=0x10200000 cmp=com.android.settings/.Settings} from uid 1000" },
  { level: "D" as LogcatLevel, tag: "PackageManager", message: "Scanning package com.android.providers.media at /system/priv-app/MediaProvider" },
  { level: "W" as LogcatLevel, tag: "BatteryService", message: "Thermal status elevated: ZONE_0 temp=41.2C, charging throttle enabled at 1800mA" },
  { level: "E" as LogcatLevel, tag: "DropBoxManager", message: "Failed to read kernel dropbox entry: I/O buffer timeout on /data/system/dropbox" },
  { level: "I" as LogcatLevel, tag: "WindowManager", message: "relayoutWindow: viewVisibility=0 req=(1080,2400) title=com.android.settings/com.android.settings.Settings" },
  { level: "D" as LogcatLevel, tag: "WifiService", message: "handleMessage: CMD_RSSI_POLL id=22 freq=5240MHz rssi=-58dBm txrate=866Mbps" },
  { level: "W" as LogcatLevel, tag: "StrictMode", message: "Disk read violation on UI thread in com.android.settings (duration=44ms)" },
  { level: "I" as LogcatLevel, tag: "SurfaceFlinger", message: "SurfaceFlinger state snapshot: 4 active displays, layer count=29, fps=120.0" },
  { level: "E" as LogcatLevel, tag: "AndroidRuntime", message: "FATAL EXCEPTION in background worker thread: java.lang.SecurityException: Permission denial for android.permission.ACCESS_FINE_LOCATION" },
  { level: "D" as LogcatLevel, tag: "AudioFlinger", message: "AudioTrack created: sampleRate=48000, channelMask=0x3, format=0x1, session=184" },
  { level: "I" as LogcatLevel, tag: "InputDispatcher", message: "Delivering key event action=ACTION_DOWN keyCode=KEYCODE_VOLUME_DOWN displayId=0" },
  { level: "W" as LogcatLevel, tag: "PowerManagerService", message: "Screen off timeout triggered after 60000ms inactivity, acquireWakeLock denied" },
  { level: "D" as LogcatLevel, tag: "BluetoothAdapter", message: "Discovery state changed: SCAN_MODE_CONNECTABLE, pairedDevices=4" },
  { level: "E" as LogcatLevel, tag: "Vold", message: "Volume public:179,1 encryption key validation check failed with status code 0x5" },
  { level: "I" as LogcatLevel, tag: "Telecom", message: "CallAudioRouteStateMachine: routing switched to ROUTE_EARPIECE" },
  { level: "V" as LogcatLevel, tag: "ViewRootImpl", message: "handleAppVisibility: visible=true, hasWindowFocus=true" },
];

export function LogcatViewer({ adb, device, language, onAddReceipt }: LogcatViewerProps) {
  const isArabic = language === "ar";
  const [logs, setLogs] = useState<LogcatEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [activeLevels, setActiveLevels] = useState<Set<LogcatLevel>>(new Set(["E", "W", "I", "D", "V"]));
  const [quickLevel, setQuickLevel] = useState<"all" | "error" | "warn" | "info">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [maxBuffer, setMaxBuffer] = useState<number>(1000);
  const [selectedEntry, setSelectedEntry] = useState<LogcatEntry | null>(null);
  const [ratePerSec, setRatePerSec] = useState<number>(0);

  // Export to .txt modal state
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered" | "errors_warnings">("all");
  const [includeDebugHeader, setIncludeDebugHeader] = useState<boolean>(true);
  const [customFilename, setCustomFilename] = useState<string>("");

  const sessionRef = useRef<LogcatStreamSession | null>(null);
  const simulatedTimerRef = useRef<number | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrolledUpRef = useRef<boolean>(false);
  const rateCounterRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(isPaused);

  // Keyboard shortcut Ctrl+E / Cmd+E to trigger Export .txt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (logs.length > 0) {
          setExportModalOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logs.length]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Rate calculator
  useEffect(() => {
    const interval = setInterval(() => {
      setRatePerSec(rateCounterRef.current);
      rateCounterRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Stop live stream if device disconnects
  useEffect(() => {
    if (!device && isStreaming && !isSimulated) {
      if (sessionRef.current) {
        void sessionRef.current.stop();
        sessionRef.current = null;
      }
      setIsStreaming(false);
      setIsPaused(false);
    }
  }, [device, isStreaming, isSimulated]);

  // Handle auto-scroll
  useEffect(() => {
    if (autoScroll && !isPaused && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  // Handle stream stop on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        void sessionRef.current.stop();
        sessionRef.current = null;
      }
      if (simulatedTimerRef.current) {
        clearInterval(simulatedTimerRef.current);
        simulatedTimerRef.current = null;
      }
    };
  }, []);

  const appendEntry = useCallback((entry: LogcatEntry) => {
    rateCounterRef.current += 1;
    if (isPausedRef.current) return;
    setLogs((prev) => {
      const next = [...prev, entry];
      if (next.length > maxBuffer) {
        return next.slice(next.length - maxBuffer);
      }
      return next;
    });
  }, [maxBuffer]);

  const startStream = async () => {
    if (sessionRef.current) {
      await sessionRef.current.stop();
      sessionRef.current = null;
    }
    if (simulatedTimerRef.current) {
      clearInterval(simulatedTimerRef.current);
      simulatedTimerRef.current = null;
    }

    if (device && adb.current.isConnected) {
      try {
        setIsStreaming(true);
        setIsPaused(false);
        setIsSimulated(false);
        toast.info(isArabic ? "بدء استقبال سجلات النظام من جهاز USB..." : "Starting live Logcat stream from USB device...");

        const session = await adb.current.startLogcat((entry) => {
          appendEntry(entry);
        });
        sessionRef.current = session;
      } catch (error) {
        const err = error instanceof Error ? error.message : "Logcat spawn failed";
        setIsStreaming(false);
        toast.error(err);
      }
    } else {
      // Start simulated stream for preview / playground
      setIsStreaming(true);
      setIsPaused(false);
      setIsSimulated(true);
      toast.info(isArabic ? "بدء محاكاة سجلات أندرويد الحية (نمط العرض)" : "Streaming simulated Android system logcat (preview mode)");

      let simIndex = 0;
      simulatedTimerRef.current = window.setInterval(() => {
        const template = SIMULATED_SYSTEM_LOGS[simIndex % SIMULATED_SYSTEM_LOGS.length];
        simIndex++;
        const pid = 1000 + (simIndex % 15) * 110;
        const tid = pid + 3;
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const hh = String(now.getHours()).padStart(2, "0");
        const min = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        const ms = String(now.getMilliseconds()).padStart(3, "0");
        const timestamp = `${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;

        appendEntry({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp,
          pid: String(pid),
          tid: String(tid),
          level: template.level,
          tag: template.tag,
          message: template.message,
          raw: `${timestamp} ${pid} ${tid} ${template.level} ${template.tag}: ${template.message}`,
        });
      }, 450);
    }
  };

  const stopStream = async () => {
    if (sessionRef.current) {
      await sessionRef.current.stop();
      sessionRef.current = null;
    }
    if (simulatedTimerRef.current) {
      clearInterval(simulatedTimerRef.current);
      simulatedTimerRef.current = null;
    }
    setIsStreaming(false);
    setIsPaused(false);
    toast.success(isArabic ? "تم إيقاف تدفق سجلات النظام." : "Logcat streaming stopped.");
  };

  const togglePause = () => {
    setIsPaused((p) => {
      const next = !p;
      toast.info(next ? (isArabic ? "تم إيقاف التدفق مؤقتاً" : "Stream paused") : (isArabic ? "تم استئناف التدفق" : "Stream resumed"));
      return next;
    });
  };

  const clearLocalBuffer = () => {
    setLogs([]);
    setSelectedEntry(null);
    toast.success(isArabic ? "تم مسح السجلات المعروضة محلياً." : "Cleared local log buffer.");
  };

  const clearDeviceBuffer = async () => {
    if (!device || !adb.current.isConnected) {
      clearLocalBuffer();
      return;
    }
    try {
      const result = await adb.current.clearLogcat();
      if (onAddReceipt) {
        onAddReceipt(result, "logcat -c (clear device ring buffer)", "USB");
      }
      setLogs([]);
      setSelectedEntry(null);
      toast.success(isArabic ? "تم تفريغ مخزن Logcat على الجهاز (logcat -c)." : "Device Logcat buffer cleared (logcat -c).");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear device logcat";
      toast.error(msg);
    }
  };

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom) {
      isScrolledUpRef.current = true;
    } else {
      isScrolledUpRef.current = false;
    }
  };

  // Preset quick levels
  const handleQuickLevel = (level: "all" | "error" | "warn" | "info") => {
    setQuickLevel(level);
    if (level === "all") {
      setActiveLevels(new Set(["E", "W", "I", "D", "V"]));
    } else if (level === "error") {
      setActiveLevels(new Set(["E"]));
    } else if (level === "warn") {
      setActiveLevels(new Set(["E", "W"]));
    } else if (level === "info") {
      setActiveLevels(new Set(["E", "W", "I"]));
    }
  };

  const toggleLevel = (lvl: LogcatLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) {
        if (next.size > 1) next.delete(lvl);
      } else {
        next.add(lvl);
      }
      return next;
    });
  };

  // Available unique tags for quick filtering
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const log of logs) {
      if (log.tag && log.tag !== "System") tags.add(log.tag);
    }
    return Array.from(tags).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (!activeLevels.has(log.level)) return false;
      if (selectedTag !== "all" && log.tag !== selectedTag) return false;
      if (query) {
        const text = `${log.tag} ${log.message} ${log.pid} ${log.level}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });
  }, [logs, activeLevels, selectedTag, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let errorCount = 0;
    let warnCount = 0;
    let infoCount = 0;
    for (const log of logs) {
      if (log.level === "E" || log.level === "F") errorCount++;
      else if (log.level === "W") warnCount++;
      else if (log.level === "I") infoCount++;
    }
    return {
      total: logs.length,
      errors: errorCount,
      warnings: warnCount,
      infos: infoCount,
    };
  }, [logs]);

  const copyFilteredLogs = () => {
    if (filteredLogs.length === 0) {
      toast.error(isArabic ? "لا توجد سجلات مطابقة للنسخ." : "No matching logs to copy.");
      return;
    }
    const text = filteredLogs.map((l) => l.raw || `${l.timestamp} ${l.pid} ${l.level}/${l.tag}: ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success(isArabic ? `تم نسخ ${filteredLogs.length} سطر إلى الحافظة.` : `Copied ${filteredLogs.length} lines to clipboard.`);
  };

  // Default filename for .txt debugging export
  const defaultFilename = useMemo(() => {
    const rawSerial = device?.serial ? device.serial.replace(/[^a-zA-Z0-9_-]/g, "") : (isSimulated ? "preview-sim" : "android");
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const scopeTag = exportScope === "all" ? "all" : exportScope === "filtered" ? "filtered" : "errors-warn";
    return `logcat-debug-${rawSerial}-${scopeTag}-${dStr}.txt`;
  }, [device?.serial, exportScope, isSimulated]);

  // Generate formatted .txt payload with diagnostic debugging header
  const generateLogcatTextContent = useCallback((scope: "all" | "filtered" | "errors_warnings", withHeader: boolean) => {
    let targetLogs = logs;
    let scopeLabel = "All Streaming Logs (Complete Ring Buffer)";
    if (scope === "filtered") {
      targetLogs = filteredLogs;
      scopeLabel = `Filtered Logs (${filteredLogs.length} matching)`;
    } else if (scope === "errors_warnings") {
      targetLogs = logs.filter((l) => l.level === "E" || l.level === "W" || l.level === "F");
      scopeLabel = `Errors & Warnings Only (${targetLogs.length} entries)`;
    }

    let header = "";
    if (withHeader) {
      const now = new Date();
      const serial = device?.serial || (isSimulated ? "SIMULATED-PREVIEW-DEVICE" : "USB-Android-Device");
      const model = device?.model ? `${device.manufacturer || ""} ${device.model}`.trim() : "Android Device";
      const androidVer = device?.androidVersion ? `Android ${device.androidVersion} (SDK ${device.sdk || "N/A"})` : "Android Linux Kernel 5.x+";
      const filterSummary = [
        `Levels=[${Array.from(activeLevels).join(",")}]`,
        selectedTag !== "all" ? `Tag="${selectedTag}"` : null,
        searchQuery ? `Query="${searchQuery}"` : null,
      ].filter(Boolean).join(" | ");

      header = [
        "# ==============================================================================",
        "# ANDROID CONTROL CENTER - STREAMING LOGCAT DEBUGGING DUMP",
        "# ------------------------------------------------------------------------------",
        `# Timestamp (ISO)  : ${now.toISOString()}`,
        `# Timestamp (Local): ${now.toLocaleString()}`,
        `# Target Device    : ${model}`,
        `# Device Serial    : ${serial}`,
        `# OS / Platform    : ${androidVer}`,
        `# Export Scope     : ${scopeLabel}`,
        `# Lines Exported   : ${targetLogs.length} lines (total session buffer: ${logs.length})`,
        `# Active Filters   : ${filterSummary || "None (All active)"}`,
        `# Stream Source    : ${isSimulated ? "Browser Simulated Android Preview" : "Live WebUSB adb daemon channel"}`,
        `# Format Standard  : Android threadtime (timestamp pid tid priority tag: message)`,
        "# ==============================================================================",
        "",
      ].join("\n");
    }

    const body = targetLogs
      .map((l) => l.raw || `${l.timestamp}  ${String(l.pid).padStart(5, " ")}  ${String(l.tid || l.pid).padStart(5, " ")} ${l.level} ${l.tag.padEnd(20, " ")}: ${l.message}`)
      .join("\n");

    return {
      content: header + body,
      count: targetLogs.length,
      scopeLabel,
    };
  }, [logs, filteredLogs, device, isSimulated, activeLevels, selectedTag, searchQuery]);

  // Execute download to .txt file
  const executeExportToTxt = useCallback((scope: "all" | "filtered" | "errors_warnings" = exportScope, withHeader: boolean = includeDebugHeader) => {
    const { content, count, scopeLabel } = generateLogcatTextContent(scope, withHeader);
    if (count === 0) {
      toast.error(isArabic ? "لا توجد سجلات لتصديرها في النطاق المحدد." : "No log records found in the selected scope to export.");
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const rawName = (customFilename.trim() || defaultFilename).trim();
    const finalFilename = rawName.toLowerCase().endsWith(".txt") ? rawName : `${rawName}.txt`;

    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const sizeKb = (blob.size / 1024).toFixed(1);
    toast.success(
      isArabic
        ? `تم تصدير ${count} سجل إلى ${finalFilename} (${sizeKb} KB)`
        : `Exported ${count} log lines to ${finalFilename} (${sizeKb} KB)`
    );

    if (onAddReceipt) {
      onAddReceipt(
        {
          command: `export logcat --scope=${scope} --file="${finalFilename}"`,
          stdout: `Logcat debugging file exported successfully.\nFile: ${finalFilename}\nLines: ${count}\nSize: ${blob.size} bytes (${sizeKb} KB)\nScope: ${scopeLabel}\nTimestamp: ${new Date().toISOString()}`,
          stderr: "",
          exitCode: 0,
          at: new Date().toLocaleTimeString(),
        },
        isArabic ? `تصدير سجلات Logcat (${count} سطر .txt)` : `Exported Logcat debug file (${count} lines .txt)`,
        "Browser"
      );
    }

    setExportModalOpen(false);
  }, [exportScope, includeDebugHeader, generateLogcatTextContent, customFilename, defaultFilename, isArabic, onAddReceipt]);

  // Copy .txt formatted content to clipboard
  const copyExportContent = useCallback((scope: "all" | "filtered" | "errors_warnings" = exportScope, withHeader: boolean = includeDebugHeader) => {
    const { content, count } = generateLogcatTextContent(scope, withHeader);
    if (count === 0) {
      toast.error(isArabic ? "لا توجد سجلات للنسخ." : "No logs available to copy.");
      return;
    }
    navigator.clipboard.writeText(content);
    toast.success(
      isArabic
        ? `تم نسخ ${count} سطر منسق مع الترويسة إلى الحافظة.`
        : `Copied ${count} formatted debug log lines with header to clipboard.`
    );
  }, [exportScope, includeDebugHeader, generateLogcatTextContent, isArabic]);

  // Live preview data for the export modal
  const previewData = useMemo(() => {
    const { content, count } = generateLogcatTextContent(exportScope, includeDebugHeader);
    const lines = content.split("\n");
    const previewSnippet = lines.slice(0, 16).join("\n") + (lines.length > 16 ? `\n... [and ${lines.length - 16} more log lines]` : "");
    const sizeKb = (new Blob([content]).size / 1024).toFixed(1);
    return {
      snippet: previewSnippet,
      linesCount: count,
      sizeKb,
    };
  }, [generateLogcatTextContent, exportScope, includeDebugHeader]);

  // Quick 1-click download of all streaming logs
  const downloadLogs = () => {
    executeExportToTxt("all", true);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="service-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="state-square p-2 border-[#59869c] text-[#263d55]">
                <Terminal size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-[-0.03em] text-[#14253a]">
                    {isArabic ? "عارض سجلات النظام المباشر (Logcat)" : "Live Device Logcat Streamer"}
                  </h2>
                  {isStreaming && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[0.68rem] font-bold border border-[#b9da71] bg-[#eef8cd] text-[#3f7a18]">
                      <span className="h-2 w-2 rounded-full bg-[#3f7a18] animate-ping" />
                      {isPaused ? (isArabic ? "موقوف مؤقتاً" : "PAUSED") : (isArabic ? "مباشر" : "LIVE")}
                    </span>
                  )}
                  {isSimulated && isStreaming && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.64rem] font-semibold border border-[#d8d1c4] bg-[#f8f5ee] text-[#526273]">
                      <Zap size={11} className="text-[#b46b02]" />
                      {isArabic ? "محاكاة العرض" : "Preview Sim"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#526273]">
                  {isArabic
                    ? "تدفق فوري ومستمر لرسائل النظام والعمليات ونواة أندرويد مع تصفية فورية حسب مستوى الخطورة"
                    : "Real-time streaming Android system, process, and kernel logs with multi-level severity filtering"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Controls Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {!isStreaming ? (
              <Button
                onClick={startStream}
                className="action-button bg-[#14253a] text-[#f6f2ea] hover:bg-[#223952] text-xs h-9 px-3.5"
              >
                <Play size={14} className="mr-1.5 text-[#b9da71]" />
                {isArabic ? "بدء التدفق المباشر" : "Start Live Stream"}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={togglePause}
                  className={`action-button text-xs h-9 px-3 ${isPaused ? "bg-[#fff0ce] text-[#b46b02] border-[#e6c473]" : "border-[#d8d1c4] text-[#14253a]"}`}
                >
                  {isPaused ? (
                    <>
                      <Play size={14} className="mr-1.5 text-[#3f7a18]" />
                      {isArabic ? "استئناف" : "Resume"}
                    </>
                  ) : (
                    <>
                      <Pause size={14} className="mr-1.5 text-[#b46b02]" />
                      {isArabic ? "إيقاف مؤقت" : "Pause"}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={stopStream}
                  className="action-button text-xs h-9 px-3 border-[#dba193] text-[#c2362b] hover:bg-[#fbe5df]"
                >
                  <X size={14} className="mr-1.5" />
                  {isArabic ? "إيقاف" : "Stop"}
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={clearLocalBuffer}
              className="action-button text-xs h-9 px-3 border-[#d8d1c4] hover:bg-[#f3efe6]"
              title={isArabic ? "تفريغ الشاشة" : "Clear view"}
            >
              <Trash2 size={13} className="mr-1" />
              {isArabic ? "مسح الشاشة" : "Clear"}
            </Button>

            {device && adb.current.isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearDeviceBuffer}
                className="action-button text-xs h-9 px-2.5 border-[#d8d1c4] text-[#526273] hover:bg-[#f3efe6]"
                title={isArabic ? "تفريغ مخزن الجهاز (logcat -c)" : "Flush device buffer (logcat -c)"}
              >
                <RefreshCw size={13} className="mr-1" />
                {isArabic ? "تفريغ الجهاز" : "Flush Device"}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={copyFilteredLogs}
              disabled={filteredLogs.length === 0}
              className="action-button text-xs h-9 px-2.5 border-[#d8d1c4] hover:bg-[#f3efe6]"
              title={isArabic ? "نسخ السجلات المصفاة" : "Copy filtered logs"}
            >
              <Copy size={13} className="mr-1" />
              {isArabic ? "نسخ" : "Copy"}
            </Button>

            <div className="inline-flex items-center rounded border border-[#14253a] bg-[#fffdf8] shadow-xs dark:border-[#c8f04a] dark:bg-[#14253a]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportModalOpen(true)}
                disabled={logs.length === 0}
                className="action-button text-xs h-9 px-3 text-[#14253a] dark:text-[#f6f2ea] hover:bg-[#e6f4bb] dark:hover:bg-[#253f2c] font-semibold gap-1.5"
                title={isArabic ? "خيارات تصدير ملف .txt للتشخيص (Ctrl+E)" : "Export to .txt file with debug options (Ctrl+E)"}
              >
                <FileText size={13} className="text-[#54730f] dark:text-[#c8f04a]" />
                <span>{isArabic ? "تصدير .txt" : "Export .txt"}</span>
                <span className="mono text-[0.65rem] px-1.5 py-0.5 rounded bg-[#f3efe6] dark:bg-[#1a2d3f] text-[#526273] dark:text-[#c8f04a] font-normal">
                  {logs.length}
                </span>
              </Button>
              <button
                type="button"
                onClick={downloadLogs}
                disabled={logs.length === 0}
                className="border-l border-[#d8d1c4] px-2 h-9 flex items-center justify-center text-[#526273] hover:bg-[#e6f4bb] hover:text-[#14253a] dark:border-[#38526d] dark:text-[#c1cdd8] dark:hover:bg-[#253f2c] disabled:opacity-40"
                title={isArabic ? "تنزيل سريع مباشر لجميع السجلات (.txt)" : "Quick 1-click download all logs (.txt)"}
              >
                <Download size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Live Counters Banner */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 pt-3 border-t border-[#eee7da]">
          <div className="border border-[#d8d1c4] bg-[#fbf9f3] p-2.5 text-center">
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#687584]">
              {isArabic ? "إجمالي السجلات" : "Buffer Count"}
            </p>
            <p className="mono mt-0.5 text-lg font-bold text-[#14253a]">{stats.total}</p>
          </div>

          <div
            onClick={() => handleQuickLevel("error")}
            className="cursor-pointer border border-[#dba193] bg-[#fbe5df] p-2.5 text-center hover:opacity-90 transition-opacity"
            title={isArabic ? "تصفية: الأخطاء فقط" : "Filter: Errors only"}
          >
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#c2362b] flex items-center justify-center gap-1">
              <AlertCircle size={11} />
              {isArabic ? "الأخطاء" : "Errors"}
            </p>
            <p className="mono mt-0.5 text-lg font-bold text-[#c2362b]">{stats.errors}</p>
          </div>

          <div
            onClick={() => handleQuickLevel("warn")}
            className="cursor-pointer border border-[#e6c473] bg-[#fff0ce] p-2.5 text-center hover:opacity-90 transition-opacity"
            title={isArabic ? "تصفية: التحذيرات والأخطاء" : "Filter: Warnings & Errors"}
          >
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#b46b02] flex items-center justify-center gap-1">
              <AlertTriangle size={11} />
              {isArabic ? "التحذيرات" : "Warnings"}
            </p>
            <p className="mono mt-0.5 text-lg font-bold text-[#b46b02]">{stats.warnings}</p>
          </div>

          <div
            onClick={() => handleQuickLevel("info")}
            className="cursor-pointer border border-[#a9c7de] bg-[#e8f1f7] p-2.5 text-center hover:opacity-90 transition-opacity"
            title={isArabic ? "تصفية: معلومات فأعلى" : "Filter: Info & above"}
          >
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#1d5c8a] flex items-center justify-center gap-1">
              <Info size={11} />
              {isArabic ? "المعلومات" : "Info"}
            </p>
            <p className="mono mt-0.5 text-lg font-bold text-[#1d5c8a]">{stats.infos}</p>
          </div>

          <div className="border border-[#d8d1c4] bg-[#fbf9f3] p-2.5 text-center col-span-2 sm:col-span-1">
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#687584]">
              {isArabic ? "معدل التدفق" : "Stream Rate"}
            </p>
            <p className="mono mt-0.5 text-lg font-bold text-[#263d55]">
              {ratePerSec} <span className="text-xs font-normal text-[#687584]">/s</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="service-card p-3 sm:p-4 bg-[#fffdfa]">
        <div className="flex flex-col gap-3">
          {/* Row 1: Quick Filter Presets and Multi-select Level Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#526273] flex items-center gap-1.5 mr-1">
                <Filter size={13} />
                {isArabic ? "المستوى:" : "Log Level:"}
              </span>

              {/* Quick Level Preset Tabs */}
              <div className="flex items-center border border-[#d8d1c4] bg-[#f8f5ee] p-0.5">
                <button
                  onClick={() => handleQuickLevel("all")}
                  className={`px-2.5 py-1 text-[0.68rem] font-semibold transition-all ${quickLevel === "all" ? "bg-[#14253a] text-white" : "text-[#526273] hover:text-[#14253a]"}`}
                >
                  {isArabic ? "الكل" : "All"}
                </button>
                <button
                  onClick={() => handleQuickLevel("error")}
                  className={`px-2.5 py-1 text-[0.68rem] font-semibold transition-all ${quickLevel === "error" ? "bg-[#c2362b] text-white" : "text-[#c2362b] hover:bg-[#fbe5df]"}`}
                >
                  {isArabic ? "أخطاء فقط" : "Error only"}
                </button>
                <button
                  onClick={() => handleQuickLevel("warn")}
                  className={`px-2.5 py-1 text-[0.68rem] font-semibold transition-all ${quickLevel === "warn" ? "bg-[#b46b02] text-white" : "text-[#b46b02] hover:bg-[#fff0ce]"}`}
                >
                  {isArabic ? "تحذيرات+" : "Warn & Error"}
                </button>
                <button
                  onClick={() => handleQuickLevel("info")}
                  className={`px-2.5 py-1 text-[0.68rem] font-semibold transition-all ${quickLevel === "info" ? "bg-[#1d5c8a] text-white" : "text-[#1d5c8a] hover:bg-[#e8f1f7]"}`}
                >
                  {isArabic ? "معلومات+" : "Info+"}
                </button>
              </div>

              {/* Individual Multi-Level Toggle Chips */}
              <div className="flex items-center gap-1 border-l border-[#d8d1c4] pl-2 ml-1">
                {LOG_LEVELS.map((lvl) => {
                  const active = activeLevels.has(lvl.id);
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => toggleLevel(lvl.id)}
                      className={`mono text-[0.65rem] font-bold px-2 py-1 border transition-all ${active ? lvl.badgeTone : "bg-[#f8f5ee] border-[#d8d1c4] text-[#8e9eae] opacity-50"}`}
                      title={`${lvl.fullLabel} (${active ? "active" : "hidden"})`}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Auto-scroll and buffer controls */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-[#526273] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="accent-[#14253a] h-3.5 w-3.5"
                />
                <ArrowDown size={12} className={autoScroll ? "text-[#3f7a18]" : "text-[#8e9eae]"} />
                <span>{isArabic ? "تمرير تلقائي للأسفل" : "Auto-scroll"}</span>
              </label>

              <div className="flex items-center gap-1.5 text-xs text-[#526273]">
                <span>{isArabic ? "المخزن:" : "Buffer:"}</span>
                <select
                  value={maxBuffer}
                  onChange={(e) => setMaxBuffer(Number(e.target.value))}
                  className="h-7 border border-[#d8d1c4] bg-[#fffdf8] px-1.5 text-xs outline-none focus:border-[#14253a]"
                >
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={2500}>2,500</option>
                  <option value={5000}>5,000</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Text Search and Tag Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-[#eee7da]">
            <div className="relative flex-1 w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687584]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isArabic ? "بحث في نص السجل، الوسم (Tag)، أو رقم العملية (PID)..." : "Filter by message text, Tag, or Process ID (PID)..."}
                className="h-9 w-full border border-[#d8d1c4] bg-[#fffdf8] pl-9 pr-8 text-xs outline-none focus:border-[#14253a]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8e9eae] hover:text-[#14253a]"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Tag Selector */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-xs text-[#526273] shrink-0">{isArabic ? "الوسم:" : "Tag:"}</span>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="h-9 min-w-[150px] border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a]"
              >
                <option value="all">{isArabic ? "كل الوسوم (Tags)" : "All Tags"}</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="text-[0.68rem] mono text-[#687584] shrink-0">
              {filteredLogs.length} / {logs.length} {isArabic ? "سجل" : "lines"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Streaming Terminal View */}
      <div className="service-card overflow-hidden border-[#14253a]/20 bg-[#111823] text-[#e3e8ee] shadow-inner">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between border-b border-[#253648] bg-[#0c131c] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e05244]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f4b340]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#46bf68]" />
            <span className="ml-2 mono text-[0.7rem] text-[#8e9eae]">
              adb shell logcat -v threadtime {device?.serial ? `[${device.serial}]` : "[virtual-stream]"}
            </span>
          </div>

          <div className="flex items-center gap-3 mono text-[0.68rem] text-[#718296]">
            {isPaused && (
              <span className="text-[#f4b340] font-bold animate-pulse">
                [PAUSED]
              </span>
            )}
            <span>{filteredLogs.length} matching</span>
            <button
              onClick={() => setExportModalOpen(true)}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#2d4256] bg-[#162332] text-[#c8f04a] hover:bg-[#203246] hover:border-[#c8f04a]/40 disabled:opacity-40 transition-colors"
              title={isArabic ? "تصدير السجلات المباشرة كملف .txt للتشخيص" : "Export streaming logs to .txt for debugging"}
            >
              <FileText size={11} />
              <span>{isArabic ? "تصدير .txt" : "Export .txt"}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Log Lines List */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="h-[520px] overflow-y-auto overflow-x-auto p-2 font-mono text-[0.72rem] leading-5 divide-y divide-[#1b2836]"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#687c92] p-8">
              <Terminal size={36} className="text-[#33465b] mb-3" />
              <p className="font-semibold text-sm text-[#8e9eae]">
                {logs.length === 0
                  ? isArabic
                    ? "لا توجد سجلات بعد. اضغط «بدء التدفق المباشر» للبدء."
                    : "No logs streaming yet. Click 'Start Live Stream' to begin."
                  : isArabic
                  ? "لا توجد سجلات تطابق خيارات التصفية الحالية."
                  : "No log lines match current filters."}
              </p>
              {logs.length === 0 ? (
                <div className="mt-4">
                  <Button
                    onClick={startStream}
                    className="action-button bg-[#263d55] text-white hover:bg-[#344f6c] text-xs h-8 px-3"
                  >
                    <Play size={13} className="mr-1.5 text-[#b9da71]" />
                    {isArabic ? "تشغيل تدفق السجلات الآن" : "Start streaming now"}
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setActiveLevels(new Set(["E", "W", "I", "D", "V"]));
                    setQuickLevel("all");
                    setSearchQuery("");
                    setSelectedTag("all");
                  }}
                  className="mt-3 text-xs text-[#59869c] hover:underline"
                >
                  {isArabic ? "إعادة تعيين عوامل التصفية" : "Reset all filters"}
                </button>
              )}
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              let levelBadge = "bg-[#425263] text-white";
              let textTone = "text-[#cdd5de]";

              if (entry.level === "E" || entry.level === "F") {
                levelBadge = "bg-[#c2362b] text-white";
                textTone = "text-[#ff8f85] font-semibold bg-[#2e1414]/40";
              } else if (entry.level === "W") {
                levelBadge = "bg-[#b46b02] text-white";
                textTone = "text-[#ffd074] bg-[#291e0a]/40";
              } else if (entry.level === "I") {
                levelBadge = "bg-[#1d5c8a] text-white";
                textTone = "text-[#9cd2ff]";
              } else if (entry.level === "D") {
                levelBadge = "bg-[#336315] text-white";
                textTone = "text-[#b4ea8a]";
              } else if (entry.level === "V") {
                levelBadge = "bg-[#313e4d] text-[#93a2b4]";
                textTone = "text-[#8e9eae]";
              }

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`group flex items-start gap-2 px-2 py-1 cursor-pointer transition-colors hover:bg-[#1c293a] ${isSelected ? "bg-[#25394f] border-l-2 border-[#59869c]" : ""} ${textTone}`}
                >
                  <span className="shrink-0 text-[#60748b] select-none text-[0.66rem] w-28">
                    {entry.timestamp}
                  </span>

                  <span className={`shrink-0 w-4 h-4 rounded-xs text-[0.62rem] font-bold flex items-center justify-center select-none ${levelBadge}`}>
                    {entry.level}
                  </span>

                  <span className="shrink-0 text-[#8397ad] w-12 text-right select-none text-[0.66rem]">
                    {entry.pid}
                  </span>

                  <span className="shrink-0 font-bold text-[#e1af62] w-36 truncate select-none text-left" title={entry.tag}>
                    {entry.tag}:
                  </span>

                  <span className="flex-1 break-all whitespace-pre-wrap">
                    {entry.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Entry Inspector Modal / Drawer */}
      {selectedEntry && (
        <div className="service-card p-4 bg-[#fffdf8] border-[#14253a]/30">
          <div className="flex items-start justify-between border-b border-[#d8d1c4] pb-3">
            <div className="flex items-center gap-2">
              <span className={`mono font-bold px-2 py-0.5 text-xs rounded-xs text-white ${
                selectedEntry.level === "E" ? "bg-[#c2362b]" : selectedEntry.level === "W" ? "bg-[#b46b02]" : selectedEntry.level === "I" ? "bg-[#1d5c8a]" : "bg-[#526273]"
              }`}>
                {selectedEntry.level}
              </span>
              <h4 className="font-bold text-sm text-[#14253a]">{selectedEntry.tag}</h4>
              <span className="mono text-xs text-[#687584]">PID: {selectedEntry.pid} {selectedEntry.tid && `TID: ${selectedEntry.tid}`}</span>
              <span className="mono text-xs text-[#687584]">· {selectedEntry.timestamp}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(selectedEntry.raw || `${selectedEntry.timestamp} ${selectedEntry.level}/${selectedEntry.tag}: ${selectedEntry.message}`);
                  toast.success(isArabic ? "تم نسخ السطر." : "Copied line to clipboard.");
                }}
                className="action-button text-xs h-7 px-2 border-[#d8d1c4]"
              >
                <Copy size={11} className="mr-1" />
                {isArabic ? "نسخ السطر" : "Copy Raw"}
              </Button>

              <button
                onClick={() => setSelectedEntry(null)}
                className="text-[#687584] hover:text-[#14253a] p-1"
                aria-label="Close details"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[#687584] mb-1">
              {isArabic ? "محتوى الرسالة الكامل:" : "Full Message Payload:"}
            </p>
            <pre className="mono p-3 bg-[#14202e] text-[#f2f6fa] text-xs overflow-x-auto whitespace-pre-wrap rounded-xs leading-5">
              {selectedEntry.message}
            </pre>

            <p className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[#687584] mt-3 mb-1">
              {isArabic ? "السطر الخام (Raw Logcat):" : "Raw Output Line:"}
            </p>
            <pre className="mono p-2.5 bg-[#f6f2ea] text-[#33465b] text-[0.68rem] overflow-x-auto whitespace-pre-wrap rounded-xs border border-[#d8d1c4]">
              {selectedEntry.raw}
            </pre>
          </div>
        </div>
      )}

      {/* Export to .txt Debugging Modal */}
      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-[#d8d1c4] bg-[#fffdf8] text-[#14253a] shadow-2xl dark:border-[#2f4860] dark:bg-[#142232] dark:text-[#f6f2ea]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#d8d1c4] bg-[#f7f3eb] px-5 py-4 dark:border-[#2f4860] dark:bg-[#0f1926]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded border border-[#59869c] bg-[#eef5fa] text-[#1d5c8a] dark:border-[#426a8c] dark:bg-[#1a2f44] dark:text-[#a0cbef]">
                  <FileText size={17} />
                </span>
                <div>
                  <h3 className="text-base font-bold tracking-tight">
                    {isArabic ? "تصدير تدفق Logcat إلى ملف نصي (.txt)" : "Export Logcat Streaming Logs (.txt)"}
                  </h3>
                  <p className="text-xs text-[#526273] dark:text-[#a6b8ca]">
                    {isArabic
                      ? "توليد ملف تشخيص نصي دقيق للمطورين مع ترويسة معلومات الجهاز وبيانات الفلاتر"
                      : "Create a structured .txt log file with diagnostic metadata for debugging and bug reports"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="rounded p-1 text-[#687584] hover:bg-[#eae4d8] hover:text-[#14253a] dark:text-[#91a3b5] dark:hover:bg-[#1c2e42] dark:hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
              {/* Scope Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#687584] dark:text-[#8ea0b2] mb-2 block">
                  {isArabic ? "نطاق السجلات المراد تصديرها:" : "Export Scope:"}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExportScope("all")}
                    className={`flex flex-col items-start p-3 text-left border rounded transition-all ${
                      exportScope === "all"
                        ? "border-[#14253a] bg-[#f0f7db] dark:border-[#c8f04a] dark:bg-[#1f3422]"
                        : "border-[#d8d1c4] bg-[#faf8f3] hover:bg-[#f2ece0] dark:border-[#2b4157] dark:bg-[#162332] dark:hover:bg-[#1c2e42]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold">{isArabic ? "كل السجلات الحالية" : "All Stream Logs"}</span>
                      {exportScope === "all" && <Check size={14} className="text-[#3f7a18] dark:text-[#c8f04a]" />}
                    </div>
                    <span className="mono text-xs font-semibold text-[#526273] dark:text-[#9bb2c7] mt-1">
                      {logs.length} {isArabic ? "سطر" : "lines"}
                    </span>
                    <span className="text-[0.68rem] text-[#687584] dark:text-[#7f94a8] mt-0.5">
                      {isArabic ? "كامل المخزن المؤقت" : "Full capture buffer"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("filtered")}
                    className={`flex flex-col items-start p-3 text-left border rounded transition-all ${
                      exportScope === "filtered"
                        ? "border-[#14253a] bg-[#f0f7db] dark:border-[#c8f04a] dark:bg-[#1f3422]"
                        : "border-[#d8d1c4] bg-[#faf8f3] hover:bg-[#f2ece0] dark:border-[#2b4157] dark:bg-[#162332] dark:hover:bg-[#1c2e42]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold">{isArabic ? "السجلات المصفاة فقط" : "Current Filtered"}</span>
                      {exportScope === "filtered" && <Check size={14} className="text-[#3f7a18] dark:text-[#c8f04a]" />}
                    </div>
                    <span className="mono text-xs font-semibold text-[#526273] dark:text-[#9bb2c7] mt-1">
                      {filteredLogs.length} {isArabic ? "سطر" : "lines"}
                    </span>
                    <span className="text-[0.68rem] text-[#687584] dark:text-[#7f94a8] mt-0.5">
                      {isArabic ? "مطابقة للبحث والوسم" : "Matching active filters"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("errors_warnings")}
                    className={`flex flex-col items-start p-3 text-left border rounded transition-all ${
                      exportScope === "errors_warnings"
                        ? "border-[#14253a] bg-[#f0f7db] dark:border-[#c8f04a] dark:bg-[#1f3422]"
                        : "border-[#d8d1c4] bg-[#faf8f3] hover:bg-[#f2ece0] dark:border-[#2b4157] dark:bg-[#162332] dark:hover:bg-[#1c2e42]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-[#c2362b] dark:text-[#ff8f85]">
                        {isArabic ? "الأخطاء والتحذيرات" : "Errors & Warnings"}
                      </span>
                      {exportScope === "errors_warnings" && <Check size={14} className="text-[#3f7a18] dark:text-[#c8f04a]" />}
                    </div>
                    <span className="mono text-xs font-semibold text-[#c2362b] dark:text-[#ff8f85] mt-1">
                      {stats.errors + stats.warnings} {isArabic ? "سطر" : "lines"}
                    </span>
                    <span className="text-[0.68rem] text-[#687584] dark:text-[#7f94a8] mt-0.5">
                      {isArabic ? "تركيز الأعطال ومشاكل النظام" : "Crash & warning triage"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Options & Filename */}
              <div className="space-y-3 rounded border border-[#e8dfcf] bg-[#faf7f0] p-3.5 dark:border-[#25394d] dark:bg-[#101b28]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={includeDebugHeader}
                      onChange={(e) => setIncludeDebugHeader(e.target.checked)}
                      className="h-4 w-4 accent-[#14253a] rounded"
                    />
                    <span>{isArabic ? "تضمين ترويسة تشخيصية في رأس الملف" : "Include diagnostic debugging header in .txt"}</span>
                  </label>
                  <span className="text-[0.68rem] text-[#687584] dark:text-[#8ea0b2]">
                    {isArabic ? "(معلومات الجهاز، التاريخ، الفلاتر)" : "(Device model, serial, timestamp, filters)"}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#526273] dark:text-[#a0b3c6]">
                      {isArabic ? "اسم الملف المراد حفظه:" : "Target filename:"}
                    </label>
                    {customFilename && (
                      <button
                        type="button"
                        onClick={() => setCustomFilename("")}
                        className="text-[0.68rem] text-[#1d5c8a] dark:text-[#79b4e5] hover:underline"
                      >
                        {isArabic ? "استعادة الاسم الافتراضي" : "Reset default name"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder={defaultFilename}
                      className="h-8 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-2.5 mono text-xs outline-none focus:border-[#14253a] dark:border-[#38526d] dark:bg-[#142232] dark:text-[#e4ebf2]"
                    />
                    <span className="mono text-xs px-2 py-1 rounded bg-[#eee7da] dark:bg-[#203246] text-[#526273] dark:text-[#9bb1c5]">
                      .txt
                    </span>
                  </div>
                </div>
              </div>

              {/* Live File Preview Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#687584] dark:text-[#8ea0b2] flex items-center gap-1.5">
                    <FileText size={12} />
                    {isArabic ? "معاينة محتوى الملف (.txt Preview):" : "File Content Preview (.txt):"}
                  </span>
                  <span className="mono text-[0.68rem] text-[#526273] dark:text-[#98acc0]">
                    ~{previewData.sizeKb} KB · {previewData.linesCount} lines
                  </span>
                </div>
                <pre className="mono h-36 overflow-y-auto overflow-x-auto rounded border border-[#2b3c4f] bg-[#0c131c] p-3 text-[0.68rem] leading-4 text-[#cfd9e4]">
                  {previewData.snippet}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d8d1c4] bg-[#f7f3eb] px-5 py-3.5 dark:border-[#2f4860] dark:bg-[#0f1926]">
              <span className="mono text-xs text-[#687584] dark:text-[#8ca0b4]">
                {isArabic ? "الترميز: UTF-8 نص نقي" : "Format: UTF-8 Plain Text"}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportModalOpen(false)}
                  className="action-button text-xs h-8 px-3 border-[#d8d1c4] dark:border-[#3a526b]"
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyExportContent(exportScope, includeDebugHeader)}
                  className="action-button text-xs h-8 px-3 border-[#d8d1c4] dark:border-[#3a526b]"
                >
                  <Copy size={13} className="mr-1.5" />
                  {isArabic ? "نسخ النص" : "Copy Content"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => executeExportToTxt(exportScope, includeDebugHeader)}
                  className="action-button bg-[#14253a] hover:bg-[#20364e] text-[#f6f2ea] text-xs h-8 px-4 font-semibold dark:bg-[#c8f04a] dark:text-[#14253a] dark:hover:bg-[#d6fa5c]"
                >
                  <Download size={13} className="mr-1.5" />
                  {isArabic ? "تنزيل ملف .txt الآن" : "Download .txt File"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
