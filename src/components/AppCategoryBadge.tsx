/**
 * Field Service Ledger style: Category and status badge components.
 * Provides unified, accessible visual tags for applications across all site features.
 */
import {
  Activity,
  AlertTriangle,
  Box,
  Building2,
  CheckCircle2,
  Compass,
  Cpu,
  FileText,
  Film,
  Gamepad2,
  Globe,
  MessageSquare,
  MinusCircle,
  PauseCircle,
  Radio,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import type { AppCategoryId, AppCategoryInfo, PackageStatus, PackageRawState } from "@/lib/packageCategories";
import { APP_CATEGORIES } from "@/lib/packageCategories";
import type { DebloatExecutionLevel } from "@/lib/adbClient";

interface GlyphProps {
  categoryId: AppCategoryId | string;
  size?: number;
  className?: string;
}

export function CategoryGlyph({ categoryId, size = 14, className = "" }: GlyphProps) {
  const props = { size, className };
  switch (categoryId) {
    case "google":
      return <Globe {...props} />;
    case "system":
      return <Cpu {...props} />;
    case "oem":
      return <Building2 {...props} />;
    case "carrier":
      return <Radio {...props} />;
    case "telemetry":
      return <Activity {...props} />;
    case "social":
      return <MessageSquare {...props} />;
    case "media":
      return <Film {...props} />;
    case "productivity":
      return <FileText {...props} />;
    case "browser":
      return <Compass {...props} />;
    case "utilities":
      return <Wrench {...props} />;
    case "games":
      return <Gamepad2 {...props} />;
    case "other":
    default:
      return <Box {...props} />;
  }
}

interface AppCategoryBadgeProps {
  category: AppCategoryInfo | AppCategoryId;
  language?: "en" | "ar" | "other";
  short?: boolean;
  showIcon?: boolean;
  className?: string;
  onClick?: () => void;
}

export function AppCategoryBadge({
  category,
  language = "en",
  short = false,
  showIcon = true,
  className = "",
  onClick,
}: AppCategoryBadgeProps) {
  const info = typeof category === "string" ? APP_CATEGORIES[category as AppCategoryId] || APP_CATEGORIES.other : category;
  const isAr = language === "ar";
  const label = short
    ? (isAr ? info.shortLabelAr : info.shortLabel)
    : (isAr ? info.nameAr : info.name);

  const Comp = onClick ? "button" : "span";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.67rem] font-medium leading-none tracking-normal transition-colors ${info.badgeClass} ${className}`}
      title={isAr ? info.descriptionAr : info.description}
    >
      {showIcon && <CategoryGlyph categoryId={info.id} size={11} className="shrink-0" />}
      <span className="whitespace-nowrap">{label}</span>
    </Comp>
  );
}

interface PackageStatusBadgeProps {
  status: PackageStatus;
  rawState?: PackageRawState;
  language?: "en" | "ar" | "other";
  className?: string;
  showRawTag?: boolean;
}

export function PackageStatusBadge({
  status,
  rawState,
  language = "en",
  className = "",
  showRawTag = true,
}: PackageStatusBadgeProps) {
  const isAr = language === "ar";
  const stateTag = rawState || (status === "disabled" ? "disabled-user" : status === "uninstalled" ? "not installed" : "enabled");

  if (status === "disabled") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 border border-[#e2d9cd] bg-[#f5f1e8] px-2 py-0.5 text-[0.65rem] font-semibold text-[#8c6b3e] dark:border-[#52442d] dark:bg-[#2b2214] dark:text-[#fcd34d] ${className}`}
        title={isAr ? "الحزمة معطلة للمستخدم 0 (disabled-user)" : "Package is disabled for User 0 (disabled-user)"}
      >
        <PauseCircle size={11} className="shrink-0 text-[#b45309]" />
        <span className="whitespace-nowrap">{isAr ? "معطّل" : "Disabled"}</span>
        {showRawTag && (
          <code className="font-mono text-[0.6rem] opacity-75 font-normal tracking-tight">
            ({stateTag})
          </code>
        )}
      </span>
    );
  }

  if (status === "uninstalled") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 border border-[#e5ded2] bg-[#eee9df] px-2 py-0.5 text-[0.65rem] font-semibold text-[#78716c] dark:border-[#3f3f46] dark:bg-[#27272a] dark:text-[#a1a1aa] ${className}`}
        title={isAr ? "الحزمة غير مثبتة للمستخدم 0 (not installed)" : "Package uninstalled for User 0 (not installed)"}
      >
        <MinusCircle size={11} className="shrink-0 text-[#78716c]" />
        <span className="whitespace-nowrap">{isAr ? "غير مثبت" : "Uninstalled"}</span>
        {showRawTag && (
          <code className="font-mono text-[0.6rem] opacity-75 font-normal tracking-tight">
            ({stateTag})
          </code>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-[#b9da71] bg-[#eef8cd] px-2 py-0.5 text-[0.65rem] font-semibold text-[#40631b] dark:border-[#38531e] dark:bg-[#1f2d12] dark:text-[#bef264] ${className}`}
      title={isAr ? "الحزمة نشطة ومفعلة على الجهاز (enabled)" : "Package is active and enabled on device (enabled)"}
    >
      <CheckCircle2 size={11} className="shrink-0 text-[#4d7c0f]" />
      <span className="whitespace-nowrap">{isAr ? "مفعّل" : "Enabled"}</span>
      {showRawTag && (
        <code className="font-mono text-[0.6rem] opacity-75 font-normal tracking-tight">
          ({stateTag})
        </code>
      )}
    </span>
  );
}

interface DebloatExecutionBadgeProps {
  level: DebloatExecutionLevel;
  language?: "en" | "ar" | "other";
  className?: string;
  showIcon?: boolean;
}

export function DebloatExecutionBadge({
  level,
  language = "en",
  className = "",
  showIcon = true,
}: DebloatExecutionBadgeProps) {
  const isAr = language === "ar";

  if (level === "expert") {
    return (
      <span
        className={`inline-flex items-center gap-1 border border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c] px-2 py-0.5 text-[0.65rem] font-semibold dark:border-[#7f1d1d] dark:bg-[#450a0a] dark:text-[#fca5a5] ${className}`}
        title={isAr ? "خبير (إزالة كاملة) - مسح البيانات والتخزين المؤقت والحسابات نهائياً" : "Expert (Full Purge) - Permanently erases data, cache, and accounts"}
      >
        {showIcon && <AlertTriangle size={11} className="shrink-0 text-[#dc2626]" />}
        <span className="whitespace-nowrap">{isAr ? "خبير (إزالة كاملة)" : "Expert (Full Purge)"}</span>
      </span>
    );
  }

  if (level === "advanced") {
    return (
      <span
        className={`inline-flex items-center gap-1 border border-[#fcd34d] bg-[#fefce8] text-[#92400e] px-2 py-0.5 text-[0.65rem] font-semibold dark:border-[#78350f] dark:bg-[#451a03] dark:text-[#fcd34d] ${className}`}
        title={isAr ? "متقدم (إلغاء التثبيت مع إبقاء البيانات -k)" : "Advanced (Uninstall & Keep Data -k)"}
      >
        {showIcon && <Trash2 size={11} className="shrink-0 text-[#d97706]" />}
        <span className="whitespace-nowrap">{isAr ? "متقدم (إلغاء وإبقاء البيانات)" : "Advanced (Keep Data)"}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 border border-[#bbf7d0] bg-[#f0fdf4] text-[#166534] px-2 py-0.5 text-[0.65rem] font-semibold dark:border-[#14532d] dark:bg-[#052e16] dark:text-[#86efac] ${className}`}
      title={isAr ? "آمن (تعطيل فقط) - تجميد التطبيق للمستخدم 0 دون لمس البيانات" : "Safe (Disable) - Freezes app for User 0, keeping all data intact"}
    >
      {showIcon && <ShieldCheck size={11} className="shrink-0 text-[#16a34a]" />}
      <span className="whitespace-nowrap">{isAr ? "آمن (تعطيل)" : "Safe (Disable)"}</span>
    </span>
  );
}
