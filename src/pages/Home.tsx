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
import { createCaseId, exportTimestampedCaseBundle } from "@/lib/caseBundle";
import { AlertTriangle, AppWindow, ArrowRight, ArrowUpDown, Bot, Boxes, Check, CheckCircle2, CheckSquare, ChevronRight, CircleAlert, ClipboardCheck, ClipboardList, Cpu, Download, Eye, EyeOff, FileArchive, FileText, Filter, Folder, HardDrive, History, HelpCircle, Info, Keyboard, Languages, Layers, ListFilter, Loader2, Lock, LockKeyhole, MonitorUp, Moon, PackageOpen, PauseCircle, Play, PlugZap, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Square, TerminalSquare, Trash2, Unplug, Upload, Usb, UsersRound, Sun, X } from "lucide-react";
import GeminiChatWorkspace from "@/components/GeminiChatWorkspace";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppCategoryBadge, PackageStatusBadge, DebloatExecutionBadge, CategoryGlyph } from "@/components/AppCategoryBadge";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import {
  type DebloatTier,
  type DebloatItem,
  type DebloatPreset,
  ALL_PRESETS,
  SAMSUNG_PRESET,
  TRANSSION_PRESET,
  getPresetForManufacturer,
  isPackageProtected,
  GLOBAL_PROTECTED_PACKAGES,
} from "@/data/presets";
import { DebloatTierSuite } from "@/components/DebloatTierSuite";
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

type Workspace = "overview" | "chat" | "debloat" | "degoogle" | "logcat" | "privacy" | "mirror" | "profiles" | "apk" | "files" | "evidence" | "history" | "about";
type InterfaceLanguage = "en" | "ar" | "other";
type Receipt = CommandResult & { label: string; authority: "USB" | "Root" | "Browser"; restore?: string };
type ReceiptArchive = { id: string; name: string; createdAt: string; updatedAt: string; receipts: HistoryReceipt[] };

const nav: Array<{ id: Workspace; label: string; icon: typeof Smartphone }> = [
  { id: "overview", label: "Device desk", icon: Smartphone },
  { id: "chat", label: "Gemini Chat", icon: Bot },
  { id: "debloat", label: "Debloat", icon: PackageOpen },
  { id: "degoogle", label: "De-Google", icon: ShieldCheck },
  { id: "logcat", label: "Logcat", icon: TerminalSquare },
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
    nav: { overview: "Device desk", chat: "Gemini Chat", debloat: "Debloat", degoogle: "De-Google", logcat: "Logcat", privacy: "Privacy", mirror: "Mirror", profiles: "Work profiles", apk: "APK desk", files: "Files", evidence: "Evidence Snapshot", history: "Receipt history", about: "About" },
    ready: "ready",
    inspect: "Inspect first. Change only what you can explain.",
    about: "About Forensicslarn",
  },
  ar: {
    direction: "rtl" as const,
    language: "لغة الواجهة",
    choices: { en: "English", ar: "العربية", other: "لغات أخرى" },
    nav: { overview: "لوحة الجهاز", chat: "مساعد Gemini", debloat: "تنظيف التطبيقات", degoogle: "إزالة Google", logcat: "سجل النظام (Logcat)", privacy: "الخصوصية", mirror: "نسخ الشاشة", profiles: "ملفات العمل", apk: "حزمة APK", files: "الملفات", evidence: "لقطة الأدلة", history: "أرشيف الإيصالات", about: "حول" },
    ready: "جاهز",
    inspect: "افحص أولاً. غيّر فقط ما تستطيع شرحه.",
    about: "حول Forensicslarn",
  },
  other: {
    direction: "ltr" as const,
    language: "Interface language",
    choices: { en: "English", ar: "العربية", other: "Other languages" },
    nav: { overview: "Device desk", chat: "Gemini Chat", debloat: "Debloat", degoogle: "De-Google", logcat: "Logcat", privacy: "Privacy", mirror: "Mirror", profiles: "Work profiles", apk: "APK desk", files: "Files", evidence: "Evidence Snapshot", history: "Receipt history", about: "About" },
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
  const [query, setQuery] = useState("");
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [selectedDebloatTier, setSelectedDebloatTier] = useState<DebloatTier | "all">("all");
  const [selectedPresetId, setSelectedPresetId] = useState<string | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actionMode, setActionMode] = useState<DebloatExecutionLevel | "restore">("safe");
  const [expertAckCheckbox, setExpertAckCheckbox] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<AppCategoryId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "uninstalled">("all");
  const [sortBy, setSortBy] = useState<SortCriterion>("category");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
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
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentPkg: string;
    currentAction?: "uninstall" | "disable" | "restore";
    action: DebloatExecutionLevel | "restore" | "disable" | "uninstall" | "batch";
    succeeded: string[];
    failed: Array<{ id: string; error: string }>;
    skipped?: string[];
    aborted?: boolean;
  } | null>(null);
  const [packageActionOverrides, setPackageActionOverrides] = useState<Record<string, "uninstall" | "disable">>({});
  const abortBulkRef = useRef(false);

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

  // Pre-select curated preset if device manufacturer matches (Samsung / Transsion)
  useEffect(() => {
    if (device?.manufacturer) {
      const matchedPreset = getPresetForManufacturer(device.manufacturer);
      if (matchedPreset) {
        setSelectedPresetId(matchedPreset.id);
      }
    }
  }, [device?.manufacturer]);

  const presetItemMap = useMemo(() => {
    const map = new Map<string, DebloatItem>();
    ALL_PRESETS.forEach((preset) => {
      preset.items.forEach((item) => {
        map.set(item.package, item);
      });
    });
    return map;
  }, []);

  const activePreset = useMemo(() => {
    if (selectedPresetId === "all") return undefined;
    return ALL_PRESETS.find((p) => p.id === selectedPresetId);
  }, [selectedPresetId]);

  const getPackageTier = (pkgId: string, item?: CategorizedPackage): DebloatTier => {
    const pItem = presetItemMap.get(pkgId);
    if (pItem) return pItem.tier;
    if (!item) return "safe";
    if (item.category.id === "telemetry" || item.labels.some((l) => l.toLowerCase().includes("telemetry"))) {
      return "telemetry";
    }
    if (item.removal === "Advanced" || item.removal === "Expert") {
      return "advanced";
    }
    return "safe";
  };

  const getPackageAction = (pkgId: string): "uninstall" | "disable" => {
    if (packageActionOverrides[pkgId]) return packageActionOverrides[pkgId];
    const pItem = presetItemMap.get(pkgId);
    if (pItem?.recommendedAction) return pItem.recommendedAction;
    if (actionMode === "advanced" || actionMode === "expert") return "uninstall";
    return "disable";
  };

  const categoryStats = useMemo(() => {
    return calculateCategoryStats(categorizedInventory);
  }, [categorizedInventory]);

  const mappedPackages = useMemo(() => {
    return categorizedInventory.filter((item) => item.hasCommunityContext);
  }, [categorizedInventory]);

  const visibleCategorizedPackages = useMemo(() => {
    let list = categorizedInventory;

    // 1. Filter by preset if a manufacturer suite is selected
    if (activePreset) {
      const presetPkgSet = new Set(activePreset.items.map((i) => i.package));
      list = list.filter((item) => presetPkgSet.has(item.id));
    }

    // 2. Filter by 3-way tier (safe, telemetry, advanced)
    if (selectedDebloatTier !== "all") {
      list = list.filter((item) => getPackageTier(item.id, item) === selectedDebloatTier);
    }

    if (recommendedOnly) {
      list = list.filter((item) => item.removal === "Recommended");
    }

    if (categoryFilter !== "all") {
      list = list.filter((item) => item.category.id === categoryFilter);
    }

    if (statusFilter !== "all") {
      list = list.filter((item) => item.status === statusFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((item) => {
        const pItem = presetItemMap.get(item.id);
        const pName = pItem ? pItem.name.toLowerCase() : "";
        const pDesc = pItem ? pItem.description.toLowerCase() : "";
        const searchable = `${item.id} ${pName} ${pDesc} ${item.category.name} ${item.category.nameAr} ${item.list} ${item.description} ${item.labels.join(" ")}`.toLowerCase();
        return searchable.includes(q);
      });
    }

    return sortCategorizedPackages(list, sortBy, sortOrder);
  }, [categorizedInventory, activePreset, selectedDebloatTier, recommendedOnly, categoryFilter, statusFilter, query, sortBy, sortOrder, presetItemMap]);

  const tierCounts = useMemo(() => {
    const baseList = activePreset
      ? categorizedInventory.filter((item) => activePreset.items.some((i) => i.package === item.id))
      : categorizedInventory;

    let safe = 0;
    let telemetry = 0;
    let advanced = 0;

    baseList.forEach((item) => {
      const tier = getPackageTier(item.id, item);
      if (tier === "safe") safe++;
      else if (tier === "telemetry") telemetry++;
      else if (tier === "advanced") advanced++;
    });

    return {
      safe,
      telemetry,
      advanced,
      all: baseList.length,
    };
  }, [categorizedInventory, activePreset, presetItemMap]);

  const quickSelectTier = (tier: DebloatTier) => {
    const matchingIds = visibleCategorizedPackages
      .filter((pkg) => getPackageTier(pkg.id, pkg) === tier && pkg.status === "enabled" && !isPackageProtected(pkg.id))
      .map((pkg) => pkg.id);
    if (matchingIds.length === 0) {
      toast.info(isArabic ? `لا توجد حزم مفعلة في مستوى ${tier}.` : `No enabled packages found in ${tier} tier.`);
      return;
    }
    setSelected((current) => Array.from(new Set([...current, ...matchingIds])));
    toast.success(
      isArabic
        ? `تم تحديد ${matchingIds.length} حزمة مفعلة في مستوى (${tier}).`
        : `Selected ${matchingIds.length} enabled package(s) in (${tier}) tier.`
    );
  };

  const groupedCategorizedPackages = useMemo(() => {
    const groups = new Map<AppCategoryId, CategorizedPackage[]>();
    visibleCategorizedPackages.forEach((pkg) => {
      const existing = groups.get(pkg.category.id) || [];
      existing.push(pkg);
      groups.set(pkg.category.id, existing);
    });
    return Array.from(groups.entries()).map(([catId, pkgs]) => ({
      category: APP_CATEGORIES[catId],
      packages: pkgs,
    }));
  }, [visibleCategorizedPackages]);

  // Backward compatibility alias for any existing reference
  const visiblePackages = visibleCategorizedPackages;

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
      const profile = await adb.current.connect(targetDevice, (promptMsg) => {
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
      abortBulkRef.current = true;
      setBulkExecuting(false);
      setBulkProgress(null);
      setSelected([]);
      setReviewOpen(false);
      await adb.current.disconnect();
      setDevice(null);
      setPackages([]);
      setDisabledPackages([]);
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

  const executeBulkAction = async (actionParam: DebloatExecutionLevel | "restore" | "disable" | "uninstall", targetIds?: string[]) => {
    const action: DebloatExecutionLevel | "restore" =
      actionParam === "disable" ? "safe" : actionParam === "uninstall" ? "advanced" : actionParam;
    const rawList = targetIds || selected;

    // Strict Guardrail: Never disable, uninstall, or purge GLOBAL_PROTECTED_PACKAGES!
    const list = action === "restore" ? rawList : rawList.filter((id) => !isPackageProtected(id));
    const protectedSkipped = rawList.length - list.length;
    if (protectedSkipped > 0) {
      toast.info(
        isArabic
          ? `تم استبعاد ${protectedSkipped} حزمة نظام محمية عالمياً تلقائياً لحماية جهازك.`
          : `Excluded ${protectedSkipped} globally protected package(s) to protect your device.`
      );
    }

    if (list.length === 0) {
      toast.error(isArabic ? "لم يتم تحديد أي تطبيقات لتنفيذ العملية." : "No applications selected for bulk operation.");
      return;
    }

    if (!device || !isLive) {
      toast.error(isArabic ? "يجب توصيل الجهاز وتفويضه أولاً." : "Connect and authorize a device first.");
      return;
    }

    setReviewOpen(false);
    abortBulkRef.current = false;
    setBulkExecuting(true);
    setBulkProgress({
      current: 0,
      total: list.length,
      currentPkg: list[0],
      action,
      succeeded: [],
      failed: [],
    });

    const succeededList: string[] = [];
    const failedList: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < list.length; i++) {
      if (abortBulkRef.current) {
        setBulkProgress((prev) => (prev ? { ...prev, aborted: true } : null));
        toast.info(isArabic ? "تم إيقاف العملية المجمعة بناءً على طلبك." : "Bulk operation aborted by user.");
        break;
      }

      const id = list[i];
      setBulkProgress((prev) => (prev ? { ...prev, current: i + 1, currentPkg: id } : null));

      try {
        let result: CommandResult;
        if (action === "restore") {
          const isUninstalled = uninstalledPackages.includes(id);
          result = await adb.current.restorePackage(id, isUninstalled ? "uninstalled" : "disabled");
          const cmdExecuted = isUninstalled ? `cmd package install-existing ${id}` : `pm enable ${id}`;
          addReceipt(result, `Restored ${id} for User 0 (bulk)`, "USB", cmdExecuted, false);
          if (result.exitCode === 0) {
            succeededList.push(id);
            setDisabledPackages((current) => current.filter((pkgId) => pkgId !== id));
            setUninstalledPackages((current) => current.filter((pkgId) => pkgId !== id));
          } else {
            failedList.push({ id, error: result.stderr || "Non-zero exit code" });
          }
        } else {
          result = await adb.current.executeDebloatAction(id, action);
          const restoreCmd = DEBLOAT_EXECUTION_LEVELS[action].restoreCommandTemplate(id);
          const label = `${DEBLOAT_EXECUTION_LEVELS[action].label} ${id} (bulk)`;
          addReceipt(result, label, "USB", restoreCmd, false);
          if (result.exitCode === 0) {
            succeededList.push(id);
            if (action === "safe") {
              setDisabledPackages((current) => Array.from(new Set([...current, id])));
            } else {
              setUninstalledPackages((current) => Array.from(new Set([...current, id])));
            }
          } else {
            failedList.push({ id, error: result.stderr || "Non-zero exit code" });
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Command failed";
        failedList.push({ id, error: detail });
        addReceipt({ command: `${action} ${id}`, stdout: "", stderr: detail, exitCode: 1, at: new Date().toISOString() }, `Could not change ${id}`, "USB", undefined, false);
      }

      setBulkProgress((prev) => (prev ? { ...prev, succeeded: [...succeededList], failed: [...failedList] } : null));
      await new Promise((r) => setTimeout(r, 30));
    }

    // Remove succeeded items from selected list
    setSelected((curr) => curr.filter((id) => !succeededList.includes(id)));
    setBulkExecuting(false);

    // Add a single consolidated notification
    if (succeededList.length > 0 || failedList.length > 0) {
      addNotification(
        failedList.length === 0 ? "success" : succeededList.length > 0 ? "warning" : "error",
        {
          en: `Bulk ${action} finished`,
          ar: `اكتملت العملية المجمعة (${action})`,
        },
        {
          en: `${succeededList.length} succeeded${failedList.length > 0 ? `, ${failedList.length} failed` : ""}.`,
          ar: `نجح ${succeededList.length} تطبيق${failedList.length > 0 ? `، وفشل ${failedList.length}` : ""}.`,
        }
      );
    }

    if (succeededList.length > 0) {
      toast.success(
        isArabic
          ? `اكتملت العملية المجمعة: نجح ${succeededList.length} تطبيق${failedList.length > 0 ? `، وفشل ${failedList.length}` : ""}.`
          : `Bulk ${action} finished: ${succeededList.length} succeeded${failedList.length > 0 ? `, ${failedList.length} failed` : ""}.`
      );
      void refreshPackageStatus();
    } else if (failedList.length > 0) {
      toast.error(isArabic ? `فشلت العملية المجمعة لـ ${failedList.length} تطبيق.` : `Bulk ${action} failed for ${failedList.length} packages.`);
    }
  };

  const executeSelectedActions = async () => {
    if (!device || !isLive) {
      toast.error(
        isArabic
          ? "يجب توصيل الجهاز وتفويضه عبر USB أولاً."
          : "Connect and authorize an Android device via WebUSB first."
      );
      return;
    }

    const rawList = [...selected];
    if (rawList.length === 0) {
      toast.error(
        isArabic
          ? "لم يتم تحديد أي حزم للتنفيذ."
          : "No packages checked to execute."
      );
      return;
    }

    // 1. Automatically skip and log any protected packages from GLOBAL_PROTECTED_PACKAGES
    const actionableList: string[] = [];
    const skippedProtectedList: string[] = [];

    rawList.forEach((id) => {
      if (isPackageProtected(id)) {
        skippedProtectedList.push(id);
        console.warn(`[Debloat Guardrail] Automatically skipped protected package: ${id}`);
        addReceipt(
          {
            command: `# SKIPPED (PROTECTED): ${id}`,
            stdout: `Automatically skipped protected package '${id}' (${GLOBAL_PROTECTED_PACKAGES.includes(id) ? "GLOBAL_PROTECTED_PACKAGES" : "Protected"}). Preserved critical system/keyboard component.`,
            stderr: "",
            exitCode: 0,
            at: new Date().toISOString(),
          },
          `Skipped protected package: ${id}`,
          "Browser"
        );
      } else {
        actionableList.push(id);
      }
    });

    if (skippedProtectedList.length > 0) {
      toast.info(
        isArabic
          ? `تم استبعاد وتخطي ${skippedProtectedList.length} حزمة محمية عالمياً تلقائياً لحماية النظام.`
          : `Skipped ${skippedProtectedList.length} globally protected package(s) to protect system.`
      );
    }

    if (actionableList.length === 0) {
      toast.warning(
        isArabic
          ? "جميع الحزم المحددة محمية عالمياً، لم يتم تنفيذ أي عملية."
          : "All checked packages are globally protected; nothing was executed."
      );
      setSelected([]);
      return;
    }

    setReviewOpen(false);
    abortBulkRef.current = false;
    setBulkExecuting(true);

    const total = actionableList.length;
    const succeededList: string[] = [];
    const failedList: Array<{ id: string; error: string }> = [];

    // Initialize progress display
    setBulkProgress({
      current: 0,
      total,
      currentPkg: actionableList[0],
      currentAction: getPackageAction(actionableList[0]),
      action: "batch",
      succeeded: [],
      failed: [],
      skipped: [...skippedProtectedList],
    });

    for (let i = 0; i < total; i++) {
      if (abortBulkRef.current) {
        setBulkProgress((prev) => (prev ? { ...prev, aborted: true } : null));
        toast.info(
          isArabic ? "تم إيقاف تنفيذ العمليات المتبقية." : "Batch execution aborted by user.",
          { id: "batch-exec-status" }
        );
        break;
      }

      const id = actionableList[i];
      const action = getPackageAction(id);

      // Real-time status toast showing real-time progress (e.g. "Processing 5/18...")
      toast.loading(
        isArabic
          ? `جارٍ المعالجة ${i + 1}/${total}... (${id})`
          : `Processing ${i + 1}/${total}... (${id})`,
        { id: "batch-exec-status" }
      );

      // Update real-time progress bar state
      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentPkg: id,
              currentAction: action,
            }
          : null
      );

      try {
        let result: CommandResult;
        if (action === "uninstall") {
          // Run `pm uninstall -k --user 0 <package>` for uninstall actions
          result = await adb.current.uninstallKeepData(id);
          const restoreCmd = `cmd package install-existing ${id}`;
          addReceipt(result, `Uninstall -k: ${id} for User 0`, "USB", restoreCmd, false);
          if (result.exitCode === 0) {
            succeededList.push(id);
            setUninstalledPackages((current) => Array.from(new Set([...current, id])));
            setDisabledPackages((current) => current.filter((pkgId) => pkgId !== id));
          } else {
            failedList.push({ id, error: result.stderr || "Non-zero exit code" });
          }
        } else {
          // Run `pm disable-user --user 0 <package>` for disable actions
          result = await adb.current.disablePackage(id);
          const restoreCmd = `pm enable ${id}`;
          addReceipt(result, `Disable: ${id} for User 0`, "USB", restoreCmd, false);
          if (result.exitCode === 0) {
            succeededList.push(id);
            setDisabledPackages((current) => Array.from(new Set([...current, id])));
            setUninstalledPackages((current) => current.filter((pkgId) => pkgId !== id));
          } else {
            failedList.push({ id, error: result.stderr || "Non-zero exit code" });
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Command failed";
        failedList.push({ id, error: detail });
        addReceipt(
          {
            command: `${action === "uninstall" ? "pm uninstall -k --user 0" : "pm disable-user --user 0"} ${id}`,
            stdout: "",
            stderr: detail,
            exitCode: 1,
            at: new Date().toISOString(),
          },
          `Failed action on ${id}`,
          "USB",
          undefined,
          false
        );
      }

      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              succeeded: [...succeededList],
              failed: [...failedList],
            }
          : null
      );

      // Yield briefly to avoid saturating WebUSB and ensure UI updates
      await new Promise((r) => setTimeout(r, 20));
    }

    // Deselect all succeeded and skipped packages
    setSelected((curr) => curr.filter((id) => !succeededList.includes(id) && !skippedProtectedList.includes(id)));
    setBulkExecuting(false);

    // Final status toast & notification
    if (succeededList.length > 0) {
      toast.success(
        isArabic
          ? `اكتمل تنفيذ الإجراءات المحددة: نجح ${succeededList.length} من ${total}${failedList.length > 0 ? `، وفشل ${failedList.length}` : ""}.`
          : `Batch actions complete: ${succeededList.length} of ${total} succeeded${failedList.length > 0 ? `, ${failedList.length} failed` : ""}.`,
        { id: "batch-exec-status", duration: 5000 }
      );
      void refreshPackageStatus();
    } else if (failedList.length > 0) {
      toast.error(
        isArabic
          ? `فشل تنفيذ الإجراءات لـ ${failedList.length} تطبيق.`
          : `Batch actions failed for ${failedList.length} packages.`,
        { id: "batch-exec-status", duration: 5000 }
      );
    }
  };

  const runQueued = async () => {
    if (actionMode === "restore") {
      await executeBulkAction("restore");
    } else {
      await executeSelectedActions();
    }
  };

  const restore = async (id: string, currentStatus?: PackageStatus | string) => {
    try {
      const isUninstalled = currentStatus === "uninstalled" || uninstalledPackages.includes(id);
      const result = await adb.current.restorePackage(id, isUninstalled ? "uninstalled" : "disabled");
      addReceipt(result, `Attempted restore for ${id} (state: ${isUninstalled ? "uninstalled" : "disabled"})`, "USB");
      if (result.exitCode === 0) {
        setDisabledPackages((current) => current.filter((pkgId) => pkgId !== id));
        setUninstalledPackages((current) => current.filter((pkgId) => pkgId !== id));
      }
      toast.success(language === "ar" ? "اكتمل أمر الاستعادة؛ افحص الإيصال لنتيجة الجهاز." : "Restore command completed; inspect its receipt for device output.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore did not run.");
    }
  };

  const togglePackageStatus = async (pkg: CategorizedPackage) => {
    if (pkg.status === "disabled" || pkg.status === "uninstalled") {
      await restore(pkg.id, pkg.status);
    } else {
      if (isPackageProtected(pkg.id)) {
        toast.error(
          isArabic
            ? `الحزمة [${pkg.id}] محمية عالمياً (لوحة مفاتيح / عنصر نظام حيوي) لمنع تعطل الجهاز.`
            : `Package [${pkg.id}] is globally protected (critical keyboard/system component).`
        );
        return;
      }
      const levelToRun: DebloatExecutionLevel = actionMode === "restore" ? "safe" : actionMode;
      try {
        const result = await adb.current.executeDebloatAction(pkg.id, levelToRun);
        const restoreCmd = DEBLOAT_EXECUTION_LEVELS[levelToRun].restoreCommandTemplate(pkg.id);
        addReceipt(result, `${DEBLOAT_EXECUTION_LEVELS[levelToRun].label}: ${pkg.id} for User 0`, "USB", restoreCmd);
        if (result.exitCode === 0) {
          if (levelToRun === "safe") {
            setDisabledPackages((current) => Array.from(new Set([...current, pkg.id])));
          } else {
            setUninstalledPackages((current) => Array.from(new Set([...current, pkg.id])));
          }
          toast.success(language === "ar" ? `تم تطبيق ${levelToRun} على ${pkg.id}` : `Applied ${levelToRun} on ${pkg.id}`);
        } else {
          toast.error(result.stderr || "Command returned non-zero code.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not change package status.");
      }
    }
  };

  const disableDeGooglePackage = async (id: string, label: string, level: DebloatExecutionLevel = "safe") => {
    if (isPackageProtected(id)) {
      toast.error(
        isArabic
          ? `الحزمة [${id}] محمية عالمياً لمنع تعطل الجهاز.`
          : `Package [${id}] is globally protected to prevent system failure.`
      );
      return false;
    }
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
    ? [{ label: "تحكم الجهاز ومساعد الذكاء الاصطناعي", items: nav.slice(0, 7) }, { label: "المراجعة والأمان", items: nav.slice(7, 10) }, { label: "الأدلة والتاريخ", items: nav.slice(10) }]
    : [{ label: "Device control & AI Assistant", items: nav.slice(0, 7) }, { label: "Review & safety", items: nav.slice(7, 10) }, { label: "Evidence & history", items: nav.slice(10) }];
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
            <button
              onClick={() => setActive("chat")}
              className={`action-button inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active === "chat"
                  ? "border-[#14253a] bg-[#c8f04a] text-[#14253a] dark:border-[#c8f04a]"
                  : "border-[#d8d1c4] bg-[#fffdf8] text-[#14253a] hover:bg-[#e6f4bb] dark:border-[#2f4860] dark:bg-[#14253a] dark:text-[#f6f2ea]"
              }`}
              title={isArabic ? "مساعد Gemini الذكي" : "Gemini AI Assistant"}
            >
              <Bot size={13} className={active === "chat" ? "text-[#14253a]" : "text-[#54730f] dark:text-[#c8f04a]"} />
              <span>{isArabic ? "مساعد Gemini" : "Gemini AI"}</span>
            </button>
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
                { label: "Inventory", value: isLive ? `${packages.length} found (${disabledPackages.length} disabled)` : "No receipt", note: catalog.length ? `${mappedPackages.length} have community context` : "command: pm list packages -u", icon: Boxes },
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
                selectedCategory={categoryFilter}
                onSelectCategory={(cat) => {
                  setCategoryFilter(cat);
                  setActive("debloat");
                }}
                language={language}
              />
            )}

            <div className="service-card p-5 sm:p-6 bg-gradient-to-r from-[#14253a] to-[#1e3a58] text-[#f6f2ea] border-[#2f4860]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[#c8f04a] bg-[#c8f04a]/10 px-2 py-0.5 rounded border border-[#c8f04a]/30">
                      <Sparkles size={11} />
                      {isArabic ? "ذكاء اصطناعي مدمج" : "Integrated AI"}
                    </span>
                    <span className="mono text-xs text-[#a6b3be]">Gemini 3.8 / 3.5 / 3.1 Pro & Lite</span>
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-white">
                    {isArabic ? "مساعد Gemini الذكي لأجهزة أندرويد" : "Gemini Android Intelligence Assistant"}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#c1cdd8] max-w-2xl">
                    {isArabic
                      ? "روبوت محادثة متعدد الأدوار ومدعوم بنماذج Gemini الأحدث لتحليل أوامر ADB، تدقيق أمان الحزم، فحص أذونات التطبيقات، وحل مشاكل أندرويد المعقدة."
                      : "Multi-turn assistant powered by Gemini models to help analyze ADB commands, audit package security, verify runtime permissions, and troubleshoot Android system issues."}
                  </p>
                </div>
                <Button
                  onClick={() => setActive("chat")}
                  className="shrink-0 bg-[#c8f04a] hover:bg-[#d6fa5c] text-[#14253a] font-semibold text-xs h-9 px-4 rounded-md shadow-sm flex items-center gap-2"
                >
                  <Bot size={15} />
                  <span>{isArabic ? "فتح المحادثة" : "Open Gemini Chat"}</span>
                  <ArrowRight size={14} className={isArabic ? "rotate-180" : ""} />
                </Button>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
              <div className="service-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="kicker text-[#687584]">Receipt sequence</p><h3 className="mt-1 text-xl font-bold tracking-[-0.04em]">Controlled connection</h3></div><Usb className="text-[#c8a800]" /></div><ol className="mt-6 grid gap-4 sm:grid-cols-3">{[["01", "Enable USB debugging", "Developer options → USB debugging."], ["02", "Approve device key", "Browser chooser, then Android trust prompt."], ["03", "Read the receipt", "The right rail retains command, output, and restore." ]].map(([step, title, copy]) => <li key={step} className="border-l-2 border-[#c8f04a] bg-[#f3efe6] p-3"><p className="mono text-xs text-[#59869c]">RECEIPT / {step}</p><p className="mt-2 text-sm font-semibold">{title}</p><p className="mono mt-1 text-[0.65rem] leading-5 text-[#687584]">{copy}</p></li>)}</ol></div>
              <div className="overflow-hidden border border-[#d8d1c4] bg-[#fffdf8]"><img src="/manus-storage/device-inspection-panel_29038d16.jpg" alt="Device inspection tools" className="h-40 w-full object-cover" /><div className="p-5"><p className="kicker text-[#687584]">Control discipline</p><p className="mt-2 text-sm leading-6 text-[#526273]">Actions never silently elevate permission. A failed command remains visible, and a package action records a restoration command when a normal-user restoration path exists.</p></div></div>
            </div>
          </section>
        )}

        {active === "debloat" && (
          <section className="space-y-5">
            <div className="service-card overflow-hidden">
              <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
                <div>
                  <p className="kicker text-[#687584]">{debloatCopy.context}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{debloatCopy.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526273]">{debloatCopy.description}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Button
                    variant="outline"
                    onClick={refreshCatalog}
                    disabled={catalogLoading}
                    className="action-button border-[#14253a] bg-transparent text-[#14253a] hover:bg-[#e6f4bb]"
                  >
                    {catalogLoading ? <Loader2 className="mr-2 animate-spin" size={15} /> : <RefreshCw className="mr-2" size={15} />}
                    {debloatCopy.refresh}
                  </Button>
                  {isLive && (
                    <Button
                      variant="outline"
                      onClick={refreshPackageStatus}
                      className="action-button border-[#59869c] bg-transparent text-[#263d55] hover:bg-[#d8eef8]"
                    >
                      <RotateCcw className="mr-2" size={15} />
                      {debloatCopy.refreshDevice}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d8d1c4] bg-[#f3efe6] px-5 py-3 text-xs text-[#687584] sm:px-6">
                <div>
                  <span className="mono">{debloatCopy.source}</span> UAD-ng public data · {catalogTime ? `${isArabic ? "تم التحديث" : "refreshed"} ${shortTime(catalogTime)}` : debloatCopy.notDownloaded} · <a href="https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation" target="_blank" rel="noreferrer" className="underline underline-offset-4">{debloatCopy.review}</a>
                </div>
                {isLive && (
                  <div className="mono text-[0.68rem] text-[#526273]">
                    {packages.length} {isArabic ? "حزمة مكتشفة" : "packages found"} · <span className="font-semibold text-[#934639]">{disabledPackages.length}</span> {isArabic ? "معطلة" : "disabled"}
                  </div>
                )}
              </div>
            </div>

            {!isLive ? (
              <EmptyState title={debloatCopy.connectTitle} copy={debloatCopy.connectDetail} action={connect} label={isArabic ? "صِل وفوض" : "Connect & authorize"} />
            ) : !catalog.length ? (
              <EmptyState title={debloatCopy.loadTitle} copy={`${packages.length} ${debloatCopy.loadDetail}`} action={refreshCatalog} label={debloatCopy.refresh} />
            ) : (
              <div className="space-y-5">
                <CategoryBreakdown
                  stats={categoryStats}
                  selectedCategory={categoryFilter}
                  onSelectCategory={setCategoryFilter}
                  language={language}
                />

                {/* Tiered Debloat Presets Suite (Samsung One UI / Transsion / Global Guardrails) */}
                <DebloatTierSuite
                  selectedTier={selectedDebloatTier}
                  onSelectTier={setSelectedDebloatTier}
                  activePresetId={selectedPresetId}
                  onSelectPreset={setSelectedPresetId}
                  detectedManufacturer={device?.manufacturer}
                  isArabic={isArabic}
                  tierCounts={tierCounts}
                  onQuickSelectTier={quickSelectTier}
                />

                <div className="service-card p-4 space-y-3 dark:bg-slate-900/90 dark:border-slate-800">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687584] dark:text-slate-400" size={15} />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={debloatCopy.search}
                        className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] pl-9 pr-8 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                      />
                      {query && (
                        <button
                          onClick={() => setQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200"
                          aria-label="Clear search"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">{debloatCopy.category}:</span>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as AppCategoryId | "all")}
                        className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                      >
                        <option value="all">{debloatCopy.allCategories} ({packages.length})</option>
                        {ALL_CATEGORY_IDS.map((catId) => {
                          const cat = APP_CATEGORIES[catId];
                          const count = categoryStats.counts[catId] || 0;
                          return (
                            <option key={catId} value={catId}>
                              {isArabic ? cat.nameAr : cat.name} ({count})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">{debloatCopy.status}:</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as "all" | "enabled" | "disabled" | "uninstalled")}
                        className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                      >
                        <option value="all">{debloatCopy.allStatuses} ({categoryStats.total})</option>
                        <option value="enabled">{debloatCopy.enabledOnly} ({categoryStats.enabled})</option>
                        <option value="disabled">{debloatCopy.disabledOnly} ({categoryStats.disabled})</option>
                        <option value="uninstalled">{isArabic ? "غير المثبتة للمستخدم 0" : "Uninstalled for User 0"} ({categoryStats.uninstalled})</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">{debloatCopy.sortBy}:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortCriterion)}
                        className="h-10 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                      >
                        <option value="category">{debloatCopy.sortCategory}</option>
                        <option value="status">{debloatCopy.sortStatus}</option>
                        <option value="id">{debloatCopy.sortPackageId}</option>
                        <option value="risk">{debloatCopy.sortRisk}</option>
                      </select>
                      <button
                        onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                        className="action-button h-10 px-2.5 border border-[#d8d1c4] bg-[#fffdf8] hover:bg-[#f3efe6] text-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        title={sortOrder === "asc" ? "Ascending" : "Descending"}
                      >
                        <ArrowUpDown size={14} className={sortOrder === "desc" ? "rotate-180" : ""} />
                      </button>
                    </div>
                  </div>

                  {/* Debloat Execution Level Selector & Badge Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#eee7da] dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label htmlFor="debloat-level-select" className="mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[#526273] dark:text-slate-300 shrink-0">
                          {isArabic ? "مستوى التنفيذ:" : "Execution Level:"}
                        </label>
                        <select
                          id="debloat-level-select"
                          value={actionMode}
                          onChange={(e) => {
                            setActionMode(e.target.value as DebloatExecutionLevel | "restore");
                            setExpertAckCheckbox(false);
                          }}
                          className="h-8 border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs font-semibold outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                        >
                          <option value="safe">
                            {isArabic ? "آمن (تعطيل للمستخدم 0)" : "Safe (Disable)"} — pm disable-user
                          </option>
                          <option value="advanced">
                            {isArabic ? "متقدم (إلغاء وإبقاء البيانات)" : "Advanced (Uninstall & Keep Data)"} — pm uninstall -k
                          </option>
                          <option value="expert">
                            {isArabic ? "خبير (إزالة كاملة)" : "Expert (Full Purge)"} — pm uninstall
                          </option>
                          <option value="restore">
                            {isArabic ? "استعادة تكيفية" : "Restore / Re-enable (Adaptive)"}
                          </option>
                        </select>
                      </div>

                      {actionMode !== "restore" ? (
                        <DebloatExecutionBadge level={actionMode} language={language} />
                      ) : (
                        <span className="inline-flex items-center gap-1 border border-[#b9da71] bg-[#eef8cd] px-2 py-0.5 text-[0.65rem] font-semibold text-[#40631b]">
                          <RotateCcw size={11} className="shrink-0 text-[#4d7c0f]" />
                          <span>{isArabic ? "استعادة تكيفية" : "Adaptive Restore"}</span>
                        </span>
                      )}
                    </div>

                    <div className="mono text-[0.68rem] text-[#687584]">
                      {categoryStats.uninstalled > 0 && (
                        <span className="text-[#c2362b] font-semibold mr-2">
                          {categoryStats.uninstalled} {isArabic ? "تطبيق أزيل للمستخدم 0" : "uninstalled for User 0"} ·
                        </span>
                      )}
                      {visibleCategorizedPackages.length} {debloatCopy.matched} · {selected.length} {debloatCopy.selected}
                    </div>
                  </div>

                  {/* Warning banner if Expert mode is active */}
                  {actionMode === "expert" && (
                    <div className="flex items-start gap-2.5 border border-[#fca5a5] bg-[#fef2f2] p-3 text-xs text-[#991b1b] rounded-xs mt-1">
                      <AlertTriangle size={16} className="shrink-0 text-[#dc2626] mt-0.5" />
                      <div>
                        <p className="font-bold">
                          {isArabic
                            ? "تحذير: في وضع الخبير (إزالة كاملة)، سيتم مسح جميع بيانات التطبيقات المحلية وذاكرة التخزين المؤقت والحسابات بشكل نهائي!"
                            : "WARNING: In Expert mode, all local application data, caches, and accounts will be permanently erased!"}
                        </p>
                        <p className="mt-0.5 text-[0.7rem] opacity-90">
                          {isArabic
                            ? "ينفذ: pm uninstall --user 0. يتم حذف أدلة /data/user/0 نهائياً. الاستعادة اللاحقة تعيد ملف APK فقط دون البيانات."
                            : "Executes: pm uninstall --user 0. Deletes user directories in /data/user/0 permanently. Reinstalling later will restore the APK binary, but NOT user data."}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#eee7da]">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center border border-[#d8d1c4] bg-[#f8f5ee] p-0.5">
                        <button
                          onClick={() => setGroupByCategory(true)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${groupByCategory ? "bg-[#14253a] text-white shadow-xs" : "text-[#526273] hover:text-[#14253a]"}`}
                        >
                          <Layers size={13} />
                          {debloatCopy.groupByCategory}
                        </button>
                        <button
                          onClick={() => setGroupByCategory(false)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${!groupByCategory ? "bg-[#14253a] text-white shadow-xs" : "text-[#526273] hover:text-[#14253a]"}`}
                        >
                          <ListFilter size={13} />
                          {debloatCopy.flatTable}
                        </button>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-[#526273] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={recommendedOnly}
                          onChange={(event) => setRecommendedOnly(event.target.checked)}
                          className="accent-[#14253a] h-4 w-4"
                        />
                        {debloatCopy.recommended}
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      {selected.length > 0 && (
                        <span className="mono text-xs font-semibold text-[#14253a]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#59869c] bg-[#e8f1f7] text-[#1d5c8a]">
                            {selected.length} {isArabic ? "محدد" : "selected"}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bulk Selection Quick Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#eee7da] dark:border-slate-800 bg-[#faf7f0] dark:bg-slate-900/60 -mx-4 -mb-4 px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.68rem] font-bold text-[#526273] dark:text-slate-400 uppercase tracking-[0.06em] mr-1">
                        {isArabic ? "تحديد سريع:" : "Quick Select:"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const visibleIds = visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id)).map((p) => p.id);
                          setSelected((current) => Array.from(new Set([...current, ...visibleIds])));
                        }}
                        className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#d8d1c4] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-800 hover:bg-[#eee8db] text-[#14253a] dark:text-slate-200"
                      >
                        {isArabic ? "الكل الظاهر" : "All Visible"} ({visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id)).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const recIds = visibleCategorizedPackages.filter((p) => p.removal === "Recommended" && !isPackageProtected(p.id)).map((p) => p.id);
                          setSelected((current) => Array.from(new Set([...current, ...recIds])));
                        }}
                        className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#b9da71] dark:border-emerald-800 bg-[#eef8cd] dark:bg-emerald-950/60 hover:bg-[#e4f2b8] text-[#3f7a18] dark:text-emerald-300"
                      >
                        {isArabic ? "الموصى بها" : "Recommended"} ({visibleCategorizedPackages.filter((p) => p.removal === "Recommended" && !isPackageProtected(p.id)).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const enabledIds = visibleCategorizedPackages.filter((p) => p.status === "enabled" && !isPackageProtected(p.id)).map((p) => p.id);
                          setSelected((current) => Array.from(new Set([...current, ...enabledIds])));
                        }}
                        className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#d8d1c4] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-800 hover:bg-[#eee8db] text-[#14253a] dark:text-slate-200"
                      >
                        {isArabic ? "المفعلة" : "Enabled"} ({visibleCategorizedPackages.filter((p) => p.status === "enabled" && !isPackageProtected(p.id)).length})
                      </button>

                      {/* Tier Quick Select shortcuts */}
                      <button
                        type="button"
                        onClick={() => quickSelectTier("safe")}
                        className="action-button h-7 px-2 text-[0.68rem] font-semibold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                        title={isArabic ? "تحديد الحزم الآمنة المفعلة" : "Select safe enabled packages"}
                      >
                        {isArabic ? "آمن" : "Safe"} ({tierCounts.safe})
                      </button>
                      <button
                        type="button"
                        onClick={() => quickSelectTier("telemetry")}
                        className="action-button h-7 px-2 text-[0.68rem] font-semibold border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100"
                        title={isArabic ? "تحديد حزم التتبع المفعلة" : "Select telemetry enabled packages"}
                      >
                        {isArabic ? "تتبع" : "Telemetry"} ({tierCounts.telemetry})
                      </button>
                      <button
                        type="button"
                        onClick={() => quickSelectTier("advanced")}
                        className="action-button h-7 px-2 text-[0.68rem] font-semibold border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                        title={isArabic ? "تحديد الحزم المتقدمة المفعلة" : "Select advanced enabled packages"}
                      >
                        {isArabic ? "متقدم" : "Advanced"} ({tierCounts.advanced})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const disIds = visibleCategorizedPackages.filter((p) => p.status === "disabled").map((p) => p.id);
                          setSelected((current) => Array.from(new Set([...current, ...disIds])));
                        }}
                        className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#d8d1c4] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-800 hover:bg-[#eee8db] text-[#14253a] dark:text-slate-200"
                      >
                        {isArabic ? "المعطلة" : "Disabled"} ({visibleCategorizedPackages.filter((p) => p.status === "disabled").length})
                      </button>
                      {categoryStats.uninstalled > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const uninstalledIds = visibleCategorizedPackages.filter((p) => p.status === "uninstalled").map((p) => p.id);
                            setSelected((current) => Array.from(new Set([...current, ...uninstalledIds])));
                          }}
                          className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#fca5a5] dark:border-rose-800 bg-[#fff1f1] dark:bg-rose-950/60 hover:bg-[#fee2e2] text-[#b91c1c] dark:text-rose-300"
                        >
                          {isArabic ? "غير المثبتة" : "Uninstalled"} ({visibleCategorizedPackages.filter((p) => p.status === "uninstalled").length})
                        </button>
                      )}
                      {selected.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelected([])}
                          className="action-button h-7 px-2.5 text-[0.68rem] font-semibold border border-[#dba193] dark:border-rose-800 bg-[#fbe5df] dark:bg-rose-950/80 text-[#c2362b] dark:text-rose-200 hover:bg-[#f8d5cc]"
                        >
                          <X size={12} className="inline mr-1" />
                          {isArabic ? "إلغاء التحديد" : "Deselect All"}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mono text-xs font-semibold text-[#14253a] dark:text-slate-200">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#59869c] dark:border-cyan-800 bg-[#e8f1f7] dark:bg-cyan-950/60 text-[#1d5c8a] dark:text-cyan-300">
                        {selected.length} {isArabic ? "محدد" : "selected"}
                      </span>
                    </div>
                  </div>
                </div>

                {visibleCategorizedPackages.length === 0 ? (
                  <div className="service-card p-10 text-center">
                    <Filter className="mx-auto text-[#8e9eae]" size={28} />
                    <p className="mt-3 text-sm font-semibold">{debloatCopy.noMatches}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setCategoryFilter("all");
                          setStatusFilter("all");
                          setRecommendedOnly(false);
                        }}
                        className="action-button text-xs"
                      >
                        {isArabic ? "إعادة ضبط عوامل التصفية" : "Reset all filters"}
                      </Button>
                    </div>
                  </div>
                ) : groupByCategory ? (
                  <div className="space-y-6">
                    {groupedCategorizedPackages.map(({ category, packages: catPackages }) => {
                      const allCatSelected = catPackages.length > 0 && catPackages.every((p) => selected.includes(p.id));
                      const catEnabledCount = catPackages.filter((p) => p.status === "enabled").length;
                      const catDisabledCount = catPackages.filter((p) => p.status === "disabled").length;

                      const toggleSelectCategory = () => {
                        if (allCatSelected) {
                          const catIds = new Set(catPackages.map((p) => p.id));
                          setSelected((current) => current.filter((id) => !catIds.has(id)));
                        } else {
                          const toAdd = catPackages.map((p) => p.id);
                          setSelected((current) => Array.from(new Set([...current, ...toAdd])));
                        }
                      };

                      return (
                        <div key={category.id} className="service-card overflow-hidden">
                          <div className="flex flex-col gap-3 border-b border-[#d8d1c4] bg-[#fbf9f3] p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <span className="state-square p-2 border-[#59869c] text-[#263d55]">
                                <CategoryGlyph categoryId={category.id} size={18} />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-bold tracking-[-0.03em]">
                                    {isArabic ? category.nameAr : category.name}
                                  </h3>
                                  <AppCategoryBadge category={category.id} language={language} short={true} />
                                </div>
                                <p className="text-xs text-[#687584] mt-0.5">
                                  {isArabic ? category.descriptionAr : category.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="status-stamp border-[#527321] text-[#527321]">
                                {catEnabledCount} {isArabic ? "مفعل" : "enabled"}
                              </span>
                              {catDisabledCount > 0 && (
                                <span className="status-stamp border-[#934639] text-[#934639]">
                                  {catDisabledCount} {isArabic ? "معطل" : "disabled"}
                                </span>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleSelectCategory}
                                className="action-button h-8 text-xs border-[#d8d1c4]"
                              >
                                {allCatSelected ? <CheckSquare size={13} className="mr-1.5 text-[#527321]" /> : <Square size={13} className="mr-1.5" />}
                                {debloatCopy.selectAllCategory} ({catPackages.length})
                              </Button>
                            </div>
                          </div>

                          <div className="overflow-auto max-h-[420px]">
                            <table className="w-full min-w-[720px] text-left">
                              <thead className="sticky top-0 bg-[#f3efe6] text-[0.64rem] uppercase tracking-[0.12em] text-[#687584]">
                                <tr>
                                  <th className="w-12 px-4 py-3">
                                    <input
                                      type="checkbox"
                                      aria-label={`${debloatCopy.selectAllCategory}: ${isArabic ? category.nameAr : category.name}`}
                                      checked={allCatSelected}
                                      ref={(el) => {
                                        if (el) {
                                          const count = catPackages.filter((p) => selected.includes(p.id)).length;
                                          el.indeterminate = count > 0 && count < catPackages.length;
                                        }
                                      }}
                                      onChange={toggleSelectCategory}
                                      className="h-4 w-4 accent-[#14253a] cursor-pointer"
                                    />
                                  </th>
                                  <th className="px-3 py-3">{debloatCopy.package}</th>
                                  <th className="px-3 py-3">{debloatCopy.status}</th>
                                  <th className="px-3 py-3">{debloatCopy.assessment}</th>
                                  <th className="px-3 py-3">{debloatCopy.purpose}</th>
                                  <th className="px-3 py-3 text-right">{isArabic ? "إجراء" : "Action"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catPackages.map((item) => {
                                  const checked = selected.includes(item.id);
                                  const isProtected = isPackageProtected(item.id);
                                  const presetItem = presetItemMap.get(item.id);
                                  const itemTier = getPackageTier(item.id, item);
                                  return (
                                    <tr key={item.id} className="border-t border-[#e5ded2] dark:border-slate-800 hover:bg-[#fbf8f1] dark:hover:bg-slate-800/50">
                                      <td className="px-4 py-3.5">
                                        {isProtected ? (
                                          <div
                                            title={
                                              isArabic
                                                ? "حزمة محمية عالمياً لمنع تعطل لوحة المفاتيح أو النظام."
                                                : "Globally protected package (keyboard / OS critical). Cannot be debloated."
                                            }
                                            className="flex items-center justify-center w-5 h-5 text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 rounded border border-emerald-300 dark:border-emerald-700"
                                          >
                                            <Lock size={12} />
                                          </div>
                                        ) : (
                                          <input
                                            aria-label={`${debloatCopy.reviewCommands} ${item.id}`}
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              setSelected((current) =>
                                                checked ? current.filter((id) => id !== item.id) : [...current, item.id]
                                              )
                                            }
                                            className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500"
                                          />
                                        )}
                                      </td>
                                      <td className="px-3 py-3.5">
                                        {presetItem && (
                                          <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-xs font-bold text-[#14253a] dark:text-slate-100">
                                              {presetItem.name}
                                            </span>
                                            {presetItem.recommendedAction === "uninstall" ? (
                                              <span className="mono text-[0.6rem] uppercase tracking-wider px-1 py-0.2 bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded font-semibold">
                                                {isArabic ? "إلغاء تثبيت" : "Uninstall"}
                                              </span>
                                            ) : (
                                              <span className="mono text-[0.6rem] uppercase tracking-wider px-1 py-0.2 bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded font-semibold">
                                                {isArabic ? "تعطيل" : "Disable"}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        <p className="mono text-xs font-semibold">{item.id}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[0.67rem] text-[#687584] dark:text-slate-400">
                                            {item.list} {isArabic ? "قائمة" : "list"}
                                          </span>
                                          <span
                                            className={`mono text-[0.62rem] px-1.5 py-0.2 rounded border font-semibold ${
                                              itemTier === "safe"
                                                ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                                                : itemTier === "telemetry"
                                                ? "border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300"
                                                : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                                            }`}
                                          >
                                            {itemTier === "safe"
                                              ? isArabic ? "آمن" : "Safe"
                                              : itemTier === "telemetry"
                                              ? isArabic ? "تتبع" : "Telemetry"
                                              : isArabic ? "متقدم" : "Advanced"}
                                          </span>
                                          {isProtected && (
                                            <span className="mono text-[0.62rem] px-1.5 py-0.2 rounded border border-emerald-500/80 bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 font-bold flex items-center gap-0.5">
                                              <Lock size={9} />
                                              {isArabic ? "محمي عالمياً" : "Protected"}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3.5">
                                        <PackageStatusBadge status={item.status} rawState={item.rawState} language={language} />
                                      </td>
                                      <td className="px-3 py-3.5">
                                        <span className={`inline-flex border px-2 py-0.5 text-[0.63rem] font-semibold uppercase tracking-[0.08em] ${levelTone(item.removal)}`}>
                                          {removalLabel(item.removal, isArabic)}
                                        </span>
                                      </td>
                                      <td className="max-w-sm px-3 py-3.5">
                                        {presetItem ? (
                                          <p className="text-xs leading-5 text-[#526273] dark:text-slate-300 font-medium">
                                            {presetItem.description}
                                          </p>
                                        ) : (
                                          <p className="line-clamp-2 text-xs leading-5 text-[#526273] dark:text-slate-300">
                                            {item.description}
                                          </p>
                                        )}
                                        {isProtected && (
                                          <p className="mt-1 mono text-[0.65rem] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                            <Lock size={10} />
                                            {isArabic
                                              ? "لوحة مفاتيح / عنصر نظام حيوي محمي من التعطيل."
                                              : "Critical keyboard or system component protected against removal."}
                                          </p>
                                        )}
                                        {item.neededBy.length > 0 && (
                                          <p className="mt-1 mono text-[0.64rem] text-[#934639]">
                                            {debloatCopy.neededBy} {item.neededBy.join(", ")}
                                          </p>
                                        )}
                                      </td>
                                      <td className="px-3 py-3.5 text-right">
                                        {isProtected ? (
                                          <button
                                            disabled
                                            className="action-button h-7 px-2 text-xs border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 opacity-80 cursor-not-allowed flex items-center gap-1 ml-auto"
                                            title={
                                              isArabic
                                                ? "الحزمة محمية عالمياً ولا يمكن تعديلها منعاً لتعطل الجهاز."
                                                : "Package is globally protected to prevent device issues."
                                            }
                                          >
                                            <Lock size={11} />
                                            <span>{isArabic ? "محمي" : "Protected"}</span>
                                          </button>
                                        ) : item.status === "disabled" || item.status === "uninstalled" ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => restore(item.id, item.status)}
                                            className="action-button h-7 px-2.5 text-xs text-[#527321] border-[#b9da71] hover:bg-[#eef8cd]"
                                            title={item.status === "uninstalled" ? "cmd package install-existing --user 0" : "pm enable"}
                                          >
                                            <RotateCcw size={12} className="mr-1" />
                                            {item.status === "uninstalled"
                                              ? (isArabic ? "إعادة تثبيت" : "Reinstall")
                                              : debloatCopy.quickEnable}
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => togglePackageStatus(item)}
                                            className={`action-button h-7 px-2.5 text-xs ${
                                              actionMode === "expert"
                                                ? "text-[#dc2626] border-[#fca5a5] hover:bg-[#fef2f2]"
                                                : actionMode === "advanced"
                                                ? "text-[#ea580c] border-[#fed7aa] hover:bg-[#fff7ed]"
                                                : "text-[#934639] border-[#dba193] hover:bg-[#fbe5df]"
                                            }`}
                                            title={
                                              actionMode === "expert"
                                                ? "pm uninstall --user 0 (Purge)"
                                                : actionMode === "advanced"
                                                ? "pm uninstall -k --user 0"
                                                : "pm disable-user --user 0"
                                            }
                                          >
                                            {actionMode === "expert" ? (
                                              <Trash2 size={12} className="mr-1 text-[#dc2626]" />
                                            ) : (
                                              <PauseCircle size={12} className="mr-1" />
                                            )}
                                            {actionMode === "expert"
                                              ? (isArabic ? "إزالة كاملة" : "Purge")
                                              : actionMode === "advanced"
                                              ? (isArabic ? "إلغاء الحزمة" : "Uninstall (-k)")
                                              : debloatCopy.quickDisable}
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="service-card overflow-hidden">
                    <div className="max-h-[560px] overflow-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead className="sticky top-0 bg-[#f3efe6] text-[0.64rem] uppercase tracking-[0.12em] text-[#687584]">
                          <tr>
                            <th className="w-12 px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={isArabic ? "تحديد كل التطبيقات المعروضة" : "Select all visible packages"}
                                checked={visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id)).length > 0 && visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id)).every((p) => selected.includes(p.id))}
                                ref={(el) => {
                                  if (el) {
                                    const nonProtected = visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id));
                                    const count = nonProtected.filter((p) => selected.includes(p.id)).length;
                                    el.indeterminate = count > 0 && count < nonProtected.length;
                                  }
                                }}
                                onChange={(e) => {
                                  const visibleIds = visibleCategorizedPackages.filter((p) => !isPackageProtected(p.id)).map((p) => p.id);
                                  if (e.target.checked) {
                                    setSelected((current) => Array.from(new Set([...current, ...visibleIds])));
                                  } else {
                                    const visibleIdSet = new Set(visibleIds);
                                    setSelected((current) => current.filter((id) => !visibleIdSet.has(id)));
                                  }
                                }}
                                className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer"
                              />
                            </th>
                            <th className="px-3 py-3">{debloatCopy.category}</th>
                            <th className="px-3 py-3">{debloatCopy.package}</th>
                            <th className="px-3 py-3">{debloatCopy.status}</th>
                            <th className="px-3 py-3">{debloatCopy.assessment}</th>
                            <th className="px-3 py-3">{debloatCopy.purpose}</th>
                            <th className="px-3 py-3 text-right">{isArabic ? "إجراء" : "Action"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleCategorizedPackages.slice(0, 160).map((item) => {
                            const checked = selected.includes(item.id);
                            const isProtected = isPackageProtected(item.id);
                            const presetItem = presetItemMap.get(item.id);
                            const itemTier = getPackageTier(item.id, item);
                            return (
                              <tr key={item.id} className="border-t border-[#e5ded2] dark:border-slate-800 hover:bg-[#fbf8f1] dark:hover:bg-slate-800/50">
                                <td className="px-4 py-3.5">
                                  {isProtected ? (
                                    <div
                                      title={
                                        isArabic
                                          ? "حزمة محمية عالمياً لمنع تعطل لوحة المفاتيح أو النظام."
                                          : "Globally protected package (keyboard / OS critical). Cannot be debloated."
                                      }
                                      className="flex items-center justify-center w-5 h-5 text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 rounded border border-emerald-300 dark:border-emerald-700"
                                    >
                                      <Lock size={12} />
                                    </div>
                                  ) : (
                                    <input
                                      aria-label={`${debloatCopy.reviewCommands} ${item.id}`}
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setSelected((current) =>
                                          checked ? current.filter((id) => id !== item.id) : [...current, item.id]
                                        )
                                      }
                                      className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500"
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-3.5">
                                  <AppCategoryBadge category={item.category.id} language={language} short={true} />
                                </td>
                                <td className="px-3 py-3.5">
                                  {presetItem && (
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-xs font-bold text-[#14253a] dark:text-slate-100">
                                        {presetItem.name}
                                      </span>
                                      {presetItem.recommendedAction === "uninstall" ? (
                                        <span className="mono text-[0.6rem] uppercase tracking-wider px-1 py-0.2 bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded font-semibold">
                                          {isArabic ? "إلغاء تثبيت" : "Uninstall"}
                                        </span>
                                      ) : (
                                        <span className="mono text-[0.6rem] uppercase tracking-wider px-1 py-0.2 bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded font-semibold">
                                          {isArabic ? "تعطيل" : "Disable"}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <p className="mono text-xs font-semibold">{item.id}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[0.67rem] text-[#687584] dark:text-slate-400">
                                      {item.list} {isArabic ? "قائمة" : "list"}
                                    </span>
                                    <span
                                      className={`mono text-[0.62rem] px-1.5 py-0.2 rounded border font-semibold ${
                                        itemTier === "safe"
                                          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                                          : itemTier === "telemetry"
                                          ? "border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300"
                                          : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                                      }`}
                                    >
                                      {itemTier === "safe"
                                        ? isArabic ? "آمن" : "Safe"
                                        : itemTier === "telemetry"
                                        ? isArabic ? "تتبع" : "Telemetry"
                                        : isArabic ? "متقدم" : "Advanced"}
                                    </span>
                                    {isProtected && (
                                      <span className="mono text-[0.62rem] px-1.5 py-0.2 rounded border border-emerald-500/80 bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 font-bold flex items-center gap-0.5">
                                        <Lock size={9} />
                                        {isArabic ? "محمي عالمياً" : "Protected"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-3.5">
                                  <PackageStatusBadge status={item.status} rawState={item.rawState} language={language} />
                                </td>
                                <td className="px-3 py-3.5">
                                  <span className={`inline-flex border px-2 py-0.5 text-[0.63rem] font-semibold uppercase tracking-[0.08em] ${levelTone(item.removal)}`}>
                                    {removalLabel(item.removal, isArabic)}
                                  </span>
                                </td>
                                <td className="max-w-sm px-3 py-3.5">
                                  {presetItem ? (
                                    <p className="text-xs leading-5 text-[#526273] dark:text-slate-300 font-medium">
                                      {presetItem.description}
                                    </p>
                                  ) : (
                                    <p className="line-clamp-2 text-xs leading-5 text-[#526273] dark:text-slate-300">
                                      {item.description}
                                    </p>
                                  )}
                                  {isProtected && (
                                    <p className="mt-1 mono text-[0.65rem] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                      <Lock size={10} />
                                      {isArabic
                                        ? "لوحة مفاتيح / عنصر نظام حيوي محمي من التعطيل."
                                        : "Critical keyboard or system component protected against removal."}
                                    </p>
                                  )}
                                  {item.neededBy.length > 0 && (
                                    <p className="mt-1 mono text-[0.64rem] text-[#934639]">
                                      {debloatCopy.neededBy} {item.neededBy.join(", ")}
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-3.5 text-right">
                                  {isProtected ? (
                                    <button
                                      disabled
                                      className="action-button h-7 px-2 text-xs border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 opacity-80 cursor-not-allowed flex items-center gap-1 ml-auto"
                                      title={
                                        isArabic
                                          ? "الحزمة محمية عالمياً ولا يمكن تعديلها منعاً لتعطل الجهاز."
                                          : "Package is globally protected to prevent device issues."
                                      }
                                    >
                                      <Lock size={11} />
                                      <span>{isArabic ? "محمي" : "Protected"}</span>
                                    </button>
                                  ) : item.status === "disabled" || item.status === "uninstalled" ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => restore(item.id, item.status)}
                                      className="action-button h-7 px-2.5 text-xs text-[#527321] border-[#b9da71] hover:bg-[#eef8cd]"
                                      title={item.status === "uninstalled" ? "cmd package install-existing --user 0" : "pm enable"}
                                    >
                                      <RotateCcw size={12} className="mr-1" />
                                      {item.status === "uninstalled"
                                        ? (isArabic ? "إعادة تثبيت" : "Reinstall")
                                        : debloatCopy.quickEnable}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => togglePackageStatus(item)}
                                      className={`action-button h-7 px-2.5 text-xs ${
                                        actionMode === "expert"
                                          ? "text-[#dc2626] border-[#fca5a5] hover:bg-[#fef2f2]"
                                          : actionMode === "advanced"
                                          ? "text-[#ea580c] border-[#fed7aa] hover:bg-[#fff7ed]"
                                          : "text-[#934639] border-[#dba193] hover:bg-[#fbe5df]"
                                      }`}
                                      title={
                                        actionMode === "expert"
                                          ? "pm uninstall --user 0 (Purge)"
                                          : actionMode === "advanced"
                                          ? "pm uninstall -k --user 0"
                                          : "pm disable-user --user 0"
                                      }
                                    >
                                      {actionMode === "expert" ? (
                                        <Trash2 size={12} className="mr-1 text-[#dc2626]" />
                                      ) : (
                                        <PauseCircle size={12} className="mr-1" />
                                      )}
                                      {actionMode === "expert"
                                        ? (isArabic ? "إزالة كاملة" : "Purge")
                                        : actionMode === "advanced"
                                        ? (isArabic ? "إلغاء الحزمة" : "Uninstall (-k)")
                                        : debloatCopy.quickDisable}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Bottom Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[#d8d1c4] dark:border-slate-800 bg-[#f3efe6] dark:bg-slate-900/90 p-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-[#526273] dark:text-slate-300">
                      <span className="font-bold text-[#14253a] dark:text-slate-100">{visibleCategorizedPackages.length}</span> {debloatCopy.matched} ·{" "}
                      <span className="font-bold text-[#14253a] dark:text-slate-100">{selected.length}</span> {debloatCopy.selected}
                    </p>
                    {selected.length > 0 && (
                      <button
                        onClick={() => setSelected([])}
                        className="text-[0.68rem] text-[#934639] dark:text-rose-400 underline hover:text-[#6d3d35] cursor-pointer"
                      >
                        {isArabic ? "مسح التحديد" : "Clear selection"}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Single "Execute Selected Actions" batch button */}
                    <Button
                      disabled={bulkExecuting || selected.length === 0}
                      onClick={executeSelectedActions}
                      className="action-button h-9 px-4 text-xs font-bold bg-[#14253a] text-white hover:bg-[#223952] dark:bg-cyan-600 dark:hover:bg-cyan-500 shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {bulkExecuting ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Play size={14} className="fill-current text-[#c8f04a] dark:text-cyan-200" />
                      )}
                      <span>{isArabic ? "تنفيذ الإجراءات المحددة" : "Execute Selected Actions"}</span>
                      {selected.length > 0 && (
                        <span className="mono bg-white/20 dark:bg-black/30 px-1.5 py-0.5 rounded text-[0.7rem] font-bold">
                          {selected.length}
                        </span>
                      )}
                    </Button>

                    <Button
                      onClick={() => setReviewOpen(true)}
                      disabled={!selected.length || bulkExecuting}
                      variant="outline"
                      className="action-button h-9 border-[#d8d1c4] dark:border-slate-700 text-xs text-[#14253a] dark:text-slate-200 hover:bg-[#eae4d5] dark:hover:bg-slate-800"
                    >
                      {debloatCopy.reviewCommands}
                      <ArrowRight className="ml-1.5" size={14} />
                    </Button>
                  </div>
                </div>

                {/* Floating Bulk Action Bar when items are selected */}
                {selected.length > 0 && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2.5 border border-[#14253a] dark:border-slate-700 bg-[#14253a] dark:bg-slate-900 text-white px-4 py-2.5 shadow-2xl rounded-xs">
                    <span className="mono text-xs font-semibold flex items-center gap-1.5 text-[#c8f04a] dark:text-cyan-300">
                      <CheckSquare size={14} />
                      {selected.length} {isArabic ? "حزم محددة" : "selected"}
                    </span>
                    <div className="h-4 w-px bg-[#2f4860] dark:bg-slate-700" />
                    
                    {/* Single "Execute Selected Actions" batch button */}
                    <Button
                      size="sm"
                      disabled={bulkExecuting}
                      onClick={executeSelectedActions}
                      className="action-button h-8 px-3 text-xs bg-[#c8f04a] text-[#14253a] hover:bg-[#d7f66c] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      {bulkExecuting ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Play size={13} className="fill-current" />
                      )}
                      <span>{isArabic ? "تنفيذ الإجراءات المحددة" : "Execute Selected Actions"}</span>
                      <span className="mono bg-black/15 dark:bg-black/25 px-1.5 py-0.2 rounded text-[0.68rem]">
                        ({selected.length})
                      </span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkExecuting}
                      onClick={() => setReviewOpen(true)}
                      className="action-button h-8 px-2.5 text-xs border-slate-600 dark:border-slate-700 text-slate-200 hover:bg-slate-800"
                    >
                      {isArabic ? "مراجعة" : "Review"}
                    </Button>
                    <button
                      onClick={() => setSelected([])}
                      className="text-xs text-[#a6b3be] hover:text-white ml-1 p-1 cursor-pointer"
                      title={isArabic ? "إلغاء التحديد" : "Deselect all"}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Bulk Execution Progress Modal */}
            {bulkProgress && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-[#14253a]/60 dark:bg-black/80 p-4 backdrop-blur-xs">
                <div className="w-full max-w-lg border border-[#14253a] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-900 shadow-2xl p-6">
                  <div className="flex items-start justify-between border-b border-[#d8d1c4] dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      {bulkExecuting ? (
                        <Loader2 className="animate-spin text-[#14253a] dark:text-cyan-400" size={22} />
                      ) : (
                        <CheckCircle2 className="text-[#3f7a18] dark:text-emerald-400" size={22} />
                      )}
                      <div>
                        <h3 className="text-base font-bold tracking-[-0.03em] text-[#14253a] dark:text-slate-100">
                          {bulkExecuting
                            ? isArabic
                              ? `جارٍ تنفيذ الإجراءات المحددة (${bulkProgress.current}/${bulkProgress.total})...`
                              : `Executing Batch Actions (${bulkProgress.current}/${bulkProgress.total})...`
                            : isArabic
                            ? "اكتمل تنفيذ الإجراءات المحددة"
                            : "Batch Execution Finished"}
                        </h3>
                        <p className="text-xs text-[#526273] dark:text-slate-300 mt-0.5">
                          {bulkProgress.action === "batch"
                            ? isArabic
                              ? "تنفيذ متسلسل عبر جلسة WebUSB ADB (مع تخطي الحزم المحمية تلقائياً)"
                              : "Sequential WebUSB ADB batch execution (with protected packages guardrail)"
                            : bulkProgress.action === "disable"
                            ? isArabic
                              ? "تعطيل للمستخدم 0 (قابل للاستعادة)"
                              : "Disable for User 0 (Reversible)"
                            : bulkProgress.action === "uninstall"
                            ? isArabic
                              ? "إزالة للمستخدم 0 (متقدم)"
                              : "Uninstall for User 0 (Advanced)"
                            : isArabic
                            ? "إعادة تفعيل واستعادة للمستخدم 0"
                            : "Re-enable / Restore for User 0"}
                        </p>
                      </div>
                    </div>

                    {!bulkExecuting && (
                      <button
                        onClick={() => setBulkProgress(null)}
                        className="p-1 text-[#687584] dark:text-slate-400 hover:text-[#14253a] dark:hover:text-white cursor-pointer"
                        aria-label="Close"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  {/* Progress Bar & Counters */}
                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="mono text-[#14253a] dark:text-slate-200">
                        {isArabic ? "التقدم:" : "Progress:"} {bulkProgress.current} / {bulkProgress.total} (
                        {Math.round((bulkProgress.current / bulkProgress.total) * 100)}%)
                      </span>
                      <div className="mono flex items-center gap-2 text-[#526273] dark:text-slate-400">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {bulkProgress.succeeded.length} {isArabic ? "نجح" : "succeeded"}
                        </span>
                        {bulkProgress.failed.length > 0 && (
                          <span className="text-[#c2362b] dark:text-rose-400 font-semibold">
                            · {bulkProgress.failed.length} {isArabic ? "فشل" : "failed"}
                          </span>
                        )}
                        {(bulkProgress.skipped?.length || 0) > 0 && (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            · {bulkProgress.skipped?.length} {isArabic ? "تخطي محمي" : "skipped"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="h-3 w-full bg-[#eee7da] dark:bg-slate-800 overflow-hidden border border-[#d8d1c4] dark:border-slate-700">
                      <div
                        className="h-full bg-[#14253a] dark:bg-cyan-500 transition-all duration-150"
                        style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                      />
                    </div>

                    {bulkExecuting && bulkProgress.currentPkg && (
                      <div className="mono text-xs text-[#526273] dark:text-slate-300 bg-[#f8f5ee] dark:bg-slate-800/80 border border-[#d8d1c4] dark:border-slate-700 p-2 mt-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[#8e9eae] dark:text-slate-400 font-bold">{isArabic ? "الحزمة الحالية:" : "Target:"}</span>
                          <span className="text-[0.68rem] font-semibold px-1.5 py-0.5 rounded bg-[#14253a] text-white dark:bg-cyan-950 dark:text-cyan-300 border border-transparent dark:border-cyan-800">
                            {bulkProgress.currentAction === "uninstall" ? "pm uninstall -k --user 0" : "pm disable-user --user 0"}
                          </span>
                        </div>
                        <p className="truncate font-bold text-[#14253a] dark:text-slate-100">{bulkProgress.currentPkg}</p>
                      </div>
                    )}

                    {bulkProgress.aborted && (
                      <p className="text-xs text-[#934639] dark:text-rose-400 font-semibold mt-1">
                        {isArabic ? "تم إيقاف العمليات المتبقية." : "Remaining operations were aborted."}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-6 flex justify-end gap-2 border-t border-[#eee7da] dark:border-slate-800 pt-4">
                    {bulkExecuting ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          abortBulkRef.current = true;
                        }}
                        className="action-button border-[#dba193] dark:border-rose-800 text-[#c2362b] dark:text-rose-400 hover:bg-[#fbe5df] dark:hover:bg-rose-950/50 text-xs cursor-pointer"
                      >
                        <X size={14} className="mr-1" />
                        {isArabic ? "إيقاف مؤقت للعمليات المتبقية" : "Abort Remaining"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setBulkProgress(null)}
                        className="action-button bg-[#14253a] dark:bg-cyan-600 text-white hover:bg-[#223952] dark:hover:bg-cyan-500 text-xs cursor-pointer"
                      >
                        {isArabic ? "تم وإغلاق" : "Done"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {reviewOpen && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-[#14253a]/45 p-4 backdrop-blur-xs">
                <div className="w-full max-w-2xl border border-[#14253a] bg-[#fffdf8] shadow-2xl">
                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-[#d8d1c4] p-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="kicker text-[#934639]">{debloatCopy.reviewRequired}</p>
                        {actionMode !== "restore" ? (
                          <DebloatExecutionBadge level={actionMode} language={language} />
                        ) : (
                          <span className="inline-flex items-center border border-[#b9da71] bg-[#eef8cd] px-2 py-0.5 text-[0.68rem] font-bold text-[#527321]">
                            {isArabic ? "استعادة تكيفية" : "Adaptive Restore"}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 text-xl font-bold tracking-[-0.04em] text-[#14253a]">
                        {actionMode === "safe"
                          ? (isArabic ? "تعطيل آمن (pm disable-user)" : "Safe Mode (Disable for User 0)")
                          : actionMode === "advanced"
                          ? (isArabic ? "إلغاء متقدم مع إبقاء البيانات (pm uninstall -k)" : "Advanced (Uninstall & Keep Data)")
                          : actionMode === "expert"
                          ? (isArabic ? "إزالة كاملة وضع الخبير (pm uninstall)" : "Expert Mode (Full Purge)")
                          : (isArabic ? "استعادة وإعادة تفعيل" : "Restore & Re-enable")}{" "}
                        · {selected.length} {debloatCopy.package}
                      </h3>
                    </div>
                    <button
                      onClick={() => setReviewOpen(false)}
                      className="p-1 text-[#687584] hover:text-[#14253a]"
                      aria-label="Close dialog"
                    >
                      <X size={19} />
                    </button>
                  </div>

                  {/* Execution Level Selector inside review modal */}
                  <div className="border-b border-[#d8d1c4] bg-[#f7f4ed] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#526273]">
                      {isArabic ? "مستوى التنفيذ المطلوب:" : "Desired Execution Level:"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(["safe", "advanced", "expert", "restore"] as const).map((lvl) => {
                        const isSelected = actionMode === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              setActionMode(lvl);
                              setExpertAckCheckbox(false);
                            }}
                            className={`px-2.5 py-1 text-xs font-bold border transition-colors ${
                              isSelected
                                ? lvl === "expert"
                                  ? "bg-[#b91c1c] text-white border-[#b91c1c]"
                                  : lvl === "advanced"
                                  ? "bg-[#ea580c] text-white border-[#ea580c]"
                                  : lvl === "safe"
                                  ? "bg-[#14253a] text-white border-[#14253a]"
                                  : "bg-[#527321] text-white border-[#527321]"
                                : "bg-white text-[#526273] border-[#d8d1c4] hover:bg-[#eae4d5]"
                            }`}
                          >
                            {lvl === "safe"
                              ? (isArabic ? "آمن" : "Safe")
                              : lvl === "advanced"
                              ? (isArabic ? "متقدم" : "Advanced")
                              : lvl === "expert"
                              ? (isArabic ? "خبير" : "Expert")
                              : (isArabic ? "استعادة" : "Restore")}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Package List with Real Command Preview */}
                  <div className="max-h-[44vh] space-y-2.5 overflow-auto p-5">
                    {selected.map((id) => {
                      const isUninstalled = uninstalledPackages.includes(id);
                      let primaryCmd = "";
                      let restoreCmd = "";

                      if (actionMode === "safe") {
                        primaryCmd = `pm disable-user --user 0 ${id}`;
                        restoreCmd = `pm enable ${id}`;
                      } else if (actionMode === "advanced") {
                        primaryCmd = `pm uninstall -k --user 0 ${id}`;
                        restoreCmd = `cmd package install-existing --user 0 ${id}`;
                      } else if (actionMode === "expert") {
                        primaryCmd = `pm uninstall --user 0 ${id}`;
                        restoreCmd = `cmd package install-existing --user 0 ${id}`;
                      } else {
                        primaryCmd = isUninstalled
                          ? `cmd package install-existing --user 0 ${id}`
                          : `pm enable ${id}`;
                        restoreCmd = `pm disable-user --user 0 ${id}`;
                      }

                      return (
                        <div
                          className={`border p-3 ${
                            actionMode === "expert"
                              ? "border-[#fca5a5] bg-[#fffafa]"
                              : "border-[#d8d1c4] bg-[#fbf9f4]"
                          }`}
                          key={id}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="mono text-xs font-bold text-[#14253a]">
                              {primaryCmd}
                            </p>
                            <AppCategoryBadge category={classifyPackage(id)} language={language} short={true} />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-[#d8d1c4] pt-1.5">
                            <p className="mono text-[0.66rem] text-[#687584]">
                              <span className="font-semibold text-[#527321]">
                                {isArabic ? "أمر الاستعادة:" : "Restore command:"}
                              </span>{" "}
                              {restoreCmd}
                            </p>
                            {actionMode === "expert" && (
                              <span className="text-[0.62rem] text-[#b91c1c] font-semibold">
                                {isArabic ? "تُمحى البيانات" : "Data erased"}
                              </span>
                            )}
                            {actionMode === "advanced" && (
                              <span className="text-[0.62rem] text-[#c2410c] font-semibold">
                                {isArabic ? "تبقى البيانات" : "Data kept (-k)"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Warning and Confirmation footer */}
                  <div
                    className={`border-t p-5 ${
                      actionMode === "expert"
                        ? "border-[#fca5a5] bg-[#fef2f2]"
                        : actionMode === "advanced"
                        ? "border-[#fed7aa] bg-[#fff7ed]"
                        : "border-[#d8d1c4] bg-[#fff2e1]"
                    }`}
                  >
                    {actionMode === "expert" ? (
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#dc2626]" />
                          <div>
                            <p className="text-xs font-bold text-[#991b1b]">
                              {isArabic
                                ? "تحذير حرج: وضع الخبير يمسح البيانات نهائياً!"
                                : "CRITICAL WARNING: Expert Mode Permanently Erases Data!"}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-[#b91c1c]">
                              {isArabic
                                ? "سيتم حذف جميع بيانات التطبيقات المحلية، وذاكرة التخزين المؤقت، والجلسات والحسابات بشكل نهائي لا رجعة فيه عبر `pm uninstall --user 0`."
                                : "All local application data, caches, databases, and stored accounts will be permanently erased via `pm uninstall --user 0`. Reinstalling the package will NOT recover lost user data."}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-start gap-2.5 border border-[#fca5a5] bg-white p-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={expertAckCheckbox}
                            onChange={(e) => setExpertAckCheckbox(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded-xs border-[#b91c1c] text-[#dc2626] focus:ring-[#dc2626]"
                          />
                          <span className="text-xs font-semibold text-[#7f1d1d]">
                            {isArabic
                              ? "أقر بأنني على دراية بأن جميع بيانات التطبيقات وقواعد البيانات ستُحذف نهائياً وأتحمل المسؤولية."
                              : "I understand that Expert mode executes `pm uninstall --user 0` and irrevocably deletes app data, databases, and local account states."}
                          </span>
                        </label>
                      </div>
                    ) : actionMode === "advanced" ? (
                      <div className="flex gap-3">
                        <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#ea580c]" />
                        <div>
                          <p className="text-xs font-bold text-[#c2410c]">
                            {isArabic ? "وضع متقدم (إلغاء التثبيت مع إبقاء البيانات)" : "Advanced Mode (Uninstall & Keep Data)"}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-[#9a3412]">
                            {isArabic
                              ? "يتم إلغاء تثبيت الحزمة للمستخدم 0 مع حفظ مجلدات البيانات وذاكرة التخزين عبر خيار `-k`. يمكن استعادتها بكامل بياناتها عبر `cmd package install-existing`."
                              : "Packages are uninstalled for User 0 while retaining user data directories via `-k`. Applications can be restored with their data intact via `cmd package install-existing`."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#934639]" />
                        <p className="text-xs leading-5 text-[#6d3d35]">{debloatCopy.risk}</p>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setReviewOpen(false)}>
                        {debloatCopy.cancel}
                      </Button>
                      <Button
                        onClick={runQueued}
                        disabled={actionMode === "expert" && !expertAckCheckbox}
                        className={`action-button font-bold ${
                          actionMode === "expert"
                            ? "bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-40"
                            : actionMode === "advanced"
                            ? "bg-[#ea580c] text-white hover:bg-[#c2410c]"
                            : "bg-[#14253a] text-[#f6f2ea] hover:bg-[#223952]"
                        }`}
                      >
                        {actionMode === "expert" && <Trash2 size={14} className="mr-1.5" />}
                        {debloatCopy.apply} ({selected.length})
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
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
        {active === "chat" && (
          <GeminiChatWorkspace
            language={language}
            connectedDeviceSerial={device?.serial}
            connectedDeviceModel={device?.model ? `${device.manufacturer || ""} ${device.model}`.trim() : undefined}
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
