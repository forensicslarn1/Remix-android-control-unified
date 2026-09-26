import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  PackageOpen,
  Search,
  X,
  RotateCcw,
  CheckSquare,
  Square,
  MinusSquare,
  Trash2,
  PauseCircle,
  FolderMinus,
  RefreshCw,
  Terminal,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Loader2,
  Layers,
  ListFilter,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type CategorizedPackage,
  type AppCategoryId,
  ALL_CATEGORY_IDS,
  APP_CATEGORIES,
} from "@/lib/packageCategories";
import { AppCategoryBadge, PackageStatusBadge, CategoryGlyph } from "@/components/AppCategoryBadge";
import type { BrowserAdbClient, CommandResult } from "@/lib/adbClient";
import { toast } from "sonner";

export const COMMUNITY_UAD_SOURCE =
  "https://raw.githubusercontent.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation/main/resources/assets/uad_lists.json";
export const UAD_CACHE_KEY = "acc-uad-ng-lists-v1";
export const UAD_SYNCED_KEY = "acc-uad-ng-synced-at-v1";

export type RawDebloatAction = "disable" | "uninstall-k" | "purge" | "restore";

export interface DebloaterWorkspaceProps {
  adb: BrowserAdbClient;
  packages: string[];
  disabledPackages: string[];
  uninstalledPackages?: string[];
  categorizedPackages: CategorizedPackage[];
  isLive: boolean;
  language: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    androidVersion?: string;
    sdk?: string;
  } | null;
  onRefreshPackages: () => Promise<void>;
  onAddReceipt: (result: CommandResult, label: string) => void;
  onConnect?: () => void;
}

export interface BulkExecutionProgress {
  action: RawDebloatAction;
  total: number;
  current: number;
  currentPkg?: string;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  aborted: boolean;
}

export interface UadPackageMetadata {
  list?: string;
  description?: string;
  labels?: string[];
  removal?: string;
  dependencies?: string[];
  neededBy?: string[];
}

export interface EnhancedCategorizedPackage extends CategorizedPackage {
  appLabel: string;
  functionalDescription: string;
  oemCarrierTag: string;
  oemTagClass: string;
  hasUadContext: boolean;
}

/**
 * GitHub Icon SVG Component
 */
const GithubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

/**
 * Extracts a human-readable App Label and cleans up the Functional Description
 * from UAD-ng descriptions or raw package IDs.
 */
export function extractAppLabelAndDescription(
  pkgId: string,
  rawDesc?: string
): { label: string; description: string } {
  if (!rawDesc || !rawDesc.trim()) {
    const parts = pkgId.split(".");
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2] || "";
    const raw = (last.length > 2 ? last : `${prev} ${last}`)
      .replace(/[_-]/g, " ")
      .trim();
    const formatted = raw.charAt(0).toUpperCase() + raw.slice(1);
    return {
      label: formatted,
      description: "Package identified on device without additional community description.",
    };
  }

  const clean = rawDesc.trim();
  const firstLine = clean.split("\n")[0].trim();

  // Pattern 1: Title followed by URL in parenthesis (e.g. "Samsung Internet (https://play.google...)")
  const urlMatch = firstLine.match(/^([^(]+?)\s*\((?:https?:\/\/[^\)]+)\)/i);
  if (urlMatch && urlMatch[1].trim().length > 1) {
    const label = urlMatch[1].trim();
    const rest = clean.replace(firstLine, "").trim();
    return {
      label,
      description: rest || clean,
    };
  }

  // Pattern 2: Short concise title on the first line
  if (
    firstLine.length <= 48 &&
    !firstLine.toLowerCase().startsWith("this ") &&
    !firstLine.toLowerCase().startsWith("removing ") &&
    !firstLine.toLowerCase().startsWith("safe to ") &&
    !firstLine.toLowerCase().startsWith("do not ")
  ) {
    const label = firstLine.replace(/[.:]+$/, "");
    const rest = clean.replace(firstLine, "").trim();
    return {
      label,
      description: rest || clean,
    };
  }

  // Fallback: derive label from package ID segments, keep full description
  const parts = pkgId.split(".");
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2] || "";
  const raw = (last.length > 2 ? last : `${prev} ${last}`)
    .replace(/[_-]/g, " ")
    .trim();
  const fallbackLabel = raw.charAt(0).toUpperCase() + raw.slice(1);

  return {
    label: fallbackLabel,
    description: clean,
  };
}

/**
 * Parses and formats OEM / Carrier Category tags with consistent styling.
 */
export function formatOemCarrierTag(
  list?: string,
  isArabic = false
): { tag: string; toneClass: string } {
  const norm = (list || "").trim().toLowerCase();

  if (!norm || norm === "community" || norm === "installed") {
    return {
      tag: isArabic ? "مخصص / مثبت" : "Installed",
      toneClass: "border-[#d8d1c4] dark:border-slate-700 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300",
    };
  }
  if (norm.includes("carrier")) {
    return {
      tag: isArabic ? "ناقل شبكة (Carrier)" : "Carrier Bloat",
      toneClass: "border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 font-bold",
    };
  }
  if (norm.includes("google")) {
    return {
      tag: isArabic ? "Google GMS" : "Google GMS",
      toneClass: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 font-bold",
    };
  }
  if (norm.includes("aosp")) {
    return {
      tag: isArabic ? "نواة AOSP" : "AOSP Core",
      toneClass: "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 font-bold",
    };
  }
  if (norm.includes("samsung")) {
    return {
      tag: "Samsung OEM",
      toneClass: "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 font-bold",
    };
  }
  if (norm.includes("xiaomi") || norm.includes("miui")) {
    return {
      tag: "Xiaomi OEM",
      toneClass: "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 font-bold",
    };
  }
  if (
    norm.includes("huawei") ||
    norm.includes("oppo") ||
    norm.includes("oneplus") ||
    norm.includes("transsion") ||
    norm.includes("motorola") ||
    norm.includes("sony") ||
    norm.includes("oem")
  ) {
    return {
      tag: `OEM: ${list}`,
      toneClass: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold",
    };
  }
  if (norm.includes("facebook") || norm.includes("microsoft") || norm.includes("misc")) {
    return {
      tag: list || "Third-Party",
      toneClass: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-bold",
    };
  }

  return {
    tag: list || "Community",
    toneClass: "border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 font-bold",
  };
}

/**
 * Loads cached UAD database from localStorage
 */
function loadCachedUadDatabase(): Record<string, UadPackageMetadata> | null {
  try {
    const raw = localStorage.getItem(UAD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const DebloaterWorkspace: React.FC<DebloaterWorkspaceProps> = ({
  adb,
  packages,
  disabledPackages,
  uninstalledPackages = [],
  categorizedPackages,
  isLive,
  language,
  device,
  onRefreshPackages,
  onAddReceipt,
  onConnect,
}) => {
  const isArabic = language === "ar";

  // Filter & Search states
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AppCategoryId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "uninstalled">("all");
  const [sortBy, setSortBy] = useState<"id" | "status" | "category">("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Selection state - UNRESTRICTED: any package can be checked
  const [selected, setSelected] = useState<string[]>([]);

  // Action execution states
  const [executingPkgId, setExecutingPkgId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkExecutionProgress | null>(null);
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const abortBulkRef = useRef(false);

  // UAD-ng Community Metadata Sync State
  const [syncingUad, setSyncingUad] = useState(false);
  const [uadDb, setUadDb] = useState<Record<string, UadPackageMetadata> | null>(() =>
    loadCachedUadDatabase()
  );
  const [uadSyncedAt, setUadSyncedAt] = useState<string | null>(() =>
    localStorage.getItem(UAD_SYNCED_KEY)
  );

  // Synchronize UAD-ng list directly from GitHub repository with offline fallback
  const syncUadDatabase = async () => {
    setSyncingUad(true);
    toast.loading(
      isArabic
        ? "جارٍ استدعاء قاعدة بيانات UAD-ng من مستودع GitHub الرسمي..."
        : "Fetching UAD-ng package database from official GitHub...",
      { id: "uad-sync" }
    );
    try {
      const res = await fetch(COMMUNITY_UAD_SOURCE, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawData = await res.json();

      const parsed: Record<string, UadPackageMetadata> = {};
      if (typeof rawData === "object" && rawData !== null) {
        for (const [key, val] of Object.entries(rawData)) {
          const item = val as any;
          parsed[key] = {
            list: item?.list,
            description: item?.description,
            labels: Array.isArray(item?.labels) ? item.labels : [],
            removal: item?.removal,
            dependencies: item?.dependencies || [],
            neededBy: item?.neededBy || [],
          };
        }
      }

      const count = Object.keys(parsed).length;
      if (count > 0) {
        setUadDb(parsed);
        const now = new Date().toISOString();
        setUadSyncedAt(now);
        try {
          localStorage.setItem(UAD_CACHE_KEY, JSON.stringify(parsed));
          localStorage.setItem(UAD_SYNCED_KEY, now);
        } catch (storageErr) {
          console.warn("Could not cache full UAD list in localStorage:", storageErr);
        }

        onAddReceipt(
          {
            command: `GET ${COMMUNITY_UAD_SOURCE}`,
            stdout: `Successfully synchronized ${count.toLocaleString()} UAD-ng community package definitions.`,
            stderr: "",
            exitCode: 0,
            at: now,
          },
          "UAD-ng debloat list synchronized"
        );

        toast.success(
          isArabic
            ? `تمت مزامنة قائمة UAD-ng بنجاح (${count.toLocaleString()} تعريف حزمة).`
            : `Synchronized UAD-ng debloat database (${count.toLocaleString()} definitions).`,
          { id: "uad-sync" }
        );
      } else {
        throw new Error("Empty package list returned.");
      }
    } catch (err: any) {
      console.warn("UAD-ng sync failed, trying local storage cache:", err);
      const cached = loadCachedUadDatabase();
      if (cached && Object.keys(cached).length > 0) {
        setUadDb(cached);
        toast.info(
          isArabic
            ? "تعذر الاتصال بـ GitHub، تم تحميل النسخة المخزنة محلياً للاستخدام دون إنترنت."
            : "Offline fallback: Loaded cached UAD-ng database from local storage.",
          { id: "uad-sync" }
        );
      } else {
        toast.error(
          isArabic
            ? `فشل استدعاء UAD-ng من GitHub: ${err?.message || "خطأ اتصال"}`
            : `Failed to fetch UAD-ng from GitHub: ${err?.message || "Network error"}`,
          { id: "uad-sync" }
        );
      }
    } finally {
      setSyncingUad(false);
    }
  };

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    action: RawDebloatAction;
    targets: string[];
  }>({
    open: false,
    action: "disable",
    targets: [],
  });

  // Enhance categorized packages with parsed UAD-ng metadata (Descriptions & App Labels)
  // STRICT CONSTRAINT: INFORMATIONAL / RECON ONLY. Zero package locks or restricted tiers.
  const enhancedPackages = useMemo<EnhancedCategorizedPackage[]>(() => {
    return categorizedPackages.map((pkg) => {
      const uad = uadDb ? uadDb[pkg.id] : undefined;
      const rawDesc = uad?.description || pkg.description;
      const { label, description } = extractAppLabelAndDescription(pkg.id, rawDesc);
      const listTag = uad?.list || pkg.list;
      const oemTagInfo = formatOemCarrierTag(listTag, isArabic);

      return {
        ...pkg,
        appLabel: label,
        functionalDescription: description,
        oemCarrierTag: oemTagInfo.tag,
        oemTagClass: oemTagInfo.toneClass,
        hasUadContext: Boolean(uad),
      };
    });
  }, [categorizedPackages, uadDb, isArabic]);

  // Filter packages by search, category, status, and sort
  const filteredPackages = useMemo(() => {
    let list = enhancedPackages;

    // Search query
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.appLabel.toLowerCase().includes(q) ||
          p.functionalDescription.toLowerCase().includes(q) ||
          p.oemCarrierTag.toLowerCase().includes(q) ||
          (p.list && p.list.toLowerCase().includes(q)) ||
          p.category.name.toLowerCase().includes(q) ||
          p.category.nameAr.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category.id === categoryFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }

    // Sorting
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "id") {
        cmp = a.id.localeCompare(b.id);
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortBy === "category") {
        cmp = a.category.name.localeCompare(b.category.name);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [enhancedPackages, query, categoryFilter, statusFilter, sortBy, sortOrder]);

  // Grouped packages for category grouping view
  const groupedPackages = useMemo(() => {
    const groups: Array<{
      category: (typeof APP_CATEGORIES)[AppCategoryId];
      packages: EnhancedCategorizedPackage[];
    }> = [];
    ALL_CATEGORY_IDS.forEach((catId) => {
      const catPackages = filteredPackages.filter((p) => p.category.id === catId);
      if (catPackages.length > 0) {
        groups.push({
          category: APP_CATEGORIES[catId],
          packages: catPackages,
        });
      }
    });
    return groups;
  }, [filteredPackages]);

  // Counts
  const stats = useMemo(() => {
    const total = categorizedPackages.length;
    const disabled = categorizedPackages.filter((p) => p.status === "disabled").length;
    const uninstalled = categorizedPackages.filter((p) => p.status === "uninstalled").length;
    const enabled = total - disabled - uninstalled;
    return { total, enabled, disabled, uninstalled };
  }, [categorizedPackages]);

  const uadCount = uadDb ? Object.keys(uadDb).length : 0;

  // Action helpers
  const getActionCommand = (action: RawDebloatAction, pkgId: string): string => {
    switch (action) {
      case "disable":
        return `pm disable-user --user 0 ${pkgId}`;
      case "uninstall-k":
        return `pm uninstall -k --user 0 ${pkgId}`;
      case "purge":
        return `pm uninstall --user 0 ${pkgId}`;
      case "restore":
        return `cmd package install-existing --user 0 ${pkgId} || pm enable ${pkgId}`;
    }
  };

  const getActionLabel = (action: RawDebloatAction): { en: string; ar: string } => {
    switch (action) {
      case "disable":
        return { en: "Disable", ar: "تعطيل" };
      case "uninstall-k":
        return { en: "Uninstall (-k)", ar: "إلغاء وإبقاء البيانات" };
      case "purge":
        return { en: "Full Purge", ar: "إزالة كاملة" };
      case "restore":
        return { en: "Restore / Reinstall", ar: "استعادة / إعادة تفعيل" };
    }
  };

  // Execute single action
  const executeSingleAction = async (action: RawDebloatAction, pkgId: string) => {
    if (bulkExecuting) return;
    setExecutingPkgId(pkgId);
    try {
      let result: CommandResult;
      const actionName = getActionLabel(action)[isArabic ? "ar" : "en"];

      if (action === "disable") {
        result = await adb.run(`pm disable-user --user 0 ${pkgId}`);
      } else if (action === "uninstall-k") {
        result = await adb.run(`pm uninstall -k --user 0 ${pkgId}`);
      } else if (action === "purge") {
        result = await adb.run(`pm uninstall --user 0 ${pkgId}`);
      } else {
        result = await adb.run(`pm enable ${pkgId}`);
        if (
          result.exitCode !== 0 ||
          result.stdout.toLowerCase().includes("not installed") ||
          result.stderr.toLowerCase().includes("not installed")
        ) {
          result = await adb.run(`cmd package install-existing --user 0 ${pkgId}`);
        }
      }

      onAddReceipt(result, `${actionName}: ${pkgId}`);

      if (result.exitCode === 0) {
        toast.success(
          isArabic
            ? `تم تنفيذ ${actionName} بنجاح للحزمة ${pkgId}`
            : `Successfully executed ${actionName} on ${pkgId}`
        );
      } else {
        toast.error(
          isArabic
            ? `فشل التنفيذ (${pkgId}): ${result.stderr || result.stdout || "خطأ غير معروف"}`
            : `Execution failed (${pkgId}): ${result.stderr || result.stdout || "Unknown error"}`
        );
      }
      await onRefreshPackages();
    } catch (err: any) {
      toast.error(err?.message || "Command failed");
    } finally {
      setExecutingPkgId(null);
    }
  };

  // Complete sequential batch execution workflow
  // Executes batch commands sequentially (one by one via WebUSB) to avoid USB stream collisions
  const startBulkAction = async (action: RawDebloatAction, targetIds: string[]) => {
    if (targetIds.length === 0 || bulkExecuting) return;

    setConfirmModal({ open: false, action, targets: [] });
    setBulkExecuting(true);
    abortBulkRef.current = false;

    const progress: BulkExecutionProgress = {
      action,
      total: targetIds.length,
      current: 0,
      succeeded: [],
      failed: [],
      aborted: false,
    };
    setBulkProgress({ ...progress });

    for (let i = 0; i < targetIds.length; i++) {
      if (abortBulkRef.current) {
        progress.aborted = true;
        setBulkProgress({ ...progress });
        break;
      }

      const pkgId = targetIds[i];
      progress.current = i + 1;
      progress.currentPkg = pkgId;
      setBulkProgress({ ...progress });

      try {
        let res: CommandResult;
        if (action === "disable") {
          res = await adb.run(`pm disable-user --user 0 ${pkgId}`);
        } else if (action === "uninstall-k") {
          res = await adb.run(`pm uninstall -k --user 0 ${pkgId}`);
        } else if (action === "purge") {
          res = await adb.run(`pm uninstall --user 0 ${pkgId}`);
        } else {
          res = await adb.run(`pm enable ${pkgId}`);
          if (
            res.exitCode !== 0 ||
            res.stdout.toLowerCase().includes("not installed") ||
            res.stderr.toLowerCase().includes("not installed")
          ) {
            res = await adb.run(`cmd package install-existing --user 0 ${pkgId}`);
          }
        }

        onAddReceipt(res, `Bulk ${action}: ${pkgId}`);

        if (res.exitCode === 0) {
          progress.succeeded.push(pkgId);
        } else {
          progress.failed.push({
            id: pkgId,
            error: res.stderr || res.stdout || "Command returned non-zero exit code",
          });
        }
      } catch (e: any) {
        progress.failed.push({ id: pkgId, error: e?.message || "Execution error" });
      }

      setBulkProgress({ ...progress });

      // Yield briefly between sequential commands to avoid USB stream collisions
      await new Promise((r) => setTimeout(r, 25));
    }

    setBulkExecuting(false);

    // Automatically clear selections upon completion
    setSelected([]);

    // Automatically refresh package inventory upon completion
    await onRefreshPackages();

    if (progress.failed.length === 0 && !progress.aborted) {
      toast.success(
        isArabic
          ? `اكتمل تنفيذ العملية المجمعة على ${progress.succeeded.length} حزمة بنجاح.`
          : `Batch completed successfully on all ${progress.succeeded.length} packages.`
      );
    } else {
      toast.info(
        isArabic
          ? `انتهت الدفعة: ${progress.succeeded.length} نجح، ${progress.failed.length} فشل.`
          : `Batch completed: ${progress.succeeded.length} succeeded, ${progress.failed.length} failed.`
      );
    }
  };

  // Master Select All visible packages
  const handleSelectAllVisible = () => {
    if (bulkExecuting) return;
    const visibleIds = filteredPackages.map((p) => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    if (allSelected) {
      const visibleSet = new Set(visibleIds);
      setSelected((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const isAllVisibleSelected =
    filteredPackages.length > 0 && filteredPackages.every((p) => selected.includes(p.id));
  const isSomeVisibleSelected =
    filteredPackages.some((p) => selected.includes(p.id)) && !isAllVisibleSelected;

  return (
    <div className="space-y-5">
      {/* Workspace Header & Telemetry */}
      <div className="service-card p-5 sm:p-6 border-[#d8d1c4] dark:border-slate-800 bg-[#fffdf8] dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="mono text-[0.65rem] font-bold uppercase tracking-wider text-[#14253a] dark:text-cyan-300 bg-[#e8f1f7] dark:bg-cyan-950/70 px-2 py-0.5 border border-[#59869c] dark:border-cyan-800">
                {isArabic ? "مشغّل الحزم المباشر (Raw Operator)" : "Raw Operator Package Manager"}
              </span>
              <span className="status-stamp border-[#527321] text-[#527321]">
                {isLive ? (isArabic ? "متصل مباشر" : "Live Device") : (isArabic ? "غير متصل" : "Not connected")}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14253a] dark:text-slate-100">
              {isArabic ? "إدارة الحزم غير المقيدة وقاعدة UAD-ng" : "Unrestricted Package Manager & UAD-ng Recon"}
            </h2>
            <p className="text-xs text-[#526273] dark:text-slate-400 max-w-3xl leading-relaxed">
              {isArabic
                ? "تحكم مباشر في جميع حزم أندرويد دون قيود أو قوائم حماية مسبقة. تفعيل فوري للإجراءات الثلاثية: تعطيل (pm disable-user)، أو إلغاء مع إبقاء البيانات (pm uninstall -k)، أو إزالة كاملة نهائية (pm uninstall)."
                : "Direct, unrestricted execution on all Android packages with zero hardcoded whitelist locks. Full support for raw Disable (`pm disable-user`), Uninstall Keep Data (`pm uninstall -k`), and Full Purge (`pm uninstall`)."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Sync UAD-ng Debloat List Button with GitHub icon */}
            <Button
              variant="outline"
              size="sm"
              onClick={syncUadDatabase}
              disabled={syncingUad || bulkExecuting}
              className="action-button text-xs border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#14253a] dark:text-slate-200 hover:bg-[#f3efe6] dark:hover:bg-slate-700 cursor-pointer shadow-xs"
              title={
                isArabic
                  ? "مزامنة قاعدة بيانات UAD-ng الرسمية من GitHub للاستعلام عن أوصاف الحزم وتصنيفاتها"
                  : "Sync official UAD-ng debloat catalog from GitHub for package labels and functional descriptions"
              }
            >
              {syncingUad ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <GithubIcon size={13} className="mr-1.5 inline" />
              )}
              <span>{isArabic ? "مزامنة القائمة (UAD-ng)" : "Sync Debloat List"}</span>
            </Button>

            {/* Refresh Device Packages */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshPackages}
              disabled={!isLive || executingPkgId !== null || bulkExecuting}
              className="action-button text-xs border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#14253a] dark:text-slate-200 hover:bg-[#f3efe6]"
            >
              <RefreshCw size={13} className="mr-1.5" />
              {isArabic ? "تحديث قائمة الحزم" : "Refresh Packages"}
            </Button>

            {!isLive && onConnect && (
              <Button
                size="sm"
                onClick={onConnect}
                className="action-button text-xs bg-[#14253a] text-white hover:bg-[#233a54]"
              >
                {isArabic ? "اتصال WebUSB" : "Connect WebUSB"}
              </Button>
            )}
          </div>
        </div>

        {/* Telemetry counters & Metadata Sync status */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-[#eee7da] dark:border-slate-800 pt-4">
          <div className="p-3 bg-[#f8f5ee] dark:bg-slate-800/60 border border-[#e5ded2] dark:border-slate-700/60">
            <p className="kicker text-[#687584] dark:text-slate-400">{isArabic ? "إجمالي الحزم" : "Total Packages"}</p>
            <p className="text-xl font-bold mono text-[#14253a] dark:text-slate-100 mt-1">{stats.total}</p>
          </div>
          <div className="p-3 bg-[#f0f9eb] dark:bg-emerald-950/30 border border-[#c3e6b8] dark:border-emerald-800/50">
            <p className="kicker text-[#2e6b18] dark:text-emerald-400">{isArabic ? "الحزم المفعلة" : "Active / Enabled"}</p>
            <p className="text-xl font-bold mono text-[#2e6b18] dark:text-emerald-300 mt-1">{stats.enabled}</p>
          </div>
          <div className="p-3 bg-[#fef3f2] dark:bg-rose-950/30 border border-[#fecdca] dark:border-rose-800/50">
            <p className="kicker text-[#b42318] dark:text-rose-400">{isArabic ? "الحزم المعطلة" : "Disabled"}</p>
            <p className="text-xl font-bold mono text-[#b42318] dark:text-rose-300 mt-1">{stats.disabled}</p>
          </div>
          <div className="p-3 bg-[#fff7ed] dark:bg-amber-950/30 border border-[#fed7aa] dark:border-amber-800/50">
            <div className="flex items-center justify-between">
              <p className="kicker text-[#b45309] dark:text-amber-400">
                {isArabic ? "تعريفات UAD-ng" : "UAD-ng Definitions"}
              </p>
              {uadSyncedAt && (
                <span className="mono text-[0.6rem] text-[#2e6b18] dark:text-emerald-400">
                  {isArabic ? "مزامنة" : "Synced"}
                </span>
              )}
            </div>
            <p className="text-xl font-bold mono text-[#b45309] dark:text-amber-300 mt-1">
              {uadCount > 0 ? uadCount.toLocaleString() : (isArabic ? "افتراضي" : "Built-in")}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="service-card p-4 space-y-3 dark:bg-slate-900/90 dark:border-slate-800">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687584] dark:text-slate-400" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isArabic ? "ابحث باسم التطبيق أو معرف الحزمة أو المصنع..." : "Search app name, package ID, OEM tag..."}
              className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] pl-9 pr-8 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">
              {isArabic ? "التصنيف:" : "Category:"}
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as AppCategoryId | "all")}
              className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">{isArabic ? "جميع التصنيفات" : "All Categories"} ({categorizedPackages.length})</option>
              {ALL_CATEGORY_IDS.map((catId) => {
                const cat = APP_CATEGORIES[catId];
                const count = categorizedPackages.filter((p) => p.category.id === catId).length;
                return (
                  <option key={catId} value={catId}>
                    {isArabic ? cat.nameAr : cat.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">
              {isArabic ? "الحالة:" : "Status:"}
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-10 w-full border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">{isArabic ? "جميع الحالات" : "All Statuses"} ({stats.total})</option>
              <option value="enabled">{isArabic ? "مفعل فقط" : "Enabled Only"} ({stats.enabled})</option>
              <option value="disabled">{isArabic ? "معطل فقط" : "Disabled Only"} ({stats.disabled})</option>
              <option value="uninstalled">{isArabic ? "غير مثبت للمستخدم 0" : "Uninstalled (User 0)"} ({stats.uninstalled})</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <span className="mono text-[0.65rem] uppercase text-[#687584] dark:text-slate-400 shrink-0">
              {isArabic ? "الترتيب:" : "Sort:"}
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-2 text-xs outline-none focus:border-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="id">{isArabic ? "معرف الحزمة (ID)" : "Package ID"}</option>
              <option value="status">{isArabic ? "حالة الحزمة" : "Status"}</option>
              <option value="category">{isArabic ? "التصنيف" : "Category"}</option>
            </select>
            <button
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
              className="action-button h-10 px-2.5 border border-[#d8d1c4] bg-[#fffdf8] hover:bg-[#f3efe6] text-[#14253a] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown size={14} className={sortOrder === "desc" ? "rotate-180" : ""} />
            </button>
          </div>
        </div>

        {/* View toggles & Quick Select Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#eee7da] dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-[#d8d1c4] dark:border-slate-700 bg-[#f8f5ee] dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setGroupByCategory(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                  !groupByCategory ? "bg-[#14253a] text-white shadow-xs" : "text-[#526273] dark:text-slate-400 hover:text-[#14253a]"
                }`}
              >
                <ListFilter size={13} />
                {isArabic ? "جدول مسطح" : "Flat Table"}
              </button>
              <button
                onClick={() => setGroupByCategory(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                  groupByCategory ? "bg-[#14253a] text-white shadow-xs" : "text-[#526273] dark:text-slate-400 hover:text-[#14253a]"
                }`}
              >
                <Layers size={13} />
                {isArabic ? "مجموعات حسب التصنيف" : "Group by Category"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Master Select All Checkbox Button */}
              <label
                className="flex items-center gap-2 px-2.5 py-1 text-xs font-semibold border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#14253a] dark:text-slate-200 cursor-pointer select-none rounded-xs hover:bg-[#f3efe6] dark:hover:bg-slate-700 transition-colors"
                title={isArabic ? "تحديد أو إلغاء تحديد كل الحزم المعروضة" : "Select or deselect all visible packages"}
              >
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeVisibleSelected;
                  }}
                  checked={isAllVisibleSelected}
                  onChange={handleSelectAllVisible}
                  disabled={bulkExecuting}
                  className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer rounded-xs"
                />
                <span>
                  {isAllVisibleSelected
                    ? (isArabic ? "إلغاء تحديد الكل" : "Deselect All")
                    : (isArabic ? "تحديد الكل" : "Select All")}
                  <span className="mono opacity-70 ml-1">({filteredPackages.length})</span>
                </span>
              </label>

              <button
                onClick={() => {
                  const enabledIds = filteredPackages.filter((p) => p.status === "enabled").map((p) => p.id);
                  setSelected((prev) => Array.from(new Set([...prev, ...enabledIds])));
                }}
                disabled={bulkExecuting}
                className="action-button h-8 px-2.5 text-xs border border-[#b9da71] dark:border-emerald-800 bg-[#eef8cd] dark:bg-emerald-950/60 hover:bg-[#e4f2b8] text-[#3f7a18] dark:text-emerald-300 font-semibold cursor-pointer"
              >
                {isArabic ? "تحديد المفعلة" : "Select Enabled"} ({filteredPackages.filter((p) => p.status === "enabled").length})
              </button>

              <button
                onClick={() => {
                  const disabledIds = filteredPackages.filter((p) => p.status === "disabled").map((p) => p.id);
                  setSelected((prev) => Array.from(new Set([...prev, ...disabledIds])));
                }}
                disabled={bulkExecuting}
                className="action-button h-8 px-2.5 text-xs border border-[#fed7aa] dark:border-amber-800 bg-[#fff7ed] dark:bg-amber-950/60 hover:bg-[#ffedd5] text-[#b45309] dark:text-amber-300 font-semibold cursor-pointer"
              >
                {isArabic ? "تحديد المعطلة" : "Select Disabled"} ({filteredPackages.filter((p) => p.status === "disabled").length})
              </button>

              {selected.length > 0 && (
                <button
                  onClick={() => setSelected([])}
                  disabled={bulkExecuting}
                  className="action-button h-8 px-2.5 text-xs border border-[#dba193] dark:border-rose-800 bg-[#fbe5df] dark:bg-rose-950/60 hover:bg-[#f8d5cc] text-[#c2362b] dark:text-rose-300 font-semibold cursor-pointer"
                >
                  <X size={12} className="inline mr-1" />
                  {isArabic ? "مسح التحديد" : "Clear Selection"}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mono text-xs font-semibold text-[#14253a] dark:text-slate-200">
            <span>
              {filteredPackages.length} {isArabic ? "حزمة متطابقة" : "matched"}
            </span>
            ·
            <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#59869c] dark:border-cyan-800 bg-[#e8f1f7] dark:bg-cyan-950/60 text-[#1d5c8a] dark:text-cyan-300">
              {selected.length} {isArabic ? "محدد" : "selected"}
            </span>
          </div>
        </div>
      </div>

      {/* Top Batch-Action Bar (Shown when 1 or more packages are selected) */}
      {selected.length > 0 && (
        <div className="service-card p-4 border-[#14253a] dark:border-cyan-800 bg-[#eef4f9] dark:bg-slate-800/95 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="state-square p-2 border-[#14253a] dark:border-cyan-500 bg-[#14253a] dark:bg-cyan-950 text-[#c8f04a] dark:text-cyan-300 shrink-0">
              {bulkExecuting ? <Loader2 size={18} className="animate-spin" /> : <CheckSquare size={18} />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#14253a] dark:text-slate-100">
                  {isArabic ? "شريط العمليات المجمعة المباشرة" : "Simultaneous Batch Action Bar"}
                </h3>
                <span className="mono text-xs font-bold px-2 py-0.5 bg-[#14253a] text-white dark:bg-cyan-900 dark:text-cyan-200 rounded-xs">
                  {selected.length} {isArabic ? "حزمة محددة للتنفيذ" : "packages selected"}
                </span>
              </div>
              <p className="text-xs text-[#526273] dark:text-slate-400 mt-0.5">
                {bulkExecuting && bulkProgress
                  ? (isArabic
                      ? `جارٍ المعالجة المتتابعة: ${bulkProgress.current} / ${bulkProgress.total} (${Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%) - ${bulkProgress.currentPkg}`
                      : `Sequential processing: ${bulkProgress.current} / ${bulkProgress.total} (${Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%) - ${bulkProgress.currentPkg}`)
                  : (isArabic
                      ? "تطبيق فوري لأوامر ADB المباشرة على جميع الحزم المحددة في وقت واحد دون قيود:"
                      : "Execute unrestricted raw commands simultaneously across all selected packages:")}
              </p>
            </div>
          </div>

          {/* Sequential Live Progress in Top Bar */}
          {bulkExecuting && bulkProgress && (
            <div className="w-full md:w-64 space-y-1">
              <div className="flex justify-between text-[0.68rem] font-mono text-[#14253a] dark:text-slate-200">
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
                <span>{Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%</span>
              </div>
              <div className="h-2 w-full bg-black/10 dark:bg-white/10 overflow-hidden rounded-full">
                <div
                  className="h-full bg-[#14253a] dark:bg-cyan-400 transition-all duration-100"
                  style={{ width: `${(bulkProgress.current / Math.max(1, bulkProgress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Batch Disable */}
            <Button
              size="sm"
              disabled={bulkExecuting}
              onClick={() => setConfirmModal({ open: true, action: "disable", targets: selected })}
              className="action-button h-8 px-3 text-xs bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              title="pm disable-user --user 0 <package_name>"
            >
              <PauseCircle size={14} />
              <span>{isArabic ? "تعطيل مجمع" : "Batch Disable"}</span>
            </Button>

            {/* 2. Batch Uninstall Keep Data */}
            <Button
              size="sm"
              disabled={bulkExecuting}
              onClick={() => setConfirmModal({ open: true, action: "uninstall-k", targets: selected })}
              className="action-button h-8 px-3 text-xs bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              title="pm uninstall -k --user 0 <package_name>"
            >
              <FolderMinus size={14} />
              <span>{isArabic ? "إلغاء وإبقاء البيانات (-k)" : "Batch Uninstall (-k)"}</span>
            </Button>

            {/* 3. Batch Full Purge */}
            <Button
              size="sm"
              disabled={bulkExecuting}
              onClick={() => setConfirmModal({ open: true, action: "purge", targets: selected })}
              className="action-button h-8 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              title="pm uninstall --user 0 <package_name>"
            >
              <Trash2 size={14} />
              <span>{isArabic ? "إزالة كاملة (Purge)" : "Batch Purge"}</span>
            </Button>

            {/* Batch Restore */}
            <Button
              size="sm"
              variant="outline"
              disabled={bulkExecuting}
              onClick={() => setConfirmModal({ open: true, action: "restore", targets: selected })}
              className="action-button h-8 px-3 text-xs border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 font-bold flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 disabled:opacity-50"
              title="cmd package install-existing --user 0 <package_name> / pm enable"
            >
              <RotateCcw size={13} />
              <span>{isArabic ? "استعادة" : "Restore"}</span>
            </Button>

            <button
              onClick={() => setSelected([])}
              disabled={bulkExecuting}
              className="action-button h-8 px-2.5 text-xs text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200 border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer rounded-xs disabled:opacity-50"
              title={isArabic ? "مسح التحديد" : "Clear selection"}
            >
              <X size={13} className="inline mr-1" />
              {isArabic ? "مسح التحديد" : "Clear"}
            </button>
          </div>
        </div>
      )}

      {/* Main Table View */}
      {filteredPackages.length === 0 ? (
        <div className="service-card p-12 text-center border-[#d8d1c4] dark:border-slate-800">
          <PackageOpen className="mx-auto text-[#8e9eae] mb-3" size={32} />
          <h3 className="text-base font-bold text-[#14253a] dark:text-slate-100">
            {isArabic ? "لم يتم العثور على حزم مطابقة" : "No matching packages found"}
          </h3>
          <p className="text-xs text-[#687584] dark:text-slate-400 mt-1">
            {isArabic ? "جرّب تغيير عبارة البحث أو إعادة ضبط عوامل التصفية." : "Try adjusting your search query or resetting filters."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategoryFilter("all");
                setStatusFilter("all");
              }}
              className="action-button text-xs"
            >
              {isArabic ? "إعادة ضبط التصفية" : "Reset Filters"}
            </Button>
          </div>
        </div>
      ) : groupByCategory ? (
        // Grouped by Category View
        <div className="space-y-6">
          {groupedPackages.map(({ category, packages: catPackages }) => {
            const allCatSelected = catPackages.every((p) => selected.includes(p.id));
            const someCatSelected = catPackages.some((p) => selected.includes(p.id)) && !allCatSelected;

            const toggleCategory = () => {
              if (bulkExecuting) return;
              if (allCatSelected) {
                const catIds = new Set(catPackages.map((p) => p.id));
                setSelected((prev) => prev.filter((id) => !catIds.has(id)));
              } else {
                const toAdd = catPackages.map((p) => p.id);
                setSelected((prev) => Array.from(new Set([...prev, ...toAdd])));
              }
            };

            return (
              <div key={category.id} className="service-card overflow-hidden border-[#d8d1c4] dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#d8d1c4] dark:border-slate-800 bg-[#fbf9f3] dark:bg-slate-800/80 p-4 gap-3">
                  <div className="flex items-center gap-3">
                    <span className="state-square p-2 border-[#59869c] text-[#263d55] dark:text-cyan-300">
                      <CategoryGlyph categoryId={category.id} size={18} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#14253a] dark:text-slate-100">
                          {isArabic ? category.nameAr : category.name}
                        </h3>
                        <AppCategoryBadge category={category.id} language={language} short={true} />
                      </div>
                      <p className="text-xs text-[#687584] dark:text-slate-400 mt-0.5">
                        {isArabic ? category.descriptionAr : category.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleCategory}
                      disabled={bulkExecuting}
                      className="action-button h-8 text-xs border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      {allCatSelected ? (
                        <CheckSquare size={13} className="mr-1 text-emerald-600" />
                      ) : someCatSelected ? (
                        <MinusSquare size={13} className="mr-1 text-amber-600" />
                      ) : (
                        <Square size={13} className="mr-1" />
                      )}
                      {allCatSelected ? (isArabic ? "إلغاء التحديد" : "Deselect") : (isArabic ? "تحديد الفئة" : "Select Category")} ({catPackages.length})
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <PackageTableContent
                    packages={catPackages}
                    selected={selected}
                    onToggleSelect={(id) => {
                      if (bulkExecuting) return;
                      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
                    }}
                    onToggleAll={() => {
                      if (bulkExecuting) return;
                      const catIds = catPackages.map((p) => p.id);
                      const allCatSelected = catIds.length > 0 && catIds.every((id) => selected.includes(id));
                      if (allCatSelected) {
                        const catSet = new Set(catIds);
                        setSelected((prev) => prev.filter((id) => !catSet.has(id)));
                      } else {
                        setSelected((prev) => Array.from(new Set([...prev, ...catIds])));
                      }
                    }}
                    executingPkgId={executingPkgId}
                    bulkExecuting={bulkExecuting}
                    onExecuteSingle={executeSingleAction}
                    isArabic={isArabic}
                    language={language}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Flat Table View
        <div className="service-card overflow-hidden border-[#d8d1c4] dark:border-slate-800">
          <div className="overflow-x-auto">
            <PackageTableContent
              packages={filteredPackages}
              selected={selected}
              onToggleSelect={(id) => {
                if (bulkExecuting) return;
                setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
              }}
              onToggleAll={handleSelectAllVisible}
              executingPkgId={executingPkgId}
              bulkExecuting={bulkExecuting}
              onExecuteSingle={executeSingleAction}
              isArabic={isArabic}
              language={language}
              showCategoryCol={true}
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Unrestricted Batch Toolbar */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-3 border border-[#14253a] dark:border-slate-700 bg-[#14253a] dark:bg-slate-900 text-white px-5 py-3 shadow-2xl rounded-sm max-w-[95vw]">
          <span className="mono text-xs font-semibold flex items-center gap-1.5 text-[#c8f04a] dark:text-cyan-300 mr-1">
            {bulkExecuting ? <Loader2 size={15} className="animate-spin" /> : <CheckSquare size={15} />}
            {selected.length} {isArabic ? "حزمة محددة" : "selected"}
          </span>

          {bulkExecuting && bulkProgress && (
            <div className="flex items-center gap-2 bg-black/30 dark:bg-black/40 px-2 py-1 rounded text-xs mono">
              <span>{bulkProgress.current} / {bulkProgress.total}</span>
              <span className="text-[#c8f04a] font-bold">
                ({Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%)
              </span>
              <span className="opacity-70 max-w-[120px] truncate hidden sm:inline">{bulkProgress.currentPkg}</span>
            </div>
          )}

          <div className="h-5 w-px bg-[#2f4860] dark:bg-slate-700 hidden sm:block" />

          {/* 1. Disable Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "disable", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="pm disable-user --user 0 <pkg>"
          >
            <PauseCircle size={14} />
            <span>{isArabic ? "تعطيل محدد" : "Batch Disable"}</span>
          </Button>

          {/* 2. Uninstall (-k) Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "uninstall-k", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="pm uninstall -k --user 0 <pkg>"
          >
            <FolderMinus size={14} />
            <span>{isArabic ? "إلغاء (-k)" : "Batch Uninstall (-k)"}</span>
          </Button>

          {/* 3. Full Purge Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "purge", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="pm uninstall --user 0 <pkg>"
          >
            <Trash2 size={14} />
            <span>{isArabic ? "إزالة كاملة" : "Batch Purge"}</span>
          </Button>

          {/* Restore / Re-enable option */}
          <Button
            size="sm"
            variant="outline"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "restore", targets: selected })}
            className="action-button h-8 px-3 text-xs border-emerald-500 text-emerald-400 hover:bg-emerald-950 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="cmd package install-existing --user 0 <pkg> / pm enable <pkg>"
          >
            <RotateCcw size={13} />
            <span>{isArabic ? "استعادة" : "Restore"}</span>
          </Button>

          <button
            onClick={() => setSelected([])}
            disabled={bulkExecuting}
            className="text-xs text-[#a6b3be] hover:text-white ml-1 p-1 cursor-pointer disabled:opacity-40"
            title={isArabic ? "إلغاء التحديد" : "Deselect all"}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#14253a]/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl border border-[#14253a] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-900 shadow-2xl p-6">
            <div className="flex items-start justify-between border-b border-[#d8d1c4] dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                {confirmModal.action === "purge" ? (
                  <AlertTriangle className="text-[#dc2626] shrink-0" size={24} />
                ) : (
                  <Terminal className="text-[#14253a] dark:text-cyan-400 shrink-0" size={24} />
                )}
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-[#14253a] dark:text-slate-100">
                    {isArabic
                      ? `تأكيد إجراء مشغّل الحزم المجمع: ${getActionLabel(confirmModal.action).ar}`
                      : `Confirm Batch Action: ${getActionLabel(confirmModal.action).en}`}
                  </h3>
                  <p className="mono text-xs text-[#526273] dark:text-slate-400 mt-0.5">
                    {confirmModal.targets.length} {isArabic ? "حزمة مختارة للتنفيذ المتتابع المباشر" : "packages selected for sequential execution"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModal({ open: false, action: "disable", targets: [] })}
                className="p-1 text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 bg-[#f8f5ee] dark:bg-slate-800/80 border border-[#e5ded2] dark:border-slate-700 text-xs font-mono">
                <p className="text-[0.7rem] uppercase text-[#687584] dark:text-slate-400 mb-1">
                  {isArabic ? "أمر ADB المباشر المنفذ بالتتابع:" : "Sequential Raw ADB Command Pattern:"}
                </p>
                <code className="text-[#14253a] dark:text-cyan-300 font-bold block">
                  {getActionCommand(confirmModal.action, "<package_name>")}
                </code>
              </div>

              {confirmModal.action === "purge" && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert size={14} />
                    {isArabic ? "تنبيه إزالة كاملة (Purge):" : "Full Purge Warning:"}
                  </p>
                  <p className="mt-1 leading-relaxed">
                    {isArabic
                      ? "سيؤدي هذا إلى إلغاء تثبيت الحزم ومسح جميع بياناتها وإعداداتها من المستخدم 0 بشكل نهائي دون حفظ ذاكرة التخزين المؤقت."
                      : "This will execute `pm uninstall --user 0` and erase all user data, preferences, and cache associated with the target packages."}
                  </p>
                </div>
              )}

              <div className="max-h-48 overflow-y-auto border border-[#e5ded2] dark:border-slate-800 bg-[#fffdf8] dark:bg-slate-950 p-2 space-y-1">
                <p className="text-[0.65rem] uppercase font-bold text-[#687584] dark:text-slate-400 px-1 mb-1">
                  {isArabic ? "الحزم المستهدفة:" : "Target Packages:"}
                </p>
                {confirmModal.targets.map((id) => (
                  <div key={id} className="mono text-xs text-[#14253a] dark:text-slate-200 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 truncate">
                    {id}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-[#eee7da] dark:border-slate-800 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal({ open: false, action: "disable", targets: [] })}
                className="action-button text-xs"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={() => startBulkAction(confirmModal.action, confirmModal.targets)}
                className={`action-button text-xs text-white font-bold ${
                  confirmModal.action === "purge"
                    ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                    : confirmModal.action === "uninstall-k"
                    ? "bg-[#ea580c] hover:bg-[#c2410c]"
                    : confirmModal.action === "disable"
                    ? "bg-[#f59e0b] hover:bg-[#d97706] text-black"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isArabic ? "تأكيد وتنفيذ بالتتابع" : "Confirm & Execute Sequentially"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Execution Progress Modal with live sequential progress */}
      {bulkProgress && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#14253a]/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg border border-[#14253a] dark:border-slate-700 bg-[#fffdf8] dark:bg-slate-900 shadow-2xl p-6">
            <div className="flex items-start justify-between border-b border-[#d8d1c4] dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                {bulkExecuting ? (
                  <Loader2 className="animate-spin text-[#14253a] dark:text-cyan-400" size={24} />
                ) : (
                  <CheckCircle2 className="text-[#3f7a18] dark:text-emerald-400" size={24} />
                )}
                <div>
                  <h3 className="text-base font-bold text-[#14253a] dark:text-slate-100">
                    {bulkExecuting
                      ? isArabic
                        ? `جارٍ المعالجة المتتابعة: ${bulkProgress.current} / ${bulkProgress.total} (${Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%)`
                        : `Processing ${bulkProgress.current} / ${bulkProgress.total} (${Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%)`
                      : isArabic
                      ? "اكتمل تنفيذ العمليات المجمعة"
                      : "Batch Execution Completed"}
                  </h3>
                  <p className="mono text-xs text-[#526273] dark:text-slate-400 mt-0.5">
                    {getActionCommand(bulkProgress.action, bulkProgress.currentPkg || "<target>")}
                  </p>
                </div>
              </div>
              {!bulkExecuting && (
                <button
                  onClick={() => setBulkProgress(null)}
                  className="p-1 text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Progress Bar & Counters */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="mono text-[#14253a] dark:text-slate-200">
                  {isArabic ? "التقدم:" : "Progress:"} {bulkProgress.current} / {bulkProgress.total} -{" "}
                  {Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%
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
                </div>
              </div>

              <div className="h-3 w-full bg-[#eee7da] dark:bg-slate-800 overflow-hidden border border-[#d8d1c4] dark:border-slate-700 rounded-xs">
                <div
                  className="h-full bg-[#14253a] dark:bg-cyan-500 transition-all duration-150"
                  style={{ width: `${(bulkProgress.current / Math.max(1, bulkProgress.total)) * 100}%` }}
                />
              </div>

              {bulkExecuting && bulkProgress.currentPkg && (
                <div className="mono text-xs text-[#526273] dark:text-slate-300 bg-[#f8f5ee] dark:bg-slate-800/80 border border-[#d8d1c4] dark:border-slate-700 p-2 mt-2 truncate rounded-xs">
                  <span className="text-[#8e9eae] font-bold mr-1.5">{isArabic ? "الحزمة الجارية:" : "Current Package:"}</span>
                  <span className="text-[#14253a] dark:text-cyan-300 font-bold">{bulkProgress.currentPkg}</span>
                </div>
              )}

              {bulkProgress.aborted && (
                <p className="text-xs text-[#934639] dark:text-rose-400 font-semibold mt-1">
                  {isArabic ? "تم إيقاف العمليات المتبقية بطلب المستخدم." : "Remaining operations were aborted by user."}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-[#eee7da] dark:border-slate-800 pt-4">
              {bulkExecuting ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    abortBulkRef.current = true;
                  }}
                  className="action-button border-[#dba193] text-[#c2362b] hover:bg-[#fbe5df] text-xs cursor-pointer"
                >
                  <X size={14} className="mr-1" />
                  {isArabic ? "إيقاف مؤقت للعمليات المتبقية" : "Abort Remaining"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setBulkProgress(null)}
                  className="action-button bg-[#14253a] text-white hover:bg-[#233a54] text-xs cursor-pointer"
                >
                  {isArabic ? "إغلاق" : "Done"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PackageTableContentProps {
  packages: EnhancedCategorizedPackage[];
  selected: string[];
  onToggleSelect: (id: string) => void;
  onToggleAll?: () => void;
  executingPkgId: string | null;
  bulkExecuting: boolean;
  onExecuteSingle: (action: RawDebloatAction, id: string) => Promise<void>;
  isArabic: boolean;
  language: "en" | "ar" | "other";
  showCategoryCol?: boolean;
}

const PackageTableContent: React.FC<PackageTableContentProps> = ({
  packages,
  selected,
  onToggleSelect,
  onToggleAll,
  executingPkgId,
  bulkExecuting,
  onExecuteSingle,
  isArabic,
  language,
  showCategoryCol = false,
}) => {
  const isAllChecked = packages.length > 0 && packages.every((p) => selected.includes(p.id));
  const isSomeChecked = packages.some((p) => selected.includes(p.id)) && !isAllChecked;

  return (
    <table className="w-full min-w-[780px] text-left text-xs">
      <thead className="bg-[#f3efe6] dark:bg-slate-800/90 text-[0.64rem] uppercase tracking-[0.12em] text-[#687584] dark:text-slate-400 border-b border-[#d8d1c4] dark:border-slate-800">
        <tr>
          {/* Master Select All Checkbox */}
          <th className="w-12 px-3 py-3 text-center">
            <label
              className="inline-flex items-center justify-center cursor-pointer"
              title={isAllChecked ? (isArabic ? "إلغاء تحديد الكل" : "Deselect All") : (isArabic ? "تحديد الكل" : "Select All")}
            >
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = isSomeChecked;
                }}
                checked={isAllChecked}
                onChange={() => onToggleAll?.()}
                disabled={bulkExecuting}
                aria-label={isArabic ? "تحديد أو إلغاء تحديد الكل في هذا الجدول" : "Select or deselect all in table"}
                className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer rounded-xs"
              />
            </label>
          </th>
          {showCategoryCol && <th className="px-3 py-3">{isArabic ? "التصنيف" : "Category"}</th>}
          <th className="px-3 py-3">{isArabic ? "اسم التطبيق وتفاصيل الحزمة (UAD-ng)" : "App Label & Package Details (UAD-ng)"}</th>
          <th className="px-3 py-3">{isArabic ? "الحالة" : "Status"}</th>
          <th className="px-3 py-3 text-right">{isArabic ? "الإجراءات المباشرة الثلاثية" : "Raw Direct Actions"}</th>
        </tr>
      </thead>
      <tbody>
        {packages.map((pkg) => {
          const checked = selected.includes(pkg.id);
          const isBusy = executingPkgId === pkg.id;

          return (
            <tr
              key={pkg.id}
              className={`border-t border-[#e5ded2] dark:border-slate-800 hover:bg-[#fbf8f1] dark:hover:bg-slate-800/50 transition-colors ${
                checked ? "bg-[#f5f9fc] dark:bg-slate-800/70" : ""
              }`}
            >
              {/* UNRESTRICTED Checkbox: Active on every package, zero locks */}
              <td className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect(pkg.id)}
                  disabled={bulkExecuting}
                  aria-label={`Select ${pkg.id}`}
                  className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer rounded-xs"
                />
              </td>

              {showCategoryCol && (
                <td className="px-3 py-3">
                  <AppCategoryBadge category={pkg.category.id} language={language} short={true} />
                </td>
              )}

              {/* Package ID, App Label, Functional Description & OEM/Carrier Tag */}
              <td className="px-3 py-3 max-w-md">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* App Label / Human-Readable Name */}
                  <span className="text-xs font-bold text-[#14253a] dark:text-slate-100">
                    {pkg.appLabel}
                  </span>

                  {/* OEM / Carrier Category Tag */}
                  <span
                    className={`mono text-[0.6rem] font-bold px-1.5 py-0.5 border rounded-xs ${pkg.oemTagClass}`}
                    title={isArabic ? "تصنيف UAD-ng للمصنع أو الشبكة" : "UAD-ng OEM / Carrier Category"}
                  >
                    {pkg.oemCarrierTag}
                  </span>
                </div>

                {/* Raw Android Package ID */}
                <p className="mono text-[0.68rem] text-[#687584] dark:text-slate-400 select-all mt-0.5">
                  {pkg.id}
                </p>

                {/* Functional Description (purpose of service/app) */}
                {pkg.functionalDescription && (
                  <p
                    className="text-[0.72rem] text-[#425263] dark:text-slate-300 leading-snug mt-1 line-clamp-2"
                    title={pkg.functionalDescription}
                  >
                    {pkg.functionalDescription}
                  </p>
                )}
              </td>

              {/* Status */}
              <td className="px-3 py-3">
                <PackageStatusBadge status={pkg.status} rawState={pkg.rawState} language={language} />
              </td>

              {/* Three Direct Unrestricted Action Buttons */}
              <td className="px-3 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {isBusy ? (
                    <div className="flex items-center gap-1.5 text-xs text-[#687584]">
                      <Loader2 size={13} className="animate-spin text-[#14253a] dark:text-cyan-400" />
                      <span>{isArabic ? "جارٍ التنفيذ..." : "Executing..."}</span>
                    </div>
                  ) : (
                    <>
                      {/* 1. Disable Button: pm disable-user --user 0 */}
                      <button
                        onClick={() => onExecuteSingle("disable", pkg.id)}
                        disabled={pkg.status === "disabled" || bulkExecuting}
                        className={`action-button h-7 px-2 text-[0.68rem] font-bold border rounded-xs transition-colors flex items-center gap-1 ${
                          pkg.status === "disabled" || bulkExecuting
                            ? "opacity-40 cursor-not-allowed border-gray-300 dark:border-slate-800 text-gray-400"
                            : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer"
                        }`}
                        title="pm disable-user --user 0"
                      >
                        <PauseCircle size={12} />
                        <span>{isArabic ? "تعطيل" : "Disable"}</span>
                      </button>

                      {/* 2. Uninstall Keep Data (-k) Button: pm uninstall -k --user 0 */}
                      <button
                        onClick={() => onExecuteSingle("uninstall-k", pkg.id)}
                        disabled={pkg.status === "uninstalled" || bulkExecuting}
                        className={`action-button h-7 px-2 text-[0.68rem] font-bold border rounded-xs transition-colors flex items-center gap-1 ${
                          pkg.status === "uninstalled" || bulkExecuting
                            ? "opacity-40 cursor-not-allowed border-gray-300 dark:border-slate-800 text-gray-400"
                            : "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50 text-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/60 cursor-pointer"
                        }`}
                        title="pm uninstall -k --user 0"
                      >
                        <FolderMinus size={12} />
                        <span>{isArabic ? "إلغاء (-k)" : "Uninstall (-k)"}</span>
                      </button>

                      {/* 3. Full Purge Button: pm uninstall --user 0 */}
                      <button
                        onClick={() => onExecuteSingle("purge", pkg.id)}
                        disabled={bulkExecuting}
                        className="action-button h-7 px-2 text-[0.68rem] font-bold border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        title="pm uninstall --user 0"
                      >
                        <Trash2 size={12} />
                        <span>{isArabic ? "إزالة كاملة" : "Full Purge"}</span>
                      </button>

                      {/* Restore / Re-enable if disabled or uninstalled */}
                      {(pkg.status === "disabled" || pkg.status === "uninstalled") && (
                        <button
                          onClick={() => onExecuteSingle("restore", pkg.id)}
                          disabled={bulkExecuting}
                          className="action-button h-7 px-2 text-[0.68rem] font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          title={
                            pkg.status === "uninstalled"
                              ? "cmd package install-existing --user 0"
                              : "pm enable"
                          }
                        >
                          <RotateCcw size={12} />
                          <span>{isArabic ? "استعادة" : "Restore"}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default DebloaterWorkspace;
