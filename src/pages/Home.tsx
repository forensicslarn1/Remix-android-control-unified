/**
 * Field Service Ledger style: device identity dominates the workbench while
 * every consequential activity gets an inspectable, local command receipt.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { BrowserAdbClient, DEBLOAT_EXECUTION_LEVELS, type DebloatExecutionLevel, type CommandResult, type DeviceFile, type DeviceProfile, type MirrorSession } from "@/lib/adbClient";
import { COMMUNITY_SOURCE, fetchCommunityCatalog, type CommunityPackage } from "@/lib/communityCatalog";
import AboutWorkspace from "@/components/AboutWorkspace";
import { DeGoogleWorkspace, type FavoriteAlternative } from "@/components/DeGoogleWorkspace";
import { EvidenceSnapshotWorkspace, type EvidenceOperation, type EvidenceOutcome } from "@/components/EvidenceSnapshotWorkspace";
import { FirstRunSetupDialog } from "@/components/FirstRunSetupDialog";
import { NotificationCenter, loadLocalNotifications } from "@/components/NotificationCenter";
import { type AppNotification, type NotificationTone } from "@/lib/notificationUtils";
import { LiveMirrorWorkspace, type MirrorState } from "@/components/LiveMirrorWorkspace";
import { ReceiptHistoryWorkspace, type HistoryReceipt } from "@/components/ReceiptHistoryWorkspace";
import { ApkInspectionWorkspace } from "@/components/ApkInspectionWorkspace";
import { ShortcutGuideDialog } from "@/components/ShortcutGuideDialog";
import { WebUsbConnectionManager } from "@/components/WebUsbConnectionManager";
import { LogcatViewer } from "@/components/LogcatViewer";
import { IoTTriageView } from "@/components/IoTTriageView";
import { DeviceDiagnosticsWorkspace } from "@/components/DeviceDiagnosticsWorkspace";
import { createCaseId, exportTimestampedCaseBundle } from "@/lib/caseBundle";
import { Activity, AlertTriangle, AppWindow, ArrowRight, ArrowUpDown, Boxes, Check, CheckCircle2, CheckSquare, ChevronRight, CircleAlert, ClipboardCheck, ClipboardList, Cpu, Download, Eye, EyeOff, FileArchive, FileText, Filter, Folder, HardDrive, History, HelpCircle, Info, Keyboard, Languages, Layers, ListFilter, Loader2, Lock, LockKeyhole, MonitorUp, Moon, PackageOpen, PauseCircle, Play, PlugZap, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Square, TerminalSquare, Trash2, Unplug, Upload, Usb, UsersRound, Sun, X } from "lucide-react";
import DebloaterWorkspace from "@/components/DebloaterWorkspace";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppCategoryBadge, PackageStatusBadge, DebloatExecutionBadge, CategoryGlyph } from "@/components/AppCategoryBadge";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import {
  APP_CATEGORIES,
  ALL_CATEGORY_IDS,
  classifyPackage,
  buildCategorizedInventory,
  sortCategorizedPackages,
  calculateCategoryStats,
  type AppCategoryId,
  type CategorizedPackage,
  type PackageStatus,
  type SortCriterion,
  type SortOrder,
} from "@/lib/packageCategories";

type Workspace = "overview" | "diagnostics" | "debloat" | "degoogle" | "logcat" | "iot-triage" | "privacy" | "mirror" | "profiles" | "apk" | "files" | "evidence" | "history" | "about";
type InterfaceLanguage = "en" | "ar" | "other";
type Receipt = CommandResult & { label: string; authority: "USB" | "Root" | "Browser"; restore?: string };
type ReceiptArchive = { id: string; name: string; createdAt: string; updatedAt: string; receipts: HistoryReceipt[] };

const nav: Array<{ id: Workspace; label: string; icon: typeof Smartphone }> = [
  { id: "overview", label: "Device desk", icon: Smartphone },
  { id: "diagnostics", label: "Device Diagnostics", icon: Activity },
  { id: "debloat", label: "Debloat", icon: PackageOpen },
  { id: "degoogle", label: "De-Google", icon: ShieldCheck },
  { id: "logcat", label: "Logcat", icon: TerminalSquare },
  { id: "iot-triage", label: "IoT DFIR Triage", icon: ShieldAlert },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "mirror", label: "Mirror", icon: MonitorUp },
  { id: "profiles", label: "Work profiles", icon: UsersRound },
  { id: "apk", label: "APK desk", icon: FileArchive },
  { id: "files", label: "Files", icon: Folder },
  { id: "evidence", label: "Evidence Snapshot", icon: ClipboardCheck },
  { id: "history", label: "Receipt history", icon: History },
  { id: "about", label: "About", icon: Info },
];

const languageCopy = {
  en: {
    direction: "ltr" as const,
    language: "Interface language",
    choices: { en: "English", ar: "العربية", other: "Other languages" },
    nav: { overview: "Device desk", diagnostics: "Device Diagnostics", debloat: "Debloat", degoogle: "De-Google", logcat: "Logcat", "iot-triage": "IoT DFIR Triage", privacy: "Privacy", mirror: "Mirror", profiles: "Work profiles", apk: "APK desk", files: "Files", evidence: "Evidence Snapshot", history: "Receipt history", about: "About" },
    ready: "ready",
    inspect: "Inspect first. Change only what you can explain.",
    about: "About Forensicslarn",
  },
  ar: {
    direction: "rtl" as const,
    language: "لغة الواجهة",
    choices: { en: "English", ar: "العربية", other: "لغات أخرى" },
    nav: { overview: "لوحة الجهاز", diagnostics: "تشخيص الجهاز", debloat: "تنظيف التطبيقات", degoogle: "إزالة Google", logcat: "سجل النظام (Logcat)", "iot-triage": "فحص IoT DFIR", privacy: "الخصوصية", mirror: "نسخ الشاشة", profiles: "ملفات العمل", apk: "حزمة APK", files: "الملفات", evidence: "لقطة الأدلة", history: "أرشيف الإيصالات", about: "حول" },
    ready: "جاهز",
    inspect: "افحص أولاً. غيّر فقط ما تستطيع شرحه.",
    about: "حول Forensicslarn",
  },
  other: {
    direction: "ltr" as const,
    language: "Interface language",
    choices: { en: "English", ar: "العربية", other: "Other languages" },
    nav: { overview: "Device desk", diagnostics: "Device Diagnostics", debloat: "Debloat", degoogle: "De-Google", logcat: "Logcat", "iot-triage": "IoT DFIR Triage", privacy: "Privacy", mirror: "Mirror", profiles: "Work profiles", apk: "APK desk", files: "Files", evidence: "Evidence Snapshot", history: "Receipt history", about: "About" },
    ready: "ready",
    inspect: "Inspect first. Change only what you can explain.",
    about: "About Forensicslarn",
  },
} as const;

const initialReceipt: Receipt = {
  label: "Session waiting",
  command: "No device command issued",
  stdout: "Connect a phone, approve USB debugging, and inventory will load locally.",
  stderr: "",
  exitCode: 0,
  at: new Date().toISOString(),
  authority: "Browser",
};

const RECEIPT_HISTORY_KEY = "acc-receipt-history-v1";
const RECEIPT_ARCHIVES_KEY = "acc-receipt-archives-v1";
const ACTIVE_RECEIPT_ARCHIVE_KEY = "acc-active-receipt-archive-v1";
const PRIMARY_ARCHIVE_ID = "primary";
const FIRST_RUN_SETUP_KEY = "acc-first-run-setup-v1";

function shortTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function levelTone(level: string) {
  if (level === "Recommended") return "text-[#527321] bg-[#eef8cd] border-[#b9da71]";
  if (level === "Advanced") return "text-[#8b5c1c] bg-[#fff0ce] border-[#e6c473]";
  if (level === "Expert") return "text-[#934639] bg-[#fbe5df] border-[#dba193]";
  return "text-[#697482] bg-[#eee9df] border-[#d8d1c4]";
}

function removalLabel(level: string, isArabic: boolean) {
  if (!isArabic) return level;
  if (level === "Recommended") return "موصى به";
  if (level === "Advanced") return "متقدم";
  if (level === "Expert") return "خبير";
  return "غير مصنف";
}

function commandName(command: string) {
  return command.length > 62 ? `${command.slice(0, 59)}…` : command;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isHistoryReceipt(value: unknown): value is HistoryReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<HistoryReceipt>;
  return typeof receipt.label === "string" && typeof receipt.command === "string" && typeof receipt.stdout === "string" && typeof receipt.stderr === "string" && typeof receipt.exitCode === "number" && typeof receipt.at === "string" && (receipt.authority === "USB" || receipt.authority === "Root" || receipt.authority === "Browser");
}

function loadReceiptArchives(): ReceiptArchive[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECEIPT_ARCHIVES_KEY) || "[]") as Partial<ReceiptArchive>[];
    const valid = stored
      .filter((archive): archive is ReceiptArchive => typeof archive?.id === "string" && typeof archive.name === "string" && typeof archive.createdAt === "string" && typeof archive.updatedAt === "string" && Array.isArray(archive.receipts))
      .map((archive) => ({ ...archive, receipts: archive.receipts.filter(isHistoryReceipt).slice(0, 240) }));
    if (valid.length) return valid.slice(0, 24);
  } catch { /* migrate legacy browser-local history below */ }
  const now = new Date().toISOString();
  try {
    const legacy = JSON.parse(localStorage.getItem(RECEIPT_HISTORY_KEY) || "[]") as unknown[];
    return [{ id: PRIMARY_ARCHIVE_ID, name: "Primary ledger", createdAt: now, updatedAt: now, receipts: legacy.filter(isHistoryReceipt).slice(0, 240) }];
  } catch {
    return [{ id: PRIMARY_ARCHIVE_ID, name: "Primary ledger", createdAt: now, updatedAt: now, receipts: [] }];
  }
}

export default function Home() {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const adb = useRef(new BrowserAdbClient());
  const mirrorCanvas = useRef<HTMLCanvasElement | null>(null);
  const mirrorSession = useRef<MirrorSession | null>(null);
  const { theme, toggleTheme } = useTheme();
  const [active, setActive] = useState<Workspace>("overview");
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState<string | null>(null);
  const [root, setRoot] = useState(false);
  const [packages, setPackages] = useState<string[]>([]);
  const [disabledPackages, setDisabledPackages] = useState<string[]>([]);
  const [uninstalledPackages, setUninstalledPackages] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CommunityPackage[]>([]);
  const [catalogTime, setCatalogTime] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([initialReceipt]);
  const [receiptArchives, setReceiptArchives] = useState<ReceiptArchive[]>(loadReceiptArchives);
  const [activeReceiptArchiveId, setActiveReceiptArchiveId] = useState(() => localStorage.getItem(ACTIVE_RECEIPT_ARCHIVE_KEY) || PRIMARY_ARCHIVE_ID);
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [filePath, setFilePath] = useState("/sdcard/Download");
  const [fileLoading, setFileLoading] = useState(false);
  const [userOutput, setUserOutput] = useState("");
  const [terminal, setTerminal] = useState("");
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [language, setLanguage] = useState<InterfaceLanguage>(() => (localStorage.getItem("acc-language") as InterfaceLanguage) || "en");
  const [mirrorState, setMirrorState] = useState<MirrorState>({ phase: "idle", detail: "Connect and authorize a device, then start an explicit local Scrcpy session." });
  const [recoveryScriptName, setRecoveryScriptName] = useState("android-control-recovery");
  const [setupOpen, setSetupOpen] = useState(() => !localStorage.getItem(FIRST_RUN_SETUP_KEY));
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(loadLocalNotifications);

  const activeReceiptArchive = useMemo(() => receiptArchives.find((archive) => archive.id === activeReceiptArchiveId) || receiptArchives[0], [receiptArchives, activeReceiptArchiveId]);
  const receiptHistory = activeReceiptArchive?.receipts || [];
  const browserCapabilities = useMemo(() => ({
    usb: typeof navigator !== "undefined" && "usb" in navigator,
    crypto: Boolean(globalThis.crypto?.subtle),
    codecs: typeof window !== "undefined" && "VideoDecoder" in window,
  }), []);
  const setReceiptHistory = (next: HistoryReceipt[] | ((current: HistoryReceipt[]) => HistoryReceipt[])) => {
    const archiveId = activeReceiptArchive?.id || PRIMARY_ARCHIVE_ID;
    setReceiptArchives((current) => current.map((archive) => {
      if (archive.id !== archiveId) return archive;
      const receipts = typeof next === "function" ? next(archive.receipts) : next;
      return { ...archive, receipts: receipts.slice(0, 240), updatedAt: new Date().toISOString() };
    }));
  };

  const categorizedInventory = useMemo(() => {
    return buildCategorizedInventory(packages, catalog, disabledPackages, uninstalledPackages);
  }, [packages, catalog, disabledPackages, uninstalledPackages]);

  const categoryStats = useMemo(() => {
    return calculateCategoryStats(categorizedInventory);
  }, [categorizedInventory]);

  const addNotification = (tone: NotificationTone, title: { en: string; ar: string }, body: { en: string; ar: string }) => {
    const id = `notification-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const notification: AppNotification = { id, tone, title, body, createdAt: new Date().toISOString(), read: false };
    setNotifications((current) => [notification, ...current].slice(0, 100));
  };

  const addReceipt = (result: CommandResult, label: string, authority: Receipt["authority"] = "USB", restore?: string, notify: boolean = true) => {
    const receipt = { ...result, label, authority, restore };
    setReceipts((current) => [receipt, ...current].slice(0, 60));
    setReceiptHistory((current) => [receipt, ...current].slice(0, 240));
    if (notify) {
      const successful = result.exitCode === 0;
      addNotification(successful ? "success" : "error", successful ? { en: "Operation recorded", ar: "تم تسجيل العملية" } : { en: "Operation needs attention", ar: "العملية تحتاج إلى مراجعة" }, { en: `${label}: ${commandName(result.command)}`, ar: `${label}: ${commandName(result.command)}` });
    }
  };

  useEffect(() => {
    const missing = [
      !browserCapabilities.usb ? "WebUSB" : "",
      !browserCapabilities.crypto ? "Web Crypto" : "",
      !browserCapabilities.codecs ? "WebCodecs" : "",
    ].filter(Boolean);
    if (missing.length) {
      const summary = missing.join(", ");
      addNotification("warning", { en: "Browser readiness needs attention", ar: "جاهزية المتصفح تحتاج إلى انتباه" }, { en: `${summary} is unavailable; affected workflows will stay disabled or limited.`, ar: `${summary} غير متاح؛ ستبقى العمليات المتأثرة معطلة أو محدودة.` });
    }
  }, [browserCapabilities]);

  const downloadLocal = (filename: string, contents: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const runEvidenceOperation = async (operation: EvidenceOperation) => {
    try {
      const result = await adb.current.run(operation.command);
      addReceipt(result, `Evidence snapshot · ${operation.label}`);
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Evidence operation could not run.";
      const result: CommandResult = { command: operation.command, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() };
      addReceipt(result, `Evidence snapshot failed · ${operation.label}`);
      return result;
    }
  };

  const exportEvidenceCase = (outcomes: EvidenceOutcome[], selectedOperations: EvidenceOperation[]) => {
    if (!outcomes.length) return;
    const caseId = createCaseId("evidence-snapshot");
    const operations = new Map(selectedOperations.map((operation) => [operation.id, operation]));
    const report = outcomes.map((outcome) => {
      const operation = operations.get(outcome.id);
      return [`## ${operation?.label || outcome.id}`, "", `- **Status:** ${outcome.status}`, `- **Command:** \`${outcome.result?.command || operation?.command || "(not run)"}\``, `- **Completed:** ${outcome.completedAt || "(not completed)"}`, "", "```text", outcome.result?.stderr || outcome.result?.stdout || "(no output)", "```", ""].join("\n");
    }).join("\n");
    exportTimestampedCaseBundle(caseId, { caseType: "authorized-evidence-snapshot", device: device ? { manufacturer: device.manufacturer, model: device.model, androidVersion: device.androidVersion, sdk: device.sdk, serial: device.serial } : null, selectedOperationIds: selectedOperations.map((operation) => operation.id), note: "Browser-local export. Android permission denials and failed operations remain visible." }, [{ name: "evidence/collection-results.md", content: `# Evidence Snapshot\n\nCase: ${caseId}\n\n${report}` }, { name: "evidence/outcomes.json", content: JSON.stringify(outcomes, null, 2) }]);
    addNotification("success", { en: "Evidence bundle exported", ar: "تم تصدير حزمة الأدلة" }, { en: `${caseId}.zip is ready in this browser.`, ar: `الملف ${caseId}.zip جاهز في هذا المتصفح.` });
    toast.success(language === "ar" ? "تم تصدير حزمة الأدلة محلياً." : "Evidence case bundle exported locally.");
  };

  const exportFavoriteCase = (favorites: FavoriteAlternative[]) => {
    if (!favorites.length) return;
    const caseId = createCaseId("migration-shortlist");
    const report = [`# Saved Alternative Migration Shortlist`, "", `Case: ${caseId}`, `Created: ${new Date().toISOString()}`, "", "These are user-selected links. Nothing was downloaded or installed.", "", ...favorites.flatMap((favorite, index) => [`## ${index + 1}. ${favorite.name}`, "", `- **Replaces:** ${favorite.replaces}`, `- **Category:** ${favorite.category}`, `- **Source:** ${favorite.source}`, `- **Minimum Android:** ${favorite.minAndroid ? `${favorite.minAndroid}+` : "not verified"}`, `- **Direct link:** ${favorite.url}`, ""])].join("\n");
    exportTimestampedCaseBundle(caseId, { caseType: "degoogle-alternative-migration", favorites: favorites.length, note: "User-selected alternatives only. The bundle has no download payloads or automated install instructions." }, [{ name: "migration/favorites.md", content: report }, { name: "migration/favorites.json", content: JSON.stringify(favorites, null, 2) }]);
    addNotification("success", { en: "Migration bundle exported", ar: "تم تصدير حزمة الانتقال" }, { en: `${caseId}.zip contains the selected Favorites plan.`, ar: `يحتوي ${caseId}.zip على خطة المفضلة المختارة.` });
    toast.success(language === "ar" ? "تم تصدير حزمة انتقال المفضلة محلياً." : "Favorite migration case bundle exported locally.");
  };

  const exportReceipts = (format: "json" | "md") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      downloadLocal(`android-control-receipts-${stamp}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), receipts }, null, 2), "application/json");
    } else {
      const report = [`# Android Control Center — Command Receipts`, "", `Exported: ${new Date().toISOString()}`, "", ...receipts.flatMap((receipt, index) => [`## ${index + 1}. ${receipt.label}`, "", `- **Authority:** ${receipt.authority}`, `- **Time:** ${receipt.at}`, `- **Command:** \`${receipt.command}\``, `- **Exit code:** ${receipt.exitCode}`, `- **Output:** ${receipt.stderr || receipt.stdout || "(none)"}`, receipt.restore ? `- **Restore:** \`${receipt.restore}\`` : "", ""])].join("\n");
      downloadLocal(`android-control-receipts-${stamp}.md`, report, "text/markdown");
    }
    addNotification("success", { en: "Receipt export saved", ar: "تم حفظ تصدير الإيصالات" }, { en: `The ${format.toUpperCase()} ledger export was downloaded locally.`, ar: `تم تنزيل تصدير السجل بصيغة ${format.toUpperCase()} محلياً.` });
    toast.success("Receipt export saved locally.");
  };

  const exportRecoveryScript = () => {
    const restoreItems = receipts.filter((receipt) => receipt.restore);
    if (!restoreItems.length) {
      toast.error("There are no recorded package restoration commands yet.");
      return;
    }
    const safeName = recoveryScriptName.trim().replace(/[^A-Za-z0-9._-]/g, "-") || "android-control-recovery";
    const script = ["#!/usr/bin/env sh", "# Generated locally by Android Control Center.", "# Review every line before executing against a connected Android device.", "set -eu", "", "adb wait-for-device", "", ...restoreItems.flatMap((receipt) => [`# ${receipt.label}`, `adb shell ${receipt.restore}`, ""])].join("\n");
    downloadLocal(`${safeName}.sh`, script, "text/x-shellscript");
    addNotification("success", { en: "Recovery script saved", ar: "تم حفظ سكربت الاستعادة" }, { en: `${safeName}.sh was downloaded locally for review.`, ar: `تم تنزيل ${safeName}.sh محلياً للمراجعة.` });
    toast.success("Recovery script saved locally. Review it before running.");
  };

  const exportHistory = (format: "json" | "md") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveName = activeReceiptArchive?.name || "receipt-archive";
    const safeArchiveName = archiveName.trim().replace(/[^A-Za-z0-9._-]/g, "-") || "receipt-archive";
    if (format === "json") {
      downloadLocal(`android-control-${safeArchiveName}-${stamp}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), archiveName, receipts: receiptHistory }, null, 2), "application/json");
    } else {
      const report = [`# Android Control Center — ${archiveName}`, "", `Exported: ${new Date().toISOString()}`, "", ...receiptHistory.flatMap((receipt, index) => [`## ${index + 1}. ${receipt.label}`, "", `- **Authority:** ${receipt.authority}`, `- **Time:** ${receipt.at}`, `- **Command:** \`${receipt.command}\``, `- **Exit code:** ${receipt.exitCode}`, `- **Output:** ${receipt.stderr || receipt.stdout || "(none)"}`, receipt.restore ? `- **Restore:** \`${receipt.restore}\`` : "", ""])].join("\n");
      downloadLocal(`android-control-${safeArchiveName}-${stamp}.md`, report, "text/markdown");
    }
    addNotification("success", { en: "Archive export saved", ar: "تم حفظ تصدير الأرشيف" }, { en: `${archiveName} was exported locally as ${format.toUpperCase()}.`, ar: `تم تصدير ${archiveName} محلياً بصيغة ${format.toUpperCase()}.` });
    toast.success(language === "ar" ? "تم حفظ تصدير الأرشيف محلياً." : "Receipt-history export saved locally.");
  };

  const protectHistory = async (password: string) => {
    if (password.length < 10) {
      toast.error(language === "ar" ? "استخدم كلمة مرور من 10 أحرف على الأقل." : "Use a password with at least 10 characters.");
      return;
    }
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this browser context.");
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const archiveName = activeReceiptArchive?.name || "receipt-archive";
    const safeArchiveName = archiveName.trim().replace(/[^A-Za-z0-9._-]/g, "-") || "receipt-archive";
    const payload = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), archiveName, receipts: receiptHistory });
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(payload)));
    const envelope = { format: "android-control-encrypted-history", version: 1, cipher: "AES-256-GCM", kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 250000, salt: bytesToBase64(salt) }, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadLocal(`android-control-${safeArchiveName}-${stamp}.encrypted.json`, JSON.stringify(envelope, null, 2), "application/json");
    addNotification("success", { en: "Encrypted archive exported", ar: "تم تصدير الأرشيف المشفر" }, { en: `${archiveName} was encrypted and downloaded locally.`, ar: `تم تشفير ${archiveName} وتنزيله محلياً.` });
    toast.success(language === "ar" ? "تم تصدير الأرشيف المشفر محلياً." : "Encrypted archive exported locally.");
  };

  const importProtectedHistory = async (file: File, password: string) => {
    if (password.length < 10) throw new Error(language === "ar" ? "استخدم كلمة مرور من 10 أحرف على الأقل." : "Use a password with at least 10 characters.");
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this browser context.");
    const envelope = JSON.parse(await file.text()) as { format?: string; version?: number; cipher?: string; kdf?: { name?: string; hash?: string; iterations?: number; salt?: string }; iv?: string; ciphertext?: string };
    if (envelope.format !== "android-control-encrypted-history" || envelope.version !== 1 || envelope.cipher !== "AES-256-GCM" || envelope.kdf?.name !== "PBKDF2" || envelope.kdf.hash !== "SHA-256" || !envelope.kdf.iterations || !envelope.kdf.salt || !envelope.iv || !envelope.ciphertext) throw new Error(language === "ar" ? "هذا ليس أرشيف Android Control مشفراً متوافقاً." : "This is not a compatible Android Control encrypted archive.");
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: base64ToBytes(envelope.kdf.salt), iterations: envelope.kdf.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    let decoded: { receipts?: unknown[] };
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext));
      decoded = JSON.parse(new TextDecoder().decode(plain)) as { receipts?: unknown[] };
    } catch {
      throw new Error(language === "ar" ? "تعذر فك تشفير الأرشيف. تحقق من كلمة المرور والملف." : "The archive could not be decrypted. Check the password and file.");
    }
    const recovered = (decoded.receipts || []).filter(isHistoryReceipt).slice(0, 240);
    if (!recovered.length) throw new Error(language === "ar" ? "لا يحتوي الأرشيف على إيصالات قابلة للاستعادة." : "The archive contains no recoverable receipts.");
    setReceiptHistory((current) => {
      const records = new Map<string, HistoryReceipt>();
      [...recovered, ...current].forEach((receipt) => records.set(`${receipt.at}-${receipt.command}-${receipt.label}`, receipt));
      return Array.from(records.values()).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).slice(0, 240);
    });
    toast.success(language === "ar" ? `تمت استعادة ${recovered.length} إيصالاً محلياً.` : `${recovered.length} receipt(s) recovered locally.`);
  };

  const removeHistoryReceipt = (key: string) => {
    setReceiptHistory((current) => current.filter((receipt) => `${receipt.at}-${receipt.command}-${receipt.label}` !== key));
  };

  const updateHistoryTags = (key: string, tags: string[]) => {
    setReceiptHistory((current) => current.map((receipt) => `${receipt.at}-${receipt.command}-${receipt.label}` === key ? { ...receipt, tags } : receipt));
  };

  const clearReceiptHistory = () => {
    setReceiptHistory([]);
    toast.success(language === "ar" ? "تم مسح أرشيف الإيصالات المحلي." : "Local receipt history cleared.");
  };

  const createReceiptArchive = (name: string) => {
    const normalized = name.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!normalized) return;
    if (receiptArchives.some((archive) => archive.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
      toast.error(language === "ar" ? "يوجد أرشيف بهذا الاسم بالفعل." : "An archive with this name already exists.");
      return;
    }
    const now = new Date().toISOString();
    const archive = { id: `archive-${Date.now()}`, name: normalized, createdAt: now, updatedAt: now, receipts: [] };
    setReceiptArchives((current) => [archive, ...current].slice(0, 24));
    setActiveReceiptArchiveId(archive.id);
  };

  const renameReceiptArchive = (id: string, name: string) => {
    const normalized = name.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!normalized || receiptArchives.some((archive) => archive.id !== id && archive.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) return;
    setReceiptArchives((current) => current.map((archive) => archive.id === id ? { ...archive, name: normalized, updatedAt: new Date().toISOString() } : archive));
  };

  const deleteReceiptArchive = (id: string) => {
    if (receiptArchives.length < 2) { toast.error(language === "ar" ? "احتفظ بأرشيف محلي واحد على الأقل." : "Keep at least one local archive."); return; }
    const remaining = receiptArchives.filter((archive) => archive.id !== id);
    setReceiptArchives(remaining);
    if (activeReceiptArchive?.id === id) setActiveReceiptArchiveId(remaining[0].id);
  };

  const inspectAfterConnect = async () => {
    const [inventory, users, rootResult] = await Promise.all([adb.current.listPackages(), adb.current.listUsers(), adb.current.probeRoot()]);
    setPackages(inventory.packages);
    setDisabledPackages(inventory.disabledPackages || []);
    addReceipt(inventory.result, `Inventoried ${inventory.packages.length} package IDs (${inventory.disabledPackages?.length || 0} disabled)`);
    addReceipt(users, "Read Android user and profile list");
    addReceipt(rootResult.result, rootResult.granted ? "Root authority confirmed" : "Root authority not granted", rootResult.granted ? "Root" : "USB");
    setRoot(rootResult.granted);
    setUserOutput(users.stdout || "No additional Android profiles were reported.");
  };

  const refreshPackageStatus = async () => {
    try {
      const inventory = await adb.current.listPackages();
      setPackages(inventory.packages);
      setDisabledPackages(inventory.disabledPackages || []);
      addReceipt(inventory.result, `Refreshed package status: ${inventory.packages.length} packages (${inventory.disabledPackages?.length || 0} disabled)`);
      toast.success(language === "ar" ? "تم تحديث حالة التطبيقات محلياً." : "Device package inventory & disabled state refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh package status.");
    }
  };

  useEffect(() => {
    const unsub = adb.current.onDisconnect(() => {
      setDevice(null);
      setPackages([]);
      setDisabledPackages([]);
      setRoot(false);
      setAuthPromptMessage(null);
      toast.dismiss("adb-auth-prompt");
      setMirrorState({ phase: "idle", detail: "USB device detached. Connect to resume." });
      toast.warning(language === "ar" ? "تم فصل جهاز USB." : "WebUSB device was physically disconnected.");
    });

    const unsubAuth = adb.current.onAuthStatus((status) => {
      if (status.state === "unauthorized") {
        setAuthPromptMessage(status.message);
        toast.warning(status.message, { id: "adb-auth-prompt", duration: 15000 });
      } else if (status.state === "authorized") {
        setAuthPromptMessage(null);
        toast.dismiss("adb-auth-prompt");
      }
    });

    return () => {
      unsub();
      unsubAuth();
    };
  }, [language]);

  const connect = async (targetDevice?: any) => {
    setConnecting(true);
    setAuthPromptMessage(null);
    try {
      const validTarget =
        targetDevice && typeof targetDevice.connect === "function" ? targetDevice : undefined;
      const profile = await adb.current.connect(validTarget, (promptMsg) => {
        setAuthPromptMessage(promptMsg);
        toast.warning(promptMsg, { id: "adb-auth-prompt", duration: 15000 });
      });
      setAuthPromptMessage(null);
      toast.dismiss("adb-auth-prompt");
      setDevice(profile);
      addReceipt(
        { command: "WebUSB → ADB authentication", stdout: `${profile.manufacturer} ${profile.model} authorized.`, stderr: "", exitCode: 0, at: new Date().toISOString() },
        "USB debugging authorization complete",
        "Browser",
      );
      await inspectAfterConnect();
      addNotification("success", { en: "Device is ready", ar: "الجهاز جاهز" }, { en: `${profile.manufacturer} ${profile.model} is authorized and inventoried locally.`, ar: `تمت مصادقة ${profile.manufacturer} ${profile.model} وفهرسته محلياً.` });
      toast.success("Device inventory is ready.");
    } catch (error) {
      setAuthPromptMessage(null);
      toast.dismiss("adb-auth-prompt");
      const detail = error instanceof Error ? error.message : "Unable to connect to the selected device.";
      addReceipt({ command: "WebUSB → ADB authentication", stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "Connection stopped", "Browser");
      addNotification("warning", { en: "Connection needs attention", ar: "الاتصال يحتاج إلى انتباه" }, { en: `${detail} Confirm the browser device chooser and the phone’s USB debugging approval.`, ar: `${detail} تحقق من اختيار الجهاز في المتصفح ومن موافقة تصحيح USB على الهاتف.` });
      toast.error(detail);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      setAuthPromptMessage(null);
      toast.dismiss("adb-auth-prompt");
      await adb.current.disconnect();
      setDevice(null);
      setPackages([]);
      setDisabledPackages([]);
      setUninstalledPackages([]);
      setRoot(false);
      addReceipt(
        { command: "WebUSB → disconnect session", stdout: "WebUSB device connection released cleanly by operator.", stderr: "", exitCode: 0, at: new Date().toISOString() },
        "Device session disconnected",
        "Browser",
      );
      addNotification("info", { en: "Device disconnected", ar: "تم فصل الجهاز" }, { en: "WebUSB ADB session ended.", ar: "تم إنهاء جلسة WebUSB ADB." });
      toast.info(language === "ar" ? "تم فصل جهاز USB بأمان." : "Device disconnected safely.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Disconnect error";
      toast.error(detail);
    }
  };

  const refreshDeviceProps = async () => {
    if (!device) return;
    try {
      const profile = await adb.current.getDeviceProfile();
      if (profile) {
        setDevice(profile);
        await inspectAfterConnect();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not refresh device properties.";
      toast.error(detail);
    }
  };

  const deferSetup = () => {
    localStorage.setItem(FIRST_RUN_SETUP_KEY, "deferred");
    setSetupOpen(false);
  };

  const beginAuthorizationFromSetup = () => {
    localStorage.setItem(FIRST_RUN_SETUP_KEY, "completed");
    setSetupOpen(false);
    void connect();
  };

  const refreshCatalog = async () => {
    setCatalogLoading(true);
    try {
      const next = await fetchCommunityCatalog();
      setCatalog(next.entries);
      setCatalogTime(next.refreshedAt);
      addReceipt(
        { command: `GET ${COMMUNITY_SOURCE}`, stdout: `${next.entries.length} upstream definitions loaded locally.`, stderr: "", exitCode: 0, at: new Date().toISOString() },
        "Community package definitions refreshed",
        "Browser",
      );
      toast.success("Community definitions loaded; no device data was sent.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not refresh the community list.";
      addReceipt({ command: `GET ${COMMUNITY_SOURCE}`, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "Community list refresh failed", "Browser");
      toast.error(detail);
    } finally {
      setCatalogLoading(false);
    }
  };

  const disableDeGooglePackage = async (id: string, label: string, level: DebloatExecutionLevel = "safe") => {
    try {
      const result = await adb.current.executeDebloatAction(id, level);
      const restoreCmd = DEBLOAT_EXECUTION_LEVELS[level].restoreCommandTemplate(id);
      addReceipt(result, `${DEBLOAT_EXECUTION_LEVELS[level].label}: ${label}`, "USB", restoreCmd);
      if (result.exitCode === 0) {
        if (level === "safe") {
          setDisabledPackages((current) => Array.from(new Set([...current, id])));
        } else {
          setUninstalledPackages((current) => Array.from(new Set([...current, id])));
        }
        toast.success(language === "ar" ? "تم تسجيل إجراء De-Google بنجاح." : "Reversible action recorded.");
        return true;
      }
      toast.error(language === "ar" ? "أبلغ أندرويد عن نتيجة غير ناجحة. راجع الإيصال." : "Android reported a non-success result. Review the receipt.");
      return false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Package action failed.";
      const cmd = DEBLOAT_EXECUTION_LEVELS[level].commandTemplate(id);
      const restoreCmd = DEBLOAT_EXECUTION_LEVELS[level].restoreCommandTemplate(id);
      addReceipt({ command: cmd, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, label, "USB", restoreCmd);
      toast.error(detail);
      return false;
    }
  };

  const runTerminal = async () => {
    if (!terminal.trim()) return;
    setTerminalRunning(true);
    try {
      const result = await adb.current.run(terminal);
      addReceipt(result, "Operator command executed");
      toast.success(result.exitCode === 0 ? "Command completed." : "Command returned a non-zero result.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Command could not run.";
      addReceipt({ command: terminal, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "Operator command failed");
      toast.error(detail);
    } finally {
      setTerminalRunning(false);
    }
  };

  const loadFiles = async () => {
    setFileLoading(true);
    try {
      const next = await adb.current.listFiles(filePath);
      setFiles(next);
      addReceipt({ command: `sync.readdir ${filePath}`, stdout: `${next.length} entries returned.`, stderr: "", exitCode: 0, at: new Date().toISOString() }, "File listing refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read this path.");
    } finally {
      setFileLoading(false);
    }
  };

  const installApk = async (file?: File) => {
    if (!file) return;
    try {
      const result = await adb.current.installApk(file);
      addReceipt(result, `Installed ${file.name}`);
      toast.success(result.exitCode === 0 ? "APK installation completed." : "APK installer reported a result; inspect the receipt.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "APK installation failed.";
      addReceipt({ command: `Install ${file.name}`, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "APK installation failed");
      toast.error(detail);
    }
  };

  const startLiveMirror = async () => {
    if (!mirrorCanvas.current) return;
    setMirrorState({ phase: "starting", detail: "Pushing the managed Scrcpy server and negotiating a local H.264 stream…" });
    try {
      const session = await adb.current.startMirror(mirrorCanvas.current);
      mirrorSession.current = session;
      setMirrorState({ phase: "live", detail: "Scrcpy is rendering the connected device locally in this browser.", width: session.width, height: session.height, codec: session.codec });
      addReceipt({ command: "adb sync.push → /data/local/tmp/scrcpy-server.jar", stdout: "Managed Scrcpy 2.1 server transferred to authorized device.", stderr: "", exitCode: 0, at: new Date().toISOString() }, "Scrcpy server prepared", "USB");
      addReceipt({ command: "scrcpy-server 2.1 → H.264 WebCodecs session", stdout: `Live mirror started at ${session.width}×${session.height}; codec ${session.codec}.`, stderr: "", exitCode: 0, at: new Date().toISOString() }, "Live mirror started", "USB");
      toast.success("Live mirror started.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Scrcpy could not start.";
      setMirrorState({ phase: "error", detail });
      addReceipt({ command: "scrcpy start session", stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "Live mirror did not start", "USB");
      toast.error(detail);
    }
  };

  const stopLiveMirror = async () => {
    const session = mirrorSession.current;
    if (!session) return;
    setMirrorState((current) => ({ ...current, phase: "stopping", detail: "Closing the local Scrcpy tunnel and decoder…" }));
    try {
      await session.stop();
      mirrorSession.current = null;
      setMirrorState({ phase: "idle", detail: "Mirror session stopped. The device display is no longer streamed to this browser." });
      addReceipt({ command: "scrcpy session close", stdout: "Scrcpy control and media streams closed locally.", stderr: "", exitCode: 0, at: new Date().toISOString() }, "Live mirror stopped", "USB");
      toast.success("Live mirror stopped.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Mirror stop did not finish cleanly.";
      setMirrorState({ phase: "error", detail });
      addReceipt({ command: "scrcpy session close", stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, "Mirror stop returned an error", "USB");
      toast.error(detail);
    }
  };

  const copy = languageCopy[language];
  const workspace = copy.nav[active];
  const isLive = Boolean(device);
  const isArabic = language === "ar";
  const navGroups = isArabic
    ? [{ label: "تحكم وإدارة الجهاز", items: nav.slice(0, 7) }, { label: "المراجعة والأمان", items: nav.slice(7, 10) }, { label: "الأدلة والتاريخ", items: nav.slice(10) }]
    : [{ label: "Device control & management", items: nav.slice(0, 7) }, { label: "Review & safety", items: nav.slice(7, 10) }, { label: "Evidence & history", items: nav.slice(10) }];
  const debloatCopy = isArabic ? {
    context: "سياق المجتمع + الجرد المحلي", title: "ضع فقط التغييرات التي تفهمها في القائمة.", description: "تُطلب التعريفات من مستودع UAD-ng العام فقط عند اختيار التحديث. تبقى معرّفات الحزم المثبتة على هذا الجهاز. الإيقاف القابل للاستعادة للمستخدم 0 هو الخيار الآمن الافتراضي.", refresh: "تحديث قائمة المجتمع", refreshDevice: "تحديث حالة الجهاز", source: "المصدر:", notDownloaded: "لم يتم التنزيل", review: "مراجعة المصدر", connectTitle: "صِل جهازاً لمطابقة الحزم.", connectDetail: "يمكن تحديث قائمة المجتمع الآن، لكن مطابقة الحزم ووضعها في القائمة يتطلبان جرد أندرويد محلياً.", loadTitle: "حمّل تعريفات المجتمع لتصنيف هذا الجهاز.", loadDetail: "معرّفات الحزم المحلية جاهزة. يجري التحديث طلباً عاماً واحداً إلى GitHub ولا يرفع الجرد.", search: "ابحث في الحزم أو التصنيفات…", recommended: "الموصى بإزالتها فقط", package: "الحزمة", category: "التصنيف", allCategories: "جميع التصنيفات", status: "الحالة", allStatuses: "جميع الحالات", enabledOnly: "المفعلة فقط", disabledOnly: "المعطلة فقط", sortBy: "ترتيب حسب", sortCategory: "التصنيف", sortStatus: "حالة التفعيل", sortPackageId: "اسم الحزمة", sortRisk: "مستوى التوصية", viewMode: "طريقة العرض", groupByCategory: "تجميع حسب التصنيف", flatTable: "جدول موحد", assessment: "تقييم المصدر", purpose: "الغرض والاعتماديات", restore: "استعادة", quickDisable: "تعطيل", quickEnable: "إعادة تفعيل", selected: "محدد", matched: "مطابق", only: "يبدأ الموصى به فقط مفعلاً.", disable: "إيقاف للمستخدم 0 (افتراضي)", uninstall: "إزالة للمستخدم 0 (متقدم)", restoreMode: "إعادة تفعيل / استعادة للمستخدم 0", reviewCommands: "مراجعة", commands: "أمر", descriptionSource: "وصف المصدر العام", neededBy: "تحتاجه", reviewRequired: "المراجعة مطلوبة", apply: "تطبيق الأوامر المراجعة", cancel: "إلغاء", selectAllCategory: "تحديد كل تطبيقات التصنيف", risk: "استخدم على مسؤوليتك. يمكن لمصنّعي الأجهزة تقييد الحزم وتصنيف المجتمع ليس ضماناً. ستضاف النتائج ومحاولات الاستعادة إلى سجل الأوامر المحلي.", noMatches: "لا توجد تطبيقات تطابق معايير البحث أو التصفية الحالية.",
  } : {
    context: "Community context + local inventory", title: "Queue only the changes you understand.", description: "Definitions are requested directly from the public UAD-ng repository only when you choose refresh. Installed package IDs remain on this device. The safe default is reversible disablement for User 0.", refresh: "Refresh community list", refreshDevice: "Refresh device status", source: "Source:", notDownloaded: "not downloaded", review: "review upstream", connectTitle: "Connect a device to match packages.", connectDetail: "The community list can be refreshed now, but package matching and queueing require a local Android inventory.", loadTitle: "Load community definitions to classify this device.", loadDetail: "local package IDs are ready. Refreshing makes one public GitHub request and does not upload the inventory.", search: "Search packages, categories, or labels…", recommended: "Show recommended only", package: "Package", category: "Category", allCategories: "All Categories", status: "Status", allStatuses: "All Statuses", enabledOnly: "Enabled Only", disabledOnly: "Disabled Only", sortBy: "Sort by", sortCategory: "Category", sortStatus: "Status (Enabled/Disabled)", sortPackageId: "Package ID", sortRisk: "Removal Risk", viewMode: "View", groupByCategory: "Group by Category", flatTable: "Flat Table", assessment: "Upstream assessment", purpose: "Purpose & dependencies", restore: "Restore", quickDisable: "Disable", quickEnable: "Re-enable", selected: "selected", matched: "matched", only: "only Recommended starts enabled.", disable: "Disable for User 0 (default)", uninstall: "Remove for User 0 (advanced)", restoreMode: "Re-enable / Restore for User 0", reviewCommands: "Review", commands: "command", descriptionSource: "Public-source description", neededBy: "needed by", reviewRequired: "Review required", apply: "Apply reviewed commands", cancel: "Cancel", selectAllCategory: "Select all in category", risk: "Use at your own risk. Device makers can restrict packages and the community classification is not a warranty. Results and restore attempts will be added to the local command ledger.", noMatches: "No packages match the current filters or search query.",
  };

  useEffect(() => {
    document.documentElement.lang = language === "ar" ? "ar" : "en";
    document.documentElement.dir = languageCopy[language].direction;
    localStorage.setItem("acc-language", language);
  }, [language]);

  useEffect(() => {
    const handleKeyboardNavigation = (event: KeyboardEvent) => {
      if (setupOpen || shortcutGuideOpen || event.defaultPrevented || event.isComposing || !window.matchMedia("(min-width: 1024px)").matches) return;
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "");
      if (isEditing) return;

      if (event.key === "?") {
        event.preventDefault();
        setShortcutGuideOpen(true);
        return;
      }

      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !/^[0-9]$/.test(event.key)) return;
      const index = event.key === "0" ? 9 : Number(event.key) - 1;
      const destination = nav[index];
      if (!destination) return;
      event.preventDefault();
      setActive(destination.id);
      window.scrollTo(0, 0);
    };
    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => window.removeEventListener("keydown", handleKeyboardNavigation);
  }, [setupOpen, shortcutGuideOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(RECEIPT_ARCHIVES_KEY, JSON.stringify(receiptArchives));
      localStorage.setItem(ACTIVE_RECEIPT_ARCHIVE_KEY, activeReceiptArchive?.id || PRIMARY_ARCHIVE_ID);
      localStorage.setItem(RECEIPT_HISTORY_KEY, JSON.stringify(receiptHistory));
    } catch {
      toast.error(language === "ar" ? "تعذر حفظ أرشيف الإيصالات محلياً." : "Receipt history could not be saved locally.");
    }
  }, [receiptArchives, activeReceiptArchive?.id, receiptHistory, language]);

  const changeLanguage = (next: InterfaceLanguage) => {
    setLanguage(next);
    toast.message(next === "ar" ? "تم تفعيل وضع العربية." : next === "other" ? "More language packs are being prepared." : "English interface selected.");
  };

  return (
    <div dir={copy.direction} className="app-workbench min-h-screen bg-[#f6f2ea] text-[#14253a] dark:bg-[#0e1d2c] dark:text-[#e7eef3] lg:grid lg:grid-cols-[230px_minmax(0,1fr)_330px]">
      <aside className="border-b border-[#2f4860] bg-[#14253a] text-[#f6f2ea] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b border-[#2f4860] px-5 py-5">
          <img src="/manus-storage/android-control-mark_bcf284ab.png" alt="Android Control Center signal bracket mark" className="h-14 w-14" />
          <div className="min-w-0">
            <p className="kicker text-[#c8f04a]"><span className="cal-tick" />ACC / 01</p>
            <p className="brand-wordmark mt-1 text-[0.72rem] text-white">AndroidControl<br />Center <span className="text-[#c8f04a]">Forensicslarn</span></p>
          </div>
        </div>
        <nav aria-label={isArabic ? "محطات التحكم" : "Control workstations"} className="tool-navigation overflow-x-auto px-3 py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div className="flex min-w-max gap-5 lg:block lg:min-w-0 lg:space-y-4">
            {navGroups.map((group) => (
              <div key={group.label} className="min-w-max lg:min-w-0">
                <p className="nav-group-label px-2 pb-2 text-[#7f91a1]">{group.label}</p>
                <div className="flex gap-1 lg:block lg:space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const chosen = active === item.id;
                    const index = nav.findIndex((entry) => entry.id === item.id);
                    return (
                      <button key={item.id} onClick={() => setActive(item.id)} className={`action-button group flex min-w-max items-center gap-3 px-3 py-2.5 text-left text-sm lg:w-full ${chosen ? "bg-[#c8f04a] text-[#14253a]" : "text-[#cad3dc] hover:bg-[#223952] hover:text-white"}`}>
                        <span className="mono text-[0.64rem] opacity-70">{String(index + 1).padStart(2, "0")}</span>
                        <Icon size={16} strokeWidth={1.8} />
                        <span className="font-medium">{copy.nav[item.id]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 lg:mt-auto lg:block lg:px-5 lg:pt-3">
          <div className="border-y border-[#2f4860] py-3 lg:mb-5">
            <p className="kicker text-[#7f91a1]">{isArabic ? "المظهر" : "Appearance"}</p>
            <button onClick={() => toggleTheme?.()} className="action-button mt-2 flex w-full items-center justify-between border border-[#3d566e] bg-[#1b3048] px-2.5 py-2 text-xs text-[#f6f2ea] hover:border-[#c8f04a]" aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} theme`}>
              <span className="flex items-center gap-2">{theme === "dark" ? <Sun size={14} className="text-[#c8f04a]" /> : <Moon size={14} className="text-[#c8f04a]" />}{theme === "dark" ? (isArabic ? "داكن" : "Dark") : (isArabic ? "فاتح" : "Light")}</span>
              <span className="mono text-[0.6rem] text-[#a6b3be]">{isArabic ? "تغيير" : "change"}</span>
            </button>
          </div>
          <div className="border-y border-[#2f4860] py-3 lg:mb-5">
            <label className="kicker flex items-center gap-2 text-[#7f91a1]" htmlFor="language-choice"><Languages size={13} /> {copy.language}</label>
            <select id="language-choice" value={language} onChange={(event) => changeLanguage(event.target.value as InterfaceLanguage)} className="mono mt-2 h-9 w-full border border-[#3d566e] bg-[#1b3048] px-2 text-xs text-[#f6f2ea] outline-none focus:border-[#c8f04a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500">
              <option value="en">{copy.choices.en}</option>
              <option value="ar">{copy.choices.ar}</option>
              <option value="other">{copy.choices.other}</option>
            </select>
            {language === "other" && <p className="mt-2 text-[0.63rem] leading-4 text-[#8e9eae]">Select English or Arabic today; additional language packs are being prepared.</p>}
          </div>
          <div className="col-span-2">
            <p className="kicker text-[#7f91a1]">{isArabic ? "النقل" : "Transport"}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#cdd7df]"><Usb size={14} className={isLive ? "text-[#c8f04a]" : "text-[#7f91a1]"} /> {isLive ? (isArabic ? "تم تفويض تصحيح USB" : "USB Debugging authorized") : (browserCapabilities.usb ? (isArabic ? "بانتظار التفويض" : "Awaiting authorization") : (isArabic ? "يتطلب متصفح Chromium" : "Chromium browser required"))}</div>
            <p className="mt-2 text-xs leading-5 text-[#8e9eae]">{isArabic ? "تبقى جميع العمليات على هذا الجهاز وفي هذا المتصفح." : "All work stays on this device and in this browser."}</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-7 lg:px-8 lg:py-7">
        <header className="dashboard-header mb-5 flex flex-col gap-4 border-b border-[#d8d1c4] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-[#687584]">{isArabic ? "مكتب الخدمة" : "Service bench"} / {active === "overview" ? copy.ready : workspace}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-3xl">{active === "overview" ? (isArabic ? "حالة الخدمة المحلية" : "Local service status") : active === "about" ? copy.about : workspace}</h1>
          </div>
                      <div className="flex flex-wrap items-center gap-2">
            <NotificationCenter language={language} notifications={notifications} setNotifications={setNotifications} />
            <div className={`status-stamp w-fit ${isLive ? "text-[#527321]" : "text-[#687584]"}`}><span>{isLive ? (isArabic ? "جهاز مباشر" : "live device") : (isArabic ? "غير متصل" : "not connected")}</span></div>

            <div className={`status-stamp w-fit ${browserCapabilities.usb ? "text-[#59869c]" : "text-[#934639]"}`}><span>{browserCapabilities.usb ? "WebUSB" : "WebUSB unavailable"}</span></div>
            {!isLive ? (
              <button onClick={connect} disabled={connecting || !browserCapabilities.usb} className="action-button inline-flex items-center gap-1.5 border border-[#14253a] bg-[#c8f04a] px-2.5 py-1.5 text-xs font-semibold text-[#14253a] hover:bg-[#d6fa5c] disabled:opacity-50 dark:border-[#c8f04a]">
                {connecting ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                {isArabic ? "طلب اتصال WebUSB" : "Connect WebUSB"}
              </button>
            ) : (
              <button onClick={disconnect} className="action-button inline-flex items-center gap-1.5 border border-[#934639] bg-[#fffdf8] px-2.5 py-1.5 text-xs font-semibold text-[#934639] hover:bg-[#fbe5df] dark:border-[#e28373] dark:bg-[#14253a] dark:text-[#f1a38e] dark:hover:bg-[#4a1d17]">
                <Unplug size={13} />
                {isArabic ? "فصل USB" : "Disconnect"}
              </button>
            )}
            <button onClick={() => setSetupOpen(true)} className="action-button inline-flex items-center gap-2 border border-[#14253a] bg-[#fffdf8] px-2.5 py-1.5 text-xs font-semibold text-[#14253a] hover:bg-[#e6f4bb] dark:border-[#d7e0e8] dark:bg-[#14253a] dark:text-[#e7eef3] dark:hover:bg-[#293f22]"><HelpCircle size={14} />{isArabic ? "إعداد الاتصال" : "Setup"}</button>
            <button onClick={() => setShortcutGuideOpen(true)} className="action-button hidden items-center gap-2 border border-[#14253a] bg-[#fffdf8] px-2.5 py-1.5 text-xs font-semibold text-[#14253a] hover:bg-[#e6f4bb] dark:border-[#d7e0e8] dark:bg-[#14253a] dark:text-[#e7eef3] dark:hover:bg-[#293f22] lg:inline-flex" title={isArabic ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}><Keyboard size={14} />{isArabic ? "اختصارات" : "Shortcuts"}<kbd className="mono border border-current px-1 text-[0.6rem]">?</kbd></button>
          </div>
        </header>

        {active === "overview" && (
          <section className="space-y-5">
            {/* Primary WebUSB Connection Manager Component */}
            <WebUsbConnectionManager
              device={device}
              connecting={connecting}
              authPromptMessage={authPromptMessage}
              root={root}
              packageCount={packages.length}
              language={language}
              onConnect={connect}
              onDisconnect={disconnect}
              onRefreshProps={refreshDeviceProps}
              showTroubleshooting={true}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Device", value: device ? `${device.manufacturer} ${device.model}` : "No session", note: device ? `Android ${device.androidVersion} · API ${device.sdk}` : "state: device authorization required", icon: Smartphone },
                { label: "Inventory", value: isLive ? `${packages.length} found (${disabledPackages.length} disabled)` : "No receipt", note: catalog.length ? `${categorizedInventory.filter((item) => item.hasCommunityContext).length} have community context` : "command: pm list packages -u", icon: Boxes },
                { label: "Authority", value: root ? "Root available" : "Standard USB", note: root ? "stamp: root commands stay separate" : "stamp: safe mode is default", icon: LockKeyhole },
                { label: "Privacy", value: "No telemetry", note: "stamp: only user-triggered GitHub requests", icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.icon;
                return <div className="service-card p-4 dark:bg-slate-800/80 dark:text-slate-100 dark:border-slate-700" key={item.label}><div className="flex items-start justify-between"><p className="kicker text-[#687584] dark:text-slate-400">{item.label}</p><span className="state-square text-[#59869c] dark:text-cyan-400 dark:border-cyan-500/40">0{item.label === "Device" ? 1 : item.label === "Inventory" ? 2 : item.label === "Authority" ? 3 : 4}</span></div><p className="mt-5 text-lg font-bold tracking-[-0.03em] dark:text-slate-100">{item.value}</p><p className="mono mt-1 text-[0.64rem] leading-5 text-[#687584] dark:text-slate-400">{item.note}</p></div>;
              })}
            </div>

            {isLive && packages.length > 0 && (
              <CategoryBreakdown
                stats={categoryStats}
                selectedCategory="all"
                onSelectCategory={() => {
                  setActive("debloat");
                }}
                language={language}
              />
            )}

            <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
              <div className="service-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="kicker text-[#687584]">Receipt sequence</p><h3 className="mt-1 text-xl font-bold tracking-[-0.04em]">Controlled connection</h3></div><Usb className="text-[#c8a800]" /></div><ol className="mt-6 grid gap-4 sm:grid-cols-3">{[["01", "Enable USB debugging", "Developer options → USB debugging."], ["02", "Approve device key", "Browser chooser, then Android trust prompt."], ["03", "Read the receipt", "The right rail retains command, output, and restore." ]].map(([step, title, copy]) => <li key={step} className="border-l-2 border-[#c8f04a] bg-[#f3efe6] p-3"><p className="mono text-xs text-[#59869c]">RECEIPT / {step}</p><p className="mt-2 text-sm font-semibold">{title}</p><p className="mono mt-1 text-[0.65rem] leading-5 text-[#687584]">{copy}</p></li>)}</ol></div>
              <div className="overflow-hidden border border-[#d8d1c4] bg-[#fffdf8]"><img src="/manus-storage/device-inspection-panel_29038d16.jpg" alt="Device inspection tools" className="h-40 w-full object-cover" /><div className="p-5"><p className="kicker text-[#687584]">Control discipline</p><p className="mt-2 text-sm leading-6 text-[#526273]">Actions never silently elevate permission. A failed command remains visible, and a package action records a restoration command when a normal-user restoration path exists.</p></div></div>
            </div>
          </section>
        )}

        {active === "debloat" && (
          <DebloaterWorkspace
            adb={adb.current}
            packages={packages}
            disabledPackages={disabledPackages}
            uninstalledPackages={uninstalledPackages}
            categorizedPackages={categorizedInventory}
            isLive={isLive}
            language={language}
            device={device}
            onRefreshPackages={refreshPackageStatus}
            onAddReceipt={addReceipt}
            onConnect={connect}
          />
        )}

        {active === "degoogle" && (
          <DeGoogleWorkspace
            language={language}
            isLive={isLive}
            packages={packages}
            disabledPackages={disabledPackages}
            uninstalledPackages={uninstalledPackages}
            manufacturer={device?.manufacturer}
            model={device?.model}
            androidVersion={device?.androidVersion}
            disablePackage={disableDeGooglePackage}
            openSetup={() => setSetupOpen(true)}
            exportFavorites={exportFavoriteCase}
          />
        )}
        {active === "logcat" && (
          <LogcatViewer
            adb={adb}
            device={device}
            language={language}
            onAddReceipt={addReceipt}
          />
        )}
        {active === "diagnostics" && (
          <DeviceDiagnosticsWorkspace
            adb={adb.current.getAdbInstance()}
            client={adb.current}
            isConnected={isLive}
            device={device}
            language={language}
            onAddReceipt={addReceipt}
          />
        )}
        {active === "iot-triage" && (
          <IoTTriageView
            adb={adb.current.getAdbInstance()}
            isConnected={isLive}
          />
        )}
        {active === "privacy" && <PrivacyWorkspace language={language} isLive={isLive} run={async (command, label) => { try { const result = await adb.current.run(command); addReceipt(result, label); toast.success(language === "ar" ? "اكتمل فحص الخصوصية." : "Privacy check completed."); } catch (error) { toast.error(error instanceof Error ? error.message : "Command could not run."); } }} />}
        {active === "mirror" && <LiveMirrorWorkspace language={language} isLive={isLive} state={mirrorState} canvasRef={mirrorCanvas} start={startLiveMirror} stop={stopLiveMirror} />}
        {active === "profiles" && <ProfilesWorkspace language={language} isLive={isLive} output={userOutput} refresh={async () => { try { const result = await adb.current.listUsers(); setUserOutput(result.stdout); addReceipt(result, language === "ar" ? "تم تحديث مستخدمي وملفات أندرويد" : "Refreshed Android users and profiles"); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to inspect profiles."); } }} />}
        {active === "apk" && <ApkInspectionWorkspace language={language} isLive={isLive} install={installApk} />}
        {active === "files" && <FilesWorkspace language={language} isLive={isLive} path={filePath} setPath={setFilePath} files={files} loading={fileLoading} load={loadFiles} />}
        {active === "evidence" && <EvidenceSnapshotWorkspace language={language} isLive={isLive} device={device} run={runEvidenceOperation} exportCase={exportEvidenceCase} openSetup={() => setSetupOpen(true)} />}
        {active === "history" && <ReceiptHistoryWorkspace language={language} history={receiptHistory} archives={receiptArchives.map(({ id, name, createdAt, updatedAt, receipts }) => ({ id, name, createdAt, updatedAt, receiptCount: receipts.length }))} activeArchiveId={activeReceiptArchive?.id || PRIMARY_ARCHIVE_ID} selectArchive={setActiveReceiptArchiveId} createArchive={createReceiptArchive} renameArchive={renameReceiptArchive} deleteArchive={deleteReceiptArchive} remove={removeHistoryReceipt} clear={clearReceiptHistory} updateTags={updateHistoryTags} exportHistory={exportHistory} protectHistory={protectHistory} importHistory={importProtectedHistory} />}
        {active === "about" && <AboutWorkspace language={language} />}

        <section className="mt-7 border-t border-[#d8d1c4] pt-5 dark:border-slate-800"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="kicker text-[#687584] dark:text-slate-400">{isArabic ? "تفاصيل المشغّل" : "Operator detail"}</p><span className="status-stamp text-[#59869c] dark:text-cyan-400 dark:border-cyan-500/40">{isArabic ? "مسجل" : "logged"}</span></div><p className="mt-1 text-sm text-[#526273] dark:text-slate-300">{isArabic ? "شغّل أمر shell مقصوداً. يُسجل كما هو ويستخدم تصحيح USB القياسي ما لم تكتب أمر su -c بنفسك." : "Run a deliberate shell command. It is logged as-is and uses standard USB debugging unless you write an `su -c` command yourself."}</p></div><div className="flex w-full max-w-xl gap-2"><input value={terminal} onChange={(event) => setTerminal(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runTerminal()} placeholder="e.g. getprop ro.build.fingerprint" className="h-10 min-w-0 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-3 mono text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500" /><Button onClick={runTerminal} disabled={!isLive || terminalRunning} variant="outline" className="action-button border-[#14253a] dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">{terminalRunning ? <Loader2 className="animate-spin" size={16} /> : <TerminalSquare size={16} />}</Button></div></div></section>
      </main>

      <aside className="border-t border-[#2f4860] bg-[#14253a] text-[#f6f2ea] lg:sticky lg:top-0 lg:h-screen lg:border-l lg:border-t-0">
        <div className="border-b border-[#2f4860] px-5 py-5"><div className="flex items-center justify-between"><div><p className="kicker text-[#c8f04a]">{isArabic ? "سجل الأوامر" : "Command ledger"}</p><h2 className="mt-1 text-lg font-bold tracking-[-0.035em]">{isArabic ? "لا يحدث شيء من دون سجل." : "Nothing happens off record."}</h2></div><ClipboardList size={19} className="text-[#8e9eae]" /></div><p className="mt-2 text-xs leading-5 text-[#a6b3be]">{isArabic ? "تحفظ الإيصالات المحلية الأمر والمخرجات والصلاحية وتفاصيل الاستعادة معاً." : "Local receipts keep command, output, authority, and restoration detail together."}</p></div>
        <div className="max-h-[440px] space-y-3 overflow-auto p-4 lg:max-h-[calc(100vh-360px)]">{receipts.map((receipt, index) => <article key={`${receipt.at}-${index}`} className="receipt-enter border border-[#2f4860] bg-[#1b3048] p-3"><div className="flex items-center justify-between gap-2"><span className={`status-stamp scale-90 origin-left ${receipt.exitCode === 0 ? "text-[#c8f04a]" : "text-[#f1a38e]"}`}>{receipt.authority}</span><span className="mono text-[0.62rem] text-[#8e9eae]">{shortTime(receipt.at)}</span></div><p className="mt-2 text-xs font-semibold text-white">{receipt.label}</p><p className="mono mt-2 break-all text-[0.66rem] leading-5 text-[#d7e0e8]">{commandName(receipt.command)}</p>{(receipt.stdout || receipt.stderr) && <p className={`mono mt-2 max-h-20 overflow-auto whitespace-pre-wrap border-l pl-2 text-[0.64rem] leading-5 ${receipt.stderr ? "border-[#f1a38e] text-[#f5c5ba]" : "border-[#59869c] text-[#b4c6d2]"}`}>{receipt.stderr || receipt.stdout}</p>}{receipt.restore && <p className="mono mt-2 text-[0.62rem] leading-5 text-[#c8f04a]">restore → {receipt.restore}</p>}</article>)}</div>
        <div className="border-t border-[#2f4860] bg-[#10243a] p-4"><p className="kicker text-[#c8f04a]">{isArabic ? "تصدير محلي" : "Local export"}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => exportReceipts("json")} className="action-button border border-[#3d566e] px-2 py-2 text-xs text-[#f6f2ea] hover:border-[#c8f04a]"><Download className="mr-1 inline" size={13} />JSON</button><button onClick={() => exportReceipts("md")} className="action-button border border-[#3d566e] px-2 py-2 text-xs text-[#f6f2ea] hover:border-[#c8f04a]"><FileText className="mr-1 inline" size={13} />Markdown</button></div><label className="mono mt-4 block text-[0.61rem] text-[#8e9eae]">{isArabic ? "اسم برنامج الاستعادة" : "Recovery script name"}</label><input value={recoveryScriptName} onChange={(event) => setRecoveryScriptName(event.target.value)} className="mono mt-1 h-8 w-full border border-[#3d566e] bg-[#0e1d2c] px-2 text-[0.65rem] text-[#f6f2ea] outline-none focus:border-[#c8f04a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500" /><button onClick={exportRecoveryScript} className="action-button mt-2 w-full border border-[#c8f04a] bg-[#c8f04a] px-2 py-2 text-xs font-semibold text-[#14253a] hover:bg-[#d7f66c]"><RotateCcw className="mr-1 inline" size={13} />{isArabic ? "إنشاء برنامج الاستعادة" : "Generate restore script"}</button><p className="mt-2 text-[0.61rem] leading-4 text-[#8e9eae]">{receipts.filter((receipt) => receipt.restore).length} {isArabic ? "مسار استعادة حزمة مسجّل. تبقى التنزيلات في هذا المتصفح." : "recorded package restore path(s). Downloads stay in this browser."}</p></div>
      </aside>
      <FirstRunSetupDialog open={setupOpen} language={language} usbSupported={browserCapabilities.usb} cryptoSupported={browserCapabilities.crypto} connecting={connecting} onOpenChange={(open) => open ? setSetupOpen(true) : deferSetup()} onStartAuthorization={beginAuthorizationFromSetup} onDefer={deferSetup} />
      <ShortcutGuideDialog open={shortcutGuideOpen} language={language} onOpenChange={setShortcutGuideOpen} />
    </div>
  );
}

function EmptyState({ title, copy, action, label }: { title: string; copy: string; action: () => void; label: string }) {
  return <div className="service-card p-8 text-center"><HardDrive className="mx-auto text-[#59869c]" size={27} /><h3 className="mt-4 text-xl font-bold tracking-[-0.04em]">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#526273]">{copy}</p><Button onClick={action} className="action-button mt-5 bg-[#14253a] text-[#f6f2ea] hover:bg-[#223952]">{label}<ChevronRight className="ml-1" size={16} /></Button></div>;
}

function PrivacyWorkspace({ language, isLive, run }: { language: InterfaceLanguage; isLive: boolean; run: (command: string, label: string) => Promise<void> }) {
  const isArabic = language === "ar";
  const actions = isArabic ? [
    ["مراجعة حالة الموقع", "settings get secure location_mode", "للقراءة فقط · قد يقيّد أندرويد الإجابة"],
    ["مراجعة DNS الخاص", "settings get global private_dns_mode && settings get global private_dns_specifier", "للقراءة فقط · يتحقق من سياسة DNS الحالية"],
    ["مراجعة ADB عبر الشبكة", "getprop service.adb.tcp.port", "للقراءة فقط · يكشف منفذ تصحيح يستمع"],
    ["عرض منح أذونات وقت التشغيل", "dumpsys package packages | grep -E 'granted=true|granted=true' | head -120", "قراءة متقدمة فقط · تختلف النتائج باختلاف إصدار أندرويد"],
  ] : [
    ["Review location state", "settings get secure location_mode", "Read-only · Android may restrict the answer"],
    ["Review private DNS", "settings get global private_dns_mode && settings get global private_dns_specifier", "Read-only · verifies current DNS policy"],
    ["Review ADB over network", "getprop service.adb.tcp.port", "Read-only · detects a listening debug port"],
    ["List runtime permission grants", "dumpsys package packages | grep -E 'granted=true|granted=true' | head -120", "Advanced read-only · output varies by Android version"],
  ];
  return <section className="space-y-5"><div className="relative overflow-hidden border border-[#d8d1c4] bg-[#fffdf8]"><img src="/manus-storage/privacy-workstation_68e7bcbd.jpg" alt="Privacy workstation" className="absolute right-0 top-0 h-full w-48 object-cover opacity-70 sm:w-72" /><div className="relative max-w-2xl p-6 sm:p-7"><p className="kicker text-[#687584]">{isArabic ? "راجع قبل التغيير" : "Review before toggle"}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">{isArabic ? "تحتاج أدوات الخصوصية إلى سياق الجهاز." : "Privacy controls need device context."}</h2><p className="mt-3 text-sm leading-6 text-[#526273]">{isArabic ? "تبدأ هذه المحطة بفحوصات للقراءة فقط. تعتمد إعدادات أندرويد على الشركة والسياسة، لذلك تعرض اللوحة النتيجة الدقيقة قبل اقتراح مسار تغيير." : "This workstation begins with read-only checks. Android settings are vendor- and policy-dependent, so the desk shows the exact result before presenting a change path."}</p></div></div><div className="grid gap-4 md:grid-cols-2">{actions.map(([label, command, note]) => <div className="service-card p-5" key={label}><div className="flex items-start justify-between"><ShieldCheck size={18} className="text-[#59869c]" /><span className="status-stamp text-[#687584]">{isArabic ? "قراءة" : "read"}</span></div><h3 className="mt-5 font-bold">{label}</h3><p className="mt-2 mono text-[0.68rem] leading-5 text-[#526273]">{command}</p><p className="mt-3 text-xs leading-5 text-[#687584]">{note}</p><Button variant="outline" disabled={!isLive} onClick={() => run(command, label)} className="action-button mt-5 border-[#14253a]">{isArabic ? "تشغيل الفحص" : "Run check"} <ArrowRight className="ml-2" size={15} /></Button></div>)}</div><div className="border-l-2 border-[#d39152] bg-[#fff2e1] p-4 text-sm leading-6 text-[#6d5133]"><strong>{isArabic ? "لماذا لا توجد قائمة تغييرات عامة؟" : "Why no universal toggle list?"}</strong> {isArabic ? "قد ترفض سياسة النظام أوامر إعدادات أندرويد، أو تطبقها بطريقة مختلفة حسب الإصدار، أو ينتج عنها أثر غير متوقع على الجهاز. تفحص اللوحة أولاً ثم تعرض أمراً محدداً فقط عندما تفهم النتيجة الحالية للهاتف." : "Android settings commands can be rejected by system policy, apply differently by version, or carry an unexpected device-wide effect. The normal workflow inspects first, then exposes a specific command only when you understand the phone’s current result."}</div></section>;
}

function MirrorWorkspace({ isLive }: { isLive: boolean }) {
  return <section className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="overflow-hidden border border-[#14253a] bg-[#14253a] p-5 text-[#f6f2ea]"><div className="flex items-center justify-between"><div><p className="kicker text-[#c8f04a]">Screen mirror</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.04em]">A live session, not a disguised screenshot.</h2></div><MonitorUp className="text-[#c8f04a]" /></div><div className="relative mt-5 aspect-video overflow-hidden border border-[#2f4860] bg-[#0e1d2c]"><img src="/manus-storage/command-ledger-texture_4af88a5a.jpg" alt="Command ledger texture" className="h-full w-full object-cover opacity-20" /><div className="absolute inset-0 grid place-items-center"><div className="text-center"><Smartphone className="mx-auto text-[#c8f04a]" size={31} /><p className="mt-3 text-sm font-semibold">{isLive ? "Device transport ready" : "Connect a device first"}</p><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-[#a6b3be]">The included browser ADB layer is ready for a Scrcpy client integration. Video streaming and input forwarding require a compatible device/server pairing, so they remain visible as a verified capability rather than a fake preview.</p></div></div></div><div className="mt-4 flex items-center gap-2 text-xs text-[#b9c5cf]"><span className="status-stamp text-[#59869c]">capability</span> WebUSB + ADB session • Scrcpy adapter required for streaming</div></div><div className="service-card p-6"><p className="kicker text-[#687584]">Mirror readiness</p><div className="mt-5 space-y-4">{[["USB debugging", isLive ? "Authorized" : "Awaiting device", isLive], ["Browser video decoder", "Checked when mirror adapter starts", false], ["Device screen control", "Requires an active Scrcpy controller", false]].map(([label, status, good]) => <div className="flex items-center gap-3 border-b border-[#e3dcd0] pb-3" key={label as string}><span className={`grid h-6 w-6 place-items-center border ${good ? "border-[#b9da71] bg-[#eef8cd] text-[#527321]" : "border-[#d8d1c4] text-[#687584]"}`}>{good ? <Check size={14} /> : <HelpCircle size={14} />}</span><div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-[#687584]">{status}</p></div></div>)}</div><p className="mt-5 text-xs leading-5 text-[#687584]">No root is required for Scrcpy on compatible devices. The product will not claim a mirror is active until an H.264/AV1 video stream and device controller have actually initialized.</p></div></div></section>;
}

function ProfilesWorkspace({ language, isLive, output, refresh }: { language: InterfaceLanguage; isLive: boolean; output: string; refresh: () => void }) {
  const ar = language === "ar";
  return <section className="space-y-5"><div className="service-card p-6"><p className="kicker text-[#687584]">{ar ? "سياق أندرويد للمؤسسات" : "Android Enterprise context"}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">{ar ? "ملفات منفصلة، وليست مفتاح استنساخ عاماً." : "Separate profiles, not a universal clone switch."}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#526273]">{ar ? "يفصل ملف العمل في أندرويد التطبيقات والبيانات المُدارة عن البيانات الشخصية. لا يستطيع ADB إنشاء أو استنساخ كل تطبيق بأمان داخل ملف على كل هاتف؛ يعرض هذا الفاحص بنية المستخدم والملف الحالية قبل تقديم أي خطوة خاصة بالجهاز." : "Android Work Profile separates managed work apps and data from personal data. ADB cannot safely create or clone every app into a profile on every phone; this inspector reveals the current user/profile topology before offering any device-specific next step."}</p><div className="mt-6 flex flex-wrap gap-3"><Button disabled={!isLive} onClick={refresh} className="action-button bg-[#14253a] text-[#f6f2ea] hover:bg-[#223952]"><UsersRound className="mr-2" size={16} />{ar ? "فحص المستخدمين والملفات" : "Inspect users & profiles"}</Button><a href="https://www.android.com/enterprise/work-profile/" target="_blank" className="action-button inline-flex items-center border border-[#14253a] px-4 py-2 text-sm font-medium">{ar ? "دليل ملف العمل" : "Work Profile guide"} <ArrowRight className="ml-2" size={15} /></a></div></div><div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><div className="border border-[#d8d1c4] bg-[#fff2e1] p-5"><p className="kicker text-[#934639]">{ar ? "حاجز أمان" : "Guardrail"}</p><p className="mt-3 text-sm leading-6 text-[#6d3d35]">{ar ? "لا يصبح تثبيت تطبيق في ملف مناسباً إلا بعد أن يؤكد الجهاز وجود ملف مؤهل وصلاحية السياسة المطلوبة. لا تدّعي اللوحة أن «استنساخ التطبيق» أمر ADB قياسي قابل للنقل بين الأجهزة." : "An install-to-profile operation is only appropriate after this device confirms an eligible profile and the required policy authority. The desk does not pretend that “clone app” is a standard, portable ADB command."}</p></div><div className="service-card p-5"><div className="flex items-center justify-between"><div><p className="kicker text-[#687584]">{ar ? "النتيجة الحالية" : "Current result"}</p><h3 className="mt-1 font-bold">`pm list users`</h3></div><ListFilter size={18} className="text-[#59869c]" /></div><pre className="mono mt-5 max-h-72 overflow-auto whitespace-pre-wrap border-l border-[#c8f04a] bg-[#f3efe6] p-4 text-xs leading-6 text-[#263d55]">{isLive ? output : (ar ? "صِل جهازاً لفحص المستخدمين والملفات المُدارة." : "Connect a device to inspect users and managed profiles.")}</pre></div></div></section>;
}

function ApkWorkspace({ language, isLive, install }: { language: InterfaceLanguage; isLive: boolean; install: (file?: File) => Promise<void> }) {
  const ar = language === "ar";
  return <section className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="service-card p-6"><p className="kicker text-[#687584]">{ar ? "منضدة APK" : "APK desk"}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">{ar ? "اختر ملف APK. راجع أمر التثبيت الحقيقي." : "Pick an APK. See the real install command."}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#526273]">{ar ? "يُنقل ملف APK المختار عبر جلسة USB ADB النشطة إلى مسار مؤقت على الجهاز، ثم يثبت بواسطة pm install -r -g. لا يُرفع أي ملف إلى هذا التطبيق." : "The selected APK is transferred over the active USB ADB session to a temporary device path, then installed using `pm install -r -g`. Nothing is uploaded to this application."}</p><label className={`action-button mt-6 inline-flex items-center border px-4 py-3 text-sm font-semibold ${isLive ? "border-[#14253a] bg-[#14253a] text-[#f6f2ea]" : "cursor-not-allowed border-[#d8d1c4] bg-[#eee9df] text-[#687584]"}`}><Upload className="mr-2" size={16} />{ar ? "اختيار APK" : "Select APK"}<input disabled={!isLive} type="file" accept=".apk,application/vnd.android.package-archive" className="sr-only" onChange={(event) => install(event.target.files?.[0])} /></label><p className="mono mt-5 text-[0.68rem] text-[#687584]">transfer → /data/local/tmp/&lt;sanitized-name&gt; · install → pm install -r -g &lt;path&gt;</p></div><div className="overflow-hidden border border-[#d8d1c4] bg-[#fffdf8]"><img src="/manus-storage/privacy-workstation_68e7bcbd.jpg" alt="Android phone ready for application management" className="h-48 w-full object-cover object-[55%_45%]" /><div className="p-5"><p className="kicker text-[#687584]">{ar ? "ضوابط التثبيت" : "Installer guardrails"}</p><p className="mt-2 text-sm leading-6 text-[#526273]">{ar ? "يبقى الجهاز هو المرجع النهائي. تحفظ عدم مطابقة التوقيع والتثبيت المحظور وأخطاء السياسة كما هي في السجل." : "The device remains the final authority. Signature mismatches, blocked installs, and policy errors are retained verbatim in the ledger."}</p></div></div></div><div className="border-l-2 border-[#d39152] bg-[#fff2e1] p-4 text-sm leading-6 text-[#6d5133]"><strong>{ar ? "استخدم مصادر APK موثوقة." : "Use trusted APK sources."}</strong> {ar ? "تنقل هذه اللوحة الملف الذي تختاره؛ ولا تتحقق من الناشر أو تفحص الشهادة أو تتجاوز وسائل حماية تثبيت أندرويد." : "This desk transfers the file you choose; it does not verify the publisher, inspect a certificate, or bypass Android installation protections."}</div></section>;
}

function FilesWorkspace({ language, isLive, path, setPath, files, loading, load }: { language: InterfaceLanguage; isLive: boolean; path: string; setPath: (value: string) => void; files: DeviceFile[]; loading: boolean; load: () => Promise<void> }) {
  const ar = language === "ar";
  return <section className="space-y-5"><div className="service-card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="kicker text-[#687584] dark:text-slate-400">{ar ? "منضدة الملفات" : "File workbench"}</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{ar ? "استعرض مساراً على الجهاز عبر مزامنة ADB." : "Browse a device path with ADB Sync."}</h2></div><div className="flex w-full gap-2 sm:max-w-lg"><input disabled={!isLive} value={path} onChange={(event) => setPath(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} className="h-10 min-w-0 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-3 mono text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500" /><Button disabled={!isLive || loading} onClick={load} className="action-button bg-[#14253a] text-[#f6f2ea] hover:bg-[#223952] dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700">{loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}</Button></div></div><p className="mt-4 text-xs leading-5 text-[#687584] dark:text-slate-400">{ar ? "تستخدم العمليات الأساسية قناة مزامنة ملفات ADB. أدخل عمليات الملفات المتقدمة أو المدمرة في تفاصيل المشغّل كي يُحفظ أمرها الدقيق." : "Basic actions use the ADB file-sync channel. Advanced destructive file operations should be entered in Operator detail so their exact command is preserved."}</p></div><div className="service-card overflow-hidden"><div className="flex items-center justify-between border-b border-[#d8d1c4] bg-[#f3efe6] px-4 py-3 dark:border-slate-800 dark:bg-slate-800/80"><p className="mono text-xs text-[#526273] dark:text-slate-300">{path}</p><span className="text-xs text-[#687584] dark:text-slate-400">{files.length} {ar ? "عنصر" : "entries"}</span></div><div className="min-h-64">{!isLive ? <div className="grid min-h-64 place-items-center text-sm text-[#687584] dark:text-slate-400">{ar ? "فوض جهازاً لاستعراض الملفات." : "Authorize a device to browse files."}</div> : files.length === 0 ? <div className="grid min-h-64 place-items-center text-sm text-[#687584] dark:text-slate-400">{ar ? "اختر التحديث لقراءة هذا المسار." : "Select refresh to read this path."}</div> : files.map((file) => <div className="flex items-center gap-3 border-b border-[#eee8dc] px-4 py-3 dark:border-slate-800" key={file.name}>{file.isDirectory ? <Folder size={17} className="text-[#59869c] dark:text-cyan-400" /> : <FileText size={17} className="text-[#687584] dark:text-slate-400" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="mono text-[0.63rem] text-[#687584] dark:text-slate-400">{file.isDirectory ? (ar ? "مجلد" : "directory") : `${file.size.toLocaleString()} ${ar ? "بايت" : "bytes"}`}</p></div><ChevronRight size={16} className="text-[#a6b3be] dark:text-slate-500" /></div>)}</div></div></section>;
}
