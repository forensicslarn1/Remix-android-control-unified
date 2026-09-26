import React, { useState, useMemo, useRef } from "react";
import {
  PackageOpen,
  Search,
  X,
  RotateCcw,
  Play,
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
  Info,
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
import type { CommunityPackage } from "@/lib/communityCatalog";
import { toast } from "sonner";

export type RawDebloatAction = "disable" | "uninstall-k" | "purge" | "restore";

interface DebloaterWorkspaceProps {
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

interface BulkExecutionProgress {
  action: RawDebloatAction;
  total: number;
  current: number;
  currentPkg?: string;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  aborted: boolean;
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

  // Filter packages
  const filteredPackages = useMemo(() => {
    let list = categorizedPackages;

    // Search query
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
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
  }, [categorizedPackages, query, categoryFilter, statusFilter, sortBy, sortOrder]);

  // Grouped packages for category grouping view
  const groupedPackages = useMemo(() => {
    const groups: Array<{ category: (typeof APP_CATEGORIES)[AppCategoryId]; packages: CategorizedPackage[] }> = [];
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
        // Restore: try enable then install-existing
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

  // Execute bulk action
  const startBulkAction = async (action: RawDebloatAction, targetIds: string[]) => {
    if (targetIds.length === 0) return;

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
            error: res.stderr || res.stdout || "Exit code non-zero",
          });
        }
      } catch (e: any) {
        progress.failed.push({ id: pkgId, error: e?.message || "Execution exception" });
      }

      setBulkProgress({ ...progress });
    }

    setBulkExecuting(false);
    await onRefreshPackages();
    // Clear selection of processed succeeded packages
    setSelected((prev) => prev.filter((id) => !progress.succeeded.includes(id)));

    if (progress.failed.length === 0 && !progress.aborted) {
      toast.success(
        isArabic
          ? `اكتمل تنفيذ العملية على ${progress.succeeded.length} حزمة بنجاح.`
          : `Batch completed successfully on ${progress.succeeded.length} packages.`
      );
    } else {
      toast.info(
        isArabic
          ? `انتهت الدفعة: ${progress.succeeded.length} نجح، ${progress.failed.length} فشل.`
          : `Batch finished: ${progress.succeeded.length} succeeded, ${progress.failed.length} failed.`
      );
    }
  };

  const handleSelectAllVisible = () => {
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
              {isArabic ? "إدارة الحزم غير المقيدة وإلغاء البرامج الزائدة" : "Unrestricted Package Manager & Debloater"}
            </h2>
            <p className="text-xs text-[#526273] dark:text-slate-400 max-w-3xl leading-relaxed">
              {isArabic
                ? "تحكم مباشر في جميع حزم أندرويد دون قيود أو قوائم حماية مسبقة. تفعيل فوري للإجراءات الثلاثية: تعطيل (pm disable-user)، أو إلغاء مع إبقاء البيانات (pm uninstall -k)، أو إزالة كاملة نهائية (pm uninstall)."
                : "Direct, unrestricted execution on all Android packages with zero hardcoded whitelist locks. Full support for raw Disable (`pm disable-user`), Uninstall Keep Data (`pm uninstall -k`), and Full Purge (`pm uninstall`)."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

        {/* Telemetry counters */}
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
            <p className="kicker text-[#b45309] dark:text-amber-400">{isArabic ? "أزيلت للمستخدم 0" : "Uninstalled (User 0)"}</p>
            <p className="text-xl font-bold mono text-[#b45309] dark:text-amber-300 mt-1">{stats.uninstalled}</p>
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
              placeholder={isArabic ? "ابحث بالاسم أو معرف الحزمة..." : "Search package name or ID..."}
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
                className="action-button h-8 px-2.5 text-xs border border-[#b9da71] dark:border-emerald-800 bg-[#eef8cd] dark:bg-emerald-950/60 hover:bg-[#e4f2b8] text-[#3f7a18] dark:text-emerald-300 font-semibold cursor-pointer"
              >
                {isArabic ? "تحديد المفعلة" : "Select Enabled"} ({filteredPackages.filter((p) => p.status === "enabled").length})
              </button>

              <button
                onClick={() => {
                  const disabledIds = filteredPackages.filter((p) => p.status === "disabled").map((p) => p.id);
                  setSelected((prev) => Array.from(new Set([...prev, ...disabledIds])));
                }}
                className="action-button h-8 px-2.5 text-xs border border-[#fed7aa] dark:border-amber-800 bg-[#fff7ed] dark:bg-amber-950/60 hover:bg-[#ffedd5] text-[#b45309] dark:text-amber-300 font-semibold cursor-pointer"
              >
                {isArabic ? "تحديد المعطلة" : "Select Disabled"} ({filteredPackages.filter((p) => p.status === "disabled").length})
              </button>

              {selected.length > 0 && (
                <button
                  onClick={() => setSelected([])}
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
              <CheckSquare size={18} />
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
                {isArabic
                  ? "تطبيق فوري لأوامر ADB المباشرة على جميع الحزم المحددة في وقت واحد دون قيود:"
                  : "Execute unrestricted raw commands simultaneously across all selected packages:"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Batch Disable */}
            <Button
              size="sm"
              disabled={bulkExecuting}
              onClick={() => setConfirmModal({ open: true, action: "disable", targets: selected })}
              className="action-button h-8 px-3 text-xs bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
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
              className="action-button h-8 px-3 text-xs bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
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
              className="action-button h-8 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
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
              className="action-button h-8 px-3 text-xs border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 font-bold flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900"
              title="cmd package install-existing --user 0 <package_name> / pm enable"
            >
              <RotateCcw size={13} />
              <span>{isArabic ? "استعادة" : "Restore"}</span>
            </Button>

            <button
              onClick={() => setSelected([])}
              className="action-button h-8 px-2.5 text-xs text-[#687584] hover:text-[#14253a] dark:text-slate-400 dark:hover:text-slate-200 border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer rounded-xs"
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
                    onToggleSelect={(id) =>
                      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                    }
                    onToggleAll={() => {
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
              onToggleSelect={(id) =>
                setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
              }
              onToggleAll={handleSelectAllVisible}
              executingPkgId={executingPkgId}
              onExecuteSingle={executeSingleAction}
              isArabic={isArabic}
              language={language}
              showCategoryCol={true}
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Unrestricted Action Bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 border border-[#14253a] dark:border-slate-700 bg-[#14253a] dark:bg-slate-900 text-white px-5 py-3 shadow-2xl rounded-sm">
          <span className="mono text-xs font-semibold flex items-center gap-1.5 text-[#c8f04a] dark:text-cyan-300 mr-2">
            <CheckSquare size={15} />
            {selected.length} {isArabic ? "حزمة محددة" : "selected"}
          </span>

          <div className="h-5 w-px bg-[#2f4860] dark:bg-slate-700" />

          {/* 1. Disable Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "disable", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="pm disable-user --user 0 <pkg>"
          >
            <PauseCircle size={14} />
            <span>{isArabic ? "تعطيل محدد" : "Disable"}</span>
          </Button>

          {/* 2. Uninstall (-k) Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "uninstall-k", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="pm uninstall -k --user 0 <pkg>"
          >
            <FolderMinus size={14} />
            <span>{isArabic ? "إلغاء وإبقاء البيانات (-k)" : "Uninstall (-k)"}</span>
          </Button>

          {/* 3. Full Purge Button */}
          <Button
            size="sm"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "purge", targets: selected })}
            className="action-button h-8 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="pm uninstall --user 0 <pkg>"
          >
            <Trash2 size={14} />
            <span>{isArabic ? "إزالة كاملة (Purge)" : "Full Purge"}</span>
          </Button>

          {/* Restore / Re-enable option */}
          <Button
            size="sm"
            variant="outline"
            disabled={bulkExecuting}
            onClick={() => setConfirmModal({ open: true, action: "restore", targets: selected })}
            className="action-button h-8 px-3 text-xs border-emerald-500 text-emerald-400 hover:bg-emerald-950 font-bold flex items-center gap-1.5 cursor-pointer"
            title="cmd package install-existing --user 0 <pkg> / pm enable <pkg>"
          >
            <RotateCcw size={13} />
            <span>{isArabic ? "استعادة / تثبيت" : "Restore"}</span>
          </Button>

          <button
            onClick={() => setSelected([])}
            className="text-xs text-[#a6b3be] hover:text-white ml-2 p-1 cursor-pointer"
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
                      ? `تأكيد إجراء مشغّل الحزم: ${getActionLabel(confirmModal.action).ar}`
                      : `Confirm Raw Operator Action: ${getActionLabel(confirmModal.action).en}`}
                  </h3>
                  <p className="mono text-xs text-[#526273] dark:text-slate-400 mt-0.5">
                    {confirmModal.targets.length} {isArabic ? "حزمة مختارة للتنفيذ المباشر" : "packages selected for execution"}
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
                  {isArabic ? "أمر ADB المباشر المنفذ:" : "Raw ADB Command Execution Pattern:"}
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
                {isArabic ? "تأكيد وتنفيذ الآن" : "Confirm & Execute Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Execution Progress Modal */}
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
                        ? `جارٍ تنفيذ ${getActionLabel(bulkProgress.action).ar} (${bulkProgress.current}/${bulkProgress.total})...`
                        : `Executing ${getActionLabel(bulkProgress.action).en} (${bulkProgress.current}/${bulkProgress.total})...`
                      : isArabic
                      ? "اكتمل تنفيذ العمليات المحددة"
                      : "Batch Execution Completed"}
                  </h3>
                  <p className="mono text-xs text-[#526273] dark:text-slate-400 mt-0.5">
                    {getActionCommand(bulkProgress.action, "<target>")}
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
                  {isArabic ? "التقدم:" : "Progress:"} {bulkProgress.current} / {bulkProgress.total} (
                  {Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%)
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

              <div className="h-3 w-full bg-[#eee7da] dark:bg-slate-800 overflow-hidden border border-[#d8d1c4] dark:border-slate-700">
                <div
                  className="h-full bg-[#14253a] dark:bg-cyan-500 transition-all duration-150"
                  style={{ width: `${(bulkProgress.current / Math.max(1, bulkProgress.total)) * 100}%` }}
                />
              </div>

              {bulkExecuting && bulkProgress.currentPkg && (
                <div className="mono text-xs text-[#526273] dark:text-slate-300 bg-[#f8f5ee] dark:bg-slate-800/80 border border-[#d8d1c4] dark:border-slate-700 p-2 mt-2 truncate">
                  <span className="text-[#8e9eae] font-bold mr-1">{isArabic ? "الحزمة:" : "Target:"}</span>
                  {bulkProgress.currentPkg}
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
                  className="action-button border-[#dba193] text-[#c2362b] hover:bg-[#fbe5df] text-xs"
                >
                  <X size={14} className="mr-1" />
                  {isArabic ? "إيقاف مؤقت للعمليات المتبقية" : "Abort Remaining"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setBulkProgress(null)}
                  className="action-button bg-[#14253a] text-white hover:bg-[#233a54] text-xs"
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
  packages: CategorizedPackage[];
  selected: string[];
  onToggleSelect: (id: string) => void;
  onToggleAll?: () => void;
  executingPkgId: string | null;
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
          <th className="w-12 px-3 py-3 text-center">
            <input
              type="checkbox"
              ref={(el) => {
                if (el) el.indeterminate = isSomeChecked;
              }}
              checked={isAllChecked}
              onChange={() => onToggleAll?.()}
              aria-label={isArabic ? "تحديد أو إلغاء تحديد الكل في هذا الجدول" : "Select or deselect all in table"}
              title={isAllChecked ? (isArabic ? "إلغاء تحديد الكل" : "Deselect All") : (isArabic ? "تحديد الكل" : "Select All")}
              className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer rounded-xs"
            />
          </th>
          {showCategoryCol && <th className="px-3 py-3">{isArabic ? "التصنيف" : "Category"}</th>}
          <th className="px-3 py-3">{isArabic ? "معرف الحزمة والتفاصيل" : "Package ID & Details"}</th>
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
                  aria-label={`Select ${pkg.id}`}
                  className="h-4 w-4 accent-[#14253a] dark:accent-cyan-500 cursor-pointer rounded-xs"
                />
              </td>

              {showCategoryCol && (
                <td className="px-3 py-3">
                  <AppCategoryBadge category={pkg.category.id} language={language} short={true} />
                </td>
              )}

              {/* Package ID & Description */}
              <td className="px-3 py-3 max-w-md">
                <p className="mono text-xs font-semibold text-[#14253a] dark:text-slate-100 select-all">
                  {pkg.id}
                </p>
                {pkg.description && (
                  <p className="text-[0.72rem] text-[#526273] dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">
                    {pkg.description}
                  </p>
                )}
                {pkg.list && (
                  <span className="mono text-[0.62rem] text-[#8e9eae] dark:text-slate-500">
                    {isArabic ? "قائمة:" : "List:"} {pkg.list}
                  </span>
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
                        disabled={pkg.status === "disabled"}
                        className={`action-button h-7 px-2 text-[0.68rem] font-bold border rounded-xs transition-colors flex items-center gap-1 ${
                          pkg.status === "disabled"
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
                        disabled={pkg.status === "uninstalled"}
                        className={`action-button h-7 px-2 text-[0.68rem] font-bold border rounded-xs transition-colors flex items-center gap-1 ${
                          pkg.status === "uninstalled"
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
                        className="action-button h-7 px-2 text-[0.68rem] font-bold border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors flex items-center gap-1 cursor-pointer"
                        title="pm uninstall --user 0"
                      >
                        <Trash2 size={12} />
                        <span>{isArabic ? "إزالة كاملة" : "Full Purge"}</span>
                      </button>

                      {/* Restore / Re-enable if disabled or uninstalled */}
                      {(pkg.status === "disabled" || pkg.status === "uninstalled") && (
                        <button
                          onClick={() => onExecuteSingle("restore", pkg.id)}
                          className="action-button h-7 px-2 text-[0.68rem] font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1 cursor-pointer"
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
