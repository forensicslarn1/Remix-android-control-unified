/**
 * Field Service Ledger style: Category and status badge components.
 * Provides unified, accessible visual tags for applications across all site features.
 */
import {
  Activity,
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
  PauseCircle,
  Radio,
  Wrench,
} from "lucide-react";
import type { AppCategoryId, AppCategoryInfo, PackageStatus } from "@/lib/packageCategories";
import { APP_CATEGORIES } from "@/lib/packageCategories";

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
  language?: "en" | "ar" | "other";
  className?: string;
}

export function PackageStatusBadge({ status, language = "en", className = "" }: PackageStatusBadgeProps) {
  const isAr = language === "ar";

  if (status === "disabled") {
    return (
      <span
        className={`inline-flex items-center gap-1 border border-[#e2d9cd] bg-[#f5f1e8] px-2 py-0.5 text-[0.65rem] font-semibold text-[#8c6b3e] dark:border-[#52442d] dark:bg-[#2b2214] dark:text-[#fcd34d] ${className}`}
        title={isAr ? "الحزمة معطلة للمستخدم 0" : "Package is disabled for User 0"}
      >
        <PauseCircle size={11} className="shrink-0 text-[#b45309]" />
        <span className="whitespace-nowrap">{isAr ? "معطّل" : "Disabled"}</span>
      </span>
    );
  }

  if (status === "uninstalled") {
    return (
      <span
        className={`inline-flex items-center gap-1 border border-[#e5ded2] bg-[#eee9df] px-2 py-0.5 text-[0.65rem] font-semibold text-[#78716c] dark:border-[#3f3f46] dark:bg-[#27272a] dark:text-[#a1a1aa] ${className}`}
        title={isAr ? "الحزمة غير مثبتة للمستخدم 0" : "Package uninstalled for User 0"}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#78716c]" />
        <span className="whitespace-nowrap">{isAr ? "غير مثبت" : "Uninstalled"}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 border border-[#b9da71] bg-[#eef8cd] px-2 py-0.5 text-[0.65rem] font-semibold text-[#40631b] dark:border-[#38531e] dark:bg-[#1f2d12] dark:text-[#bef264] ${className}`}
      title={isAr ? "الحزمة نشطة ومفعلة على الجهاز" : "Package is active and enabled on device"}
    >
      <CheckCircle2 size={11} className="shrink-0 text-[#4d7c0f]" />
      <span className="whitespace-nowrap">{isAr ? "مفعّل" : "Enabled"}</span>
    </span>
  );
}
