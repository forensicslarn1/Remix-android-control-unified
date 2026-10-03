import React, { useState, useEffect, useCallback, useMemo } from "react";
import JSZip from "jszip";
import type { BrowserAdbClient } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileArchive,
  Download,
  Upload,
  Smartphone,
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Layers,
  FileCode,
  Radio,
  FileCheck2,
  Loader2,
  Copy,
  Check,
  ArrowRight,
  Filter,
  Eye,
  Activity,
  HardDrive,
} from "lucide-react";
import {
  parseAxml,
  type ParsedAndroidManifest,
  type ComponentEntry,
  type ManifestPermission,
} from "@/utils/axmlParser";
import {
  recordApkForensicSummary,
  lookupAppLabel,
  type ApkStaticForensicSummary,
} from "@/services/forensicAuditService";

export interface ApkInspectorWorkspaceProps {
  client: BrowserAdbClient | null;
  isConnected: boolean;
  language?: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    serial?: string;
  } | null;
}

export const ApkInspectorWorkspace: React.FC<ApkInspectorWorkspaceProps> = ({
  client,
  isConnected,
  language = "en",
  device,
}) => {
  const isArabic = language === "ar";

  // Tab & Input modes: "device" | "local"
  const [sourceMode, setSourceMode] = useState<"device" | "local">("device");

  // Installed device packages
  const [installedPackages, setInstalledPackages] = useState<{ id: string; label: string }[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedDevicePkg, setSelectedDevicePkg] = useState("");
  const [deviceSearchQuery, setDeviceSearchQuery] = useState("");

  // Local file
  const [localFile, setLocalFile] = useState<File | null>(null);

  // Transfer & Parsing status
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<string>("");
  const [transferProgress, setTransferProgress] = useState<{ transferredMb: number; totalMb?: number; percent?: number }>({
    transferredMb: 0,
  });

  // Analysis result
  const [rawApkBytes, setRawApkBytes] = useState<Uint8Array | null>(null);
  const [apkSha256, setApkSha256] = useState<string>("");
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<ParsedAndroidManifest | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Filters for Permissions & Exported Components
  const [permFilter, setPermFilter] = useState<"all" | "dangerous" | "normal">("all");
  const [permSearch, setPermSearch] = useState("");
  const [compFilter, setCompFilter] = useState<"all" | "activity" | "service" | "receiver" | "provider">("all");
  const [compSearch, setCompSearch] = useState("");

  // Fetch installed third-party & user packages on device
  const refreshInstalledPackages = useCallback(async () => {
    if (!client || !isConnected) return;
    setLoadingPackages(true);
    try {
      const res = await client.run("pm list packages -3 -f || pm list packages -f || pm list packages");
      if (res.exitCode === 0 && res.stdout) {
        const lines = res.stdout.split(/[\r\n]+/);
        const pkgs: { id: string; label: string }[] = [];
        const seen = new Set<string>();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("package:")) continue;
          // package:/data/app/.../base.apk=com.example.app OR package:com.example.app
          let pkgId = "";
          if (trimmed.includes("=")) {
            pkgId = trimmed.split("=").pop()?.trim() || "";
          } else {
            pkgId = trimmed.replace("package:", "").trim();
          }

          if (pkgId && !seen.has(pkgId)) {
            seen.add(pkgId);
            const humanLabel = lookupAppLabel(pkgId);
            pkgs.push({ id: pkgId, label: humanLabel });
          }
        }

        pkgs.sort((a, b) => a.label.localeCompare(b.label));
        setInstalledPackages(pkgs);
        if (pkgs.length > 0 && !selectedDevicePkg) {
          setSelectedDevicePkg(pkgs[0].id);
        }
      }
    } catch (err) {
      console.warn("Could not list packages:", err);
    } finally {
      setLoadingPackages(false);
    }
  }, [client, isConnected, selectedDevicePkg]);

  useEffect(() => {
    if (isConnected && client) {
      void refreshInstalledPackages();
    }
  }, [isConnected, client, refreshInstalledPackages]);

  // Compute SHA-256 hash using native Web Cryptography API
  const computeBufferSha256 = async (bytes: Uint8Array): Promise<string> => {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Inspect APK buffer (unzip and parse manifest)
  const processApkBuffer = async (
    bytes: Uint8Array,
    source: "device-pull" | "local-upload",
    sourcePkgName?: string
  ) => {
    setIsProcessing(true);
    setProcessingPhase(isArabic ? "حساب تجزئة SHA-256 للملف الثنائي..." : "Computing SHA-256 cryptographic checksum...");

    try {
      const sha256 = await computeBufferSha256(bytes);
      setApkSha256(sha256);
      setFileSizeBytes(bytes.byteLength);
      setRawApkBytes(bytes);

      setProcessingPhase(isArabic ? "استخراج وفك ضغط حزمة APK في المتصفح..." : "Decompressing APK zip structure in browser...");
      const zip = await JSZip.loadAsync(bytes);

      const manifestFile = zip.file("AndroidManifest.xml");
      if (!manifestFile) {
        throw new Error(
          isArabic
            ? "لم يتم العثور على ملف AndroidManifest.xml داخل الحزمة"
            : "No AndroidManifest.xml found inside the selected APK archive."
        );
      }

      setProcessingPhase(isArabic ? "فك تشفير بيان Android Binary XML (AXML)..." : "Decoding Android Binary XML (AXML) AST...");
      const manifestBytes = await manifestFile.async("uint8array");
      const parsed = parseAxml(manifestBytes);

      // If package name was uncaptured, fallback to sourcePkgName
      if ((!parsed.packageName || parsed.packageName === "unknown.package") && sourcePkgName) {
        parsed.packageName = sourcePkgName;
      }

      setAnalysisResult(parsed);

      // Automatically construct and cache forensic summary
      const summary: ApkStaticForensicSummary = {
        inspectedAt: new Date().toISOString(),
        source,
        packageName: parsed.packageName,
        appName: parsed.application.label || lookupAppLabel(parsed.packageName),
        versionName: parsed.versionName,
        versionCode: parsed.versionCode,
        minSdkVersion: parsed.minSdkVersion,
        targetSdkVersion: parsed.targetSdkVersion,
        fileSizeBytes: bytes.byteLength,
        sha256Checksum: sha256,
        flags: {
          debuggable: parsed.application.debuggable,
          allowBackup: parsed.application.allowBackup,
          usesCleartextTraffic: parsed.application.usesCleartextTraffic,
          networkSecurityConfig: parsed.application.networkSecurityConfig,
        },
        totalPermissions: parsed.permissions.length,
        dangerousPermissionsCount: parsed.permissions.filter((p) => p.isDangerous).length,
        dangerousPermissionsList: parsed.permissions.filter((p) => p.isDangerous).map((p) => p.name),
        totalComponents:
          parsed.activities.length + parsed.services.length + parsed.receivers.length + parsed.providers.length,
        exportedComponentsCount: parsed.exportedComponents.length,
        exportedComponentsSummary: parsed.exportedComponents.slice(0, 30).map((c) => ({
          name: c.name,
          type: c.type,
          permission: c.permission,
        })),
      };

      recordApkForensicSummary(summary);
      toast.success(
        isArabic
          ? `اكتمل الفحص الثابت للتطبيق: ${parsed.application.label || parsed.packageName}`
          : `Static inspection complete for ${parsed.application.label || parsed.packageName}`
      );
    } catch (err: any) {
      console.error("APK processing failed:", err);
      toast.error(err?.message || "Failed analyzing APK");
      setAnalysisResult(null);
    } finally {
      setIsProcessing(false);
      setProcessingPhase("");
    }
  };

  // Pipeline 1: Pull from Connected Device via ADB
  const handlePullFromDevice = async () => {
    if (!client || !isConnected) {
      toast.error(isArabic ? "الرجاء توصيل الجهاز أولاً" : "Connect an Android device via WebUSB first");
      return;
    }
    if (!selectedDevicePkg) {
      toast.error(isArabic ? "الرجاء اختيار حزمة من القائمة" : "Select a package to pull");
      return;
    }

    setIsProcessing(true);
    setProcessingPhase(isArabic ? `تحديد مسار الحزمة ${selectedDevicePkg}...` : `Locating APK path for ${selectedDevicePkg}...`);
    setTransferProgress({ transferredMb: 0 });

    try {
      // 1. Locate base.apk path on device
      const pathRes = await client.run(`pm path ${selectedDevicePkg}`);
      if (pathRes.exitCode !== 0 || !pathRes.stdout) {
        throw new Error(
          isArabic
            ? `تعذر العثور على ملف APK للحزمة: ${pathRes.stderr || "مسار غير معروف"}`
            : `Could not locate APK path: ${pathRes.stderr || "Unknown path"}`
        );
      }

      // pm path outputs: package:/data/app/.../base.apk (can have split APKs on multi-line)
      const lines = pathRes.stdout.split(/[\r\n]+/);
      const baseLine = lines.find((l) => l.includes("base.apk")) || lines[0];
      const remoteApkPath = baseLine.replace(/^package:/i, "").trim();

      if (!remoteApkPath) {
        throw new Error("Invalid APK path returned by pm path");
      }

      // Get file size via stat/ls
      let totalBytes: number | undefined = undefined;
      try {
        const statRes = await client.run(`stat -c %s "${remoteApkPath}" 2>/dev/null || ls -l "${remoteApkPath}"`);
        if (statRes.stdout) {
          const match = statRes.stdout.trim().match(/^(\d+)$/) || statRes.stdout.match(/\s+(\d+)\s+[A-Za-z]{3}\s+/);
          if (match) {
            totalBytes = parseInt(match[1], 10);
          }
        }
      } catch {}

      const totalMb = totalBytes ? totalBytes / (1024 * 1024) : undefined;

      setProcessingPhase(isArabic ? `نقل ملف APK عبر قناة ADB Sync...` : `Streaming APK over ADB Sync stream...`);

      // 2. Stream APK file via pullFile
      const apkData = await client.pullFile(remoteApkPath, (transferred) => {
        const transferredMb = transferred / (1024 * 1024);
        const percent = totalBytes ? Math.min(100, Math.round((transferred / totalBytes) * 100)) : undefined;
        setTransferProgress({ transferredMb, totalMb, percent });
      });

      // 3. Process decompressed APK
      await processApkBuffer(apkData, "device-pull", selectedDevicePkg);
    } catch (err: any) {
      console.error("Device pull failed:", err);
      toast.error(err?.message || "Failed pulling APK from device");
      setIsProcessing(false);
      setProcessingPhase("");
    }
  };

  // Pipeline 2: Process uploaded local file
  const handleLocalFileSelected = async (file: File) => {
    setLocalFile(file);
    setIsProcessing(true);
    setProcessingPhase(isArabic ? "قراءة ملف APK من القرص المحلي..." : "Reading local APK file into memory buffer...");

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      await processApkBuffer(uint8, "local-upload");
    } catch (err: any) {
      toast.error(err?.message || "Could not read local file");
      setIsProcessing(false);
      setProcessingPhase("");
    }
  };

  // Save / Download APK to local disk
  const handleDownloadApk = () => {
    if (!rawApkBytes) return;
    const name = analysisResult?.packageName ? `${analysisResult.packageName}.apk` : "package.apk";
    const blob = new Blob([rawApkBytes as unknown as BlobPart], { type: "application/vnd.android.package-archive" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(isArabic ? `تم حفظ ملف APK محلياً (${name})` : `Saved ${name} to local disk`);
  };

  // Copy SHA-256
  const copySha256 = () => {
    if (!apkSha256) return;
    navigator.clipboard.writeText(apkSha256);
    setCopiedHash(true);
    toast.success(isArabic ? "تم نسخ تجزئة SHA-256 إلى الحافظة" : "SHA-256 copied to clipboard");
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Forward findings into forensic audit
  const handleAnchorForensicReport = () => {
    if (!analysisResult || !apkSha256) {
      toast.error(isArabic ? "لا توجد نتائج فحص لتضمينها" : "No inspection findings to anchor");
      return;
    }

    const summary: ApkStaticForensicSummary = {
      inspectedAt: new Date().toISOString(),
      source: sourceMode === "device" ? "device-pull" : "local-upload",
      packageName: analysisResult.packageName,
      appName: analysisResult.application.label || lookupAppLabel(analysisResult.packageName),
      versionName: analysisResult.versionName,
      versionCode: analysisResult.versionCode,
      minSdkVersion: analysisResult.minSdkVersion,
      targetSdkVersion: analysisResult.targetSdkVersion,
      fileSizeBytes: fileSizeBytes,
      sha256Checksum: apkSha256,
      flags: {
        debuggable: analysisResult.application.debuggable,
        allowBackup: analysisResult.application.allowBackup,
        usesCleartextTraffic: analysisResult.application.usesCleartextTraffic,
        networkSecurityConfig: analysisResult.application.networkSecurityConfig,
      },
      totalPermissions: analysisResult.permissions.length,
      dangerousPermissionsCount: analysisResult.permissions.filter((p) => p.isDangerous).length,
      dangerousPermissionsList: analysisResult.permissions.filter((p) => p.isDangerous).map((p) => p.name),
      totalComponents:
        analysisResult.activities.length +
        analysisResult.services.length +
        analysisResult.receivers.length +
        analysisResult.providers.length,
      exportedComponentsCount: analysisResult.exportedComponents.length,
      exportedComponentsSummary: analysisResult.exportedComponents.slice(0, 30).map((c) => ({
        name: c.name,
        type: c.type,
        permission: c.permission,
      })),
    };

    recordApkForensicSummary(summary);
    toast.success(
      isArabic
        ? "تم إرسال نتائج الفحص الثابت وتضمينها في التقرير الجنائي المشفر"
        : "Static reconnaissance findings anchored into forensic audit certificate"
    );
  };

  // Filtered packages on device
  const filteredInstalledPackages = useMemo(() => {
    if (!deviceSearchQuery.trim()) return installedPackages;
    const q = deviceSearchQuery.toLowerCase().trim();
    return installedPackages.filter(
      (p) => p.id.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
    );
  }, [installedPackages, deviceSearchQuery]);

  // Filtered permissions
  const filteredPermissions = useMemo(() => {
    if (!analysisResult) return [];
    let list = analysisResult.permissions;
    if (permFilter === "dangerous") {
      list = list.filter((p) => p.isDangerous);
    } else if (permFilter === "normal") {
      list = list.filter((p) => !p.isDangerous);
    }

    if (permSearch.trim()) {
      const q = permSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.descriptionEn.toLowerCase().includes(q) ||
          p.descriptionAr.includes(q)
      );
    }

    return list;
  }, [analysisResult, permFilter, permSearch]);

  // Filtered components (attack surface)
  const filteredComponents = useMemo(() => {
    if (!analysisResult) return [];
    let list = analysisResult.exportedComponents;
    if (compFilter !== "all") {
      list = list.filter((c) => c.type === compFilter);
    }

    if (compSearch.trim()) {
      const q = compSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.permission && c.permission.toLowerCase().includes(q)) ||
          c.actions.some((a) => a.toLowerCase().includes(q))
      );
    }

    return list;
  }, [analysisResult, compFilter, compSearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#14253a] text-[#c8f04a] flex items-center justify-center font-bold">
              <FileArchive className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "فاحص حزم أندرويد والاستطلاع الثابت (APK Inspector)" : "APK Inspector & Static Reconnaissance"}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#f4ede2] dark:bg-slate-800 text-[#534335] dark:text-slate-300 border border-[#d8d1c4] dark:border-slate-700">
                  05 APK RECON
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>CLIENT-SIDE AXML</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isArabic
                  ? "سحب وفك حزم APK داخل المتصفح، وتحليل بيان AndroidManifest.xml، وتدقيق الأذونات ونقاط الدخول المصدرة"
                  : "Zero-dependency client-side AXML AST parser, APK pull stream, SHA-256 integrity, permissions audit & attack surface triage"}
              </p>
            </div>
          </div>

          {/* Source Mode Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setSourceMode("device")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  sourceMode === "device"
                    ? "bg-[#14253a] text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{isArabic ? "سحب من الجهاز" : "Pull from Phone"}</span>
              </button>
              <button
                onClick={() => setSourceMode("local")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  sourceMode === "local"
                    ? "bg-[#14253a] text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isArabic ? "رفع ملف محلي" : "Analyze Local APK"}</span>
              </button>
            </div>

            {analysisResult && (
              <Button
                variant="default"
                size="sm"
                onClick={handleAnchorForensicReport}
                className="bg-[#274b35] hover:bg-[#1e3c29] text-white text-xs gap-1.5 shadow-xs"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>{isArabic ? "تثبيت بالتقرير الجنائي" : "Anchor to Forensic"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* 2. Dual-Source Selection Panel */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          {sourceMode === "device" ? (
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedDevicePkg}
                    onChange={(e) => setSelectedDevicePkg(e.target.value)}
                    disabled={isProcessing || !isConnected || installedPackages.length === 0}
                    className="w-full text-xs py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:border-cyan-500 font-mono text-slate-800 dark:text-slate-200"
                  >
                    {filteredInstalledPackages.length === 0 ? (
                      <option value="">{isConnected ? "No packages matched" : "Connect phone to load packages"}</option>
                    ) : (
                      filteredInstalledPackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({p.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="w-48 relative hidden sm:block">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder={isArabic ? "تصفية الحزم..." : "Filter packages..."}
                    value={deviceSearchQuery}
                    onChange={(e) => setDeviceSearchQuery(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshInstalledPackages}
                  disabled={loadingPackages || !isConnected}
                  className="text-xs h-8 px-2 border-slate-300 dark:border-slate-700"
                  title="Reload package list"
                >
                  <Loader2 className={`w-3.5 h-3.5 ${loadingPackages ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <Button
                onClick={handlePullFromDevice}
                disabled={isProcessing || !isConnected || !selectedDevicePkg}
                className="bg-[#14253a] hover:bg-[#223952] text-white text-xs gap-1.5 shadow-xs"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isArabic ? "سحب وفحص الحزمة" : "Pull & Analyze"}</span>
              </Button>
            </div>
          ) : (
            <div>
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500 transition-colors bg-slate-50/50 dark:bg-slate-800/30">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isArabic
                    ? "اختر ملف APK أو اسحبه إلى هنا لبدء الفحص الثابت"
                    : "Select or drag an offline .apk file to decompress & inspect"}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 font-mono">
                  {localFile ? `${localFile.name} (${(localFile.size / (1024 * 1024)).toFixed(2)} MB)` : "Max 200MB · Decoded locally via WebAssembly & Web Workers"}
                </span>
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLocalFileSelected(f);
                  }}
                />
              </label>
            </div>
          )}

          {/* Processing Progress Bar */}
          {isProcessing && (
            <div className="mt-4 p-3 bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 rounded-lg">
              <div className="flex items-center justify-between text-xs text-cyan-800 dark:text-cyan-300 font-medium mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{processingPhase}</span>
                </span>
                {transferProgress.totalMb ? (
                  <span className="font-mono">
                    {transferProgress.transferredMb.toFixed(1)} / {transferProgress.totalMb.toFixed(1)} MB (
                    {transferProgress.percent}%)
                  </span>
                ) : (
                  <span className="font-mono">{transferProgress.transferredMb.toFixed(1)} MB</span>
                )}
              </div>
              <div className="w-full bg-cyan-200/50 dark:bg-cyan-900/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-600 dark:bg-cyan-400 h-full transition-all duration-200"
                  style={{ width: `${transferProgress.percent || 40}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Static Recon Dashboard (Rendered when analysisResult exists) */}
      {analysisResult ? (
        <div className="space-y-6">
          {/* Card 1: Package Overview & Cryptographic Fingerprint */}
          <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {analysisResult.application.label || analysisResult.packageName}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    v{analysisResult.versionName}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    (Code: {analysisResult.versionCode})
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                  Package: <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.packageName}</span>
                </div>
              </div>

              {/* Download APK Button */}
              {rawApkBytes && (
                <Button
                  onClick={handleDownloadApk}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 border-slate-300 dark:border-slate-700"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-600" />
                  <span>{isArabic ? "تحميل ملف APK" : "Save / Download APK"}</span>
                </Button>
              )}
            </div>

            {/* Checksum & SDK Specs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs mb-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 font-sans block uppercase">Binary File Size</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                </span>
                <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                  {fileSizeBytes.toLocaleString()} bytes
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 font-sans block uppercase">Min SDK / Target SDK</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  API {analysisResult.minSdkVersion} → API {analysisResult.targetSdkVersion}
                </span>
                <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                  Android Compatibility
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 font-sans block uppercase">Declared Permissions</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {analysisResult.permissions.length} Total
                </span>
                <span className="text-[10px] text-rose-500 font-sans font-bold block mt-0.5">
                  {analysisResult.permissions.filter((p) => p.isDangerous).length} Sensitive
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 font-sans block uppercase">Exported Attack Surface</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {analysisResult.exportedComponents.length} Entry Points
                </span>
                <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                  Accessible to other apps
                </span>
              </div>
            </div>

            {/* SHA-256 Hash Block */}
            <div className="p-3 bg-[#0a131e] rounded-lg border border-slate-800 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-slate-300 break-all text-[11px]">
                <span className="text-slate-500">SHA-256: </span>
                <span className="text-cyan-400 font-bold">{apkSha256}</span>
              </div>
              <Button
                onClick={copySha256}
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-400 hover:text-white shrink-0 gap-1"
              >
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedHash ? (isArabic ? "تم النسخ" : "Copied") : isArabic ? "نسخ" : "Copy"}</span>
              </Button>
            </div>
          </div>

          {/* Card 2: Security Posture & Vulnerability Flags */}
          <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>{isArabic ? "مؤشرات الأمان والوضعية الأمنية" : "Security Posture & Manifest Flags"}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Flag 1: Debuggable */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  analysisResult.application.debuggable
                    ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800"
                    : "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
                      Debuggable
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        analysisResult.application.debuggable
                          ? "bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200"
                          : "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      {analysisResult.application.debuggable ? "TRUE (CRITICAL)" : "FALSE (SECURE)"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {analysisResult.application.debuggable
                      ? isArabic
                        ? "تحذير أمني: التطبيق مجمع في وضع التصحيح. يمكن ربط مصحح JDWP وقراءة الذاكرة بدون Root."
                        : "Vulnerability flag: Application is debuggable. Attackers can attach a JDWP debugger and dump memory without root."
                      : isArabic
                        ? "سليم: وضع التصحيح معطل. حماية ذاكرة التطبيق في بيئة الإنتاج مفعلة."
                        : "Nominal: Application cannot be attached via adb jdwp in standard production mode."}
                  </p>
                </div>
              </div>

              {/* Flag 2: AllowBackup */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  analysisResult.application.allowBackup
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800"
                    : "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
                      AllowBackup
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        analysisResult.application.allowBackup
                          ? "bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                          : "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      {analysisResult.application.allowBackup ? "TRUE (EXTRACTION RISK)" : "FALSE (RESTRICTED)"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {analysisResult.application.allowBackup
                      ? isArabic
                        ? "تنبيه استخراج: يسمح التطبيق بالنسخ الاحتياطي عبر adb backup، مما يمكن من استخراج قواعد البيانات والبيانات الخاصة."
                        : "Data extraction risk: App allows adb backup. Private databases, shared preferences, and tokens can be extracted via USB."
                      : isArabic
                        ? "سليم: تم حظر النسخ الاحتياطي الخارجي عبر ADB."
                        : "Nominal: adb backup is explicitly prohibited for private app storage."}
                  </p>
                </div>
              </div>

              {/* Flag 3: Cleartext Traffic & Network Security */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  analysisResult.application.usesCleartextTraffic
                    ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800"
                    : "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
                      Cleartext Traffic
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        analysisResult.application.usesCleartextTraffic
                          ? "bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200"
                          : "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      {analysisResult.application.usesCleartextTraffic ? "PERMITTED (HTTP)" : "HTTPS ONLY"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {analysisResult.application.usesCleartextTraffic
                      ? isArabic
                        ? "حركة بيانات غير مشفرة: يسمح التطبيق ببروتوكول HTTP العادي، مما يجعله عرضة لهجمات التنصت (Man-in-the-Middle)."
                        : "Insecure network protocol: App permits unencrypted HTTP traffic, susceptible to passive eavesdropping and MitM."
                      : isArabic
                        ? "تشفير إلزامي: يفرض التطبيق اتصالات TLS/HTTPS فقط عبر إعدادات أمان الشبكة."
                        : "Nominal: Cleartext HTTP traffic is blocked by system network security policy."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Permissions Audit */}
          <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  {isArabic ? "تدقيق الأذونات المصرح بها" : "Declared Permissions Audit"}
                </h3>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {analysisResult.permissions.length}
                </span>
              </div>

              {/* Perm Filter tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => setPermFilter("all")}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      permFilter === "all" ? "bg-white dark:bg-slate-700 font-bold shadow-xs" : "text-slate-500"
                    }`}
                  >
                    {isArabic ? "الكل" : "All"} ({analysisResult.permissions.length})
                  </button>
                  <button
                    onClick={() => setPermFilter("dangerous")}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      permFilter === "dangerous" ? "bg-white dark:bg-slate-700 font-bold text-rose-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    {isArabic ? "الحساسة / الخطرة" : "Sensitive Only"} (
                    {analysisResult.permissions.filter((p) => p.isDangerous).length})
                  </button>
                  <button
                    onClick={() => setPermFilter("normal")}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      permFilter === "normal" ? "bg-white dark:bg-slate-700 font-bold text-slate-700 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    {isArabic ? "القياسية" : "Normal"}
                  </button>
                </div>

                <div className="relative w-48">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder={isArabic ? "ابحث في الأذونات..." : "Search permissions..."}
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Permissions List */}
            <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPermissions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {isArabic ? "لا توجد أذونات تطابق التصفية." : "No permissions match the current filter."}
                </div>
              ) : (
                filteredPermissions.map((perm) => (
                  <div
                    key={perm.name}
                    className={`p-3 flex items-start justify-between gap-3 text-xs ${
                      perm.isDangerous ? "bg-rose-50/30 dark:bg-rose-950/20" : ""
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {perm.name}
                        </span>
                        {perm.isDangerous && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
                            {perm.category}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {isArabic ? perm.descriptionAr : perm.descriptionEn}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 ${
                        perm.isDangerous
                          ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 font-bold"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {perm.isDangerous ? "DANGEROUS" : "NORMAL"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 4: Exported Entry Points (Attack Surface) */}
          <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-amber-500" />
                  <span>{isArabic ? "نقاط الدخول المصدرة (سطح الهجوم)" : "Exported Entry Points (Attack Surface)"}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isArabic
                    ? "المكونات التي يمكن لأي تطبيق آخر تشغيلها أو إرسال أوامر إليها بدون إذن نظام مسبق"
                    : "Activities, Services, and Receivers reachable by third-party applications via IPC"}
                </p>
              </div>

              {/* Component filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => setCompFilter("all")}
                    className={`px-2 py-1 rounded transition-colors ${
                      compFilter === "all" ? "bg-white dark:bg-slate-700 font-bold shadow-xs" : "text-slate-500"
                    }`}
                  >
                    All ({analysisResult.exportedComponents.length})
                  </button>
                  <button
                    onClick={() => setCompFilter("activity")}
                    className={`px-2 py-1 rounded transition-colors ${
                      compFilter === "activity" ? "bg-white dark:bg-slate-700 font-bold text-blue-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    Activities ({analysisResult.activities.filter((c) => c.exported).length})
                  </button>
                  <button
                    onClick={() => setCompFilter("service")}
                    className={`px-2 py-1 rounded transition-colors ${
                      compFilter === "service" ? "bg-white dark:bg-slate-700 font-bold text-purple-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    Services ({analysisResult.services.filter((c) => c.exported).length})
                  </button>
                  <button
                    onClick={() => setCompFilter("receiver")}
                    className={`px-2 py-1 rounded transition-colors ${
                      compFilter === "receiver" ? "bg-white dark:bg-slate-700 font-bold text-amber-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    Receivers ({analysisResult.receivers.filter((c) => c.exported).length})
                  </button>
                </div>

                <div className="relative w-40">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder={isArabic ? "تصفية..." : "Filter..."}
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Components Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">{isArabic ? "نوع المكون" : "Type"}</th>
                      <th className="p-2.5">{isArabic ? "اسم الفئة (Class)" : "Component Class Name"}</th>
                      <th className="p-2.5">{isArabic ? "الحماية بالإذن" : "Permission Guard"}</th>
                      <th className="p-2.5">{isArabic ? "الإجراءات المتاحة" : "Intent Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                    {filteredComponents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400 font-sans text-xs">
                          {isArabic ? "لا توجد مكونات مصدرة مطابقة." : "No exported components match criteria."}
                        </td>
                      </tr>
                    ) : (
                      filteredComponents.map((comp, idx) => (
                        <tr
                          key={`${comp.type}-${comp.name}-${idx}`}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                            !comp.permission ? "bg-amber-50/20 dark:bg-amber-950/10" : ""
                          }`}
                        >
                          <td className="p-2.5 whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                comp.type === "activity"
                                  ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                  : comp.type === "service"
                                    ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
                                    : comp.type === "receiver"
                                      ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {comp.type}
                            </span>
                          </td>
                          <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200 break-all">
                            {comp.name}
                          </td>
                          <td className="p-2.5">
                            {comp.permission ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {comp.permission}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
                                {isArabic ? "مكشوف (بدون إذن)" : "UNGUARDED"}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-500 font-mono text-[10px] max-w-xs truncate">
                            {comp.actions.length > 0 ? comp.actions.join(", ") : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <FileArchive className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
            {isArabic ? "في انتظار اختيار حزمة APK للتحليل" : "Awaiting APK Package Selection"}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            {isArabic
              ? "اختر تطبيقاً مثبتاً على الهاتف لسحبه وفحصه عبر WebUSB، أو ارفع ملف APK محلي للتحليل الثابت الفوري."
              : "Pull an installed package directly from the connected device via ADB Sync, or select a local APK file to decompress and inspect the compiled manifest."}
          </p>
        </div>
      )}
    </div>
  );
};

export default ApkInspectorWorkspace;
