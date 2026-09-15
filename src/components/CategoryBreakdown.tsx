/**
 * Field Service Ledger style: Visual summary of device package categories,
 * enabled vs disabled distribution, and quick category selectors.
 */
import { AppCategoryBadge, CategoryGlyph } from "./AppCategoryBadge";
import type { AppCategoryId, CategorySummaryStats } from "@/lib/packageCategories";
import { CheckCircle2, MinusCircle, PauseCircle, ShieldAlert, Sparkles } from "lucide-react";

interface CategoryBreakdownProps {
  stats: CategorySummaryStats;
  selectedCategory?: AppCategoryId | "all";
  onSelectCategory?: (categoryId: AppCategoryId | "all") => void;
  language?: "en" | "ar" | "other";
  compact?: boolean;
}

export function CategoryBreakdown({
  stats,
  selectedCategory = "all",
  onSelectCategory,
  language = "en",
  compact = false,
}: CategoryBreakdownProps) {
  const isAr = language === "ar";

  if (stats.total === 0) return null;

  return (
    <div className="service-card overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker text-[#687584]">
            {isAr ? "نظام تصنيف الحزم الموحد" : "Unified application ecosystem"}
          </p>
          <h3 className="mt-1 text-base font-bold tracking-[-0.03em] text-[#14253a] dark:text-[#f6f2ea]">
            {isAr
              ? `تم تصنيف ${stats.total} حزمة في ${stats.categories.length} فئات رئيسية`
              : `${stats.total} packages classified across ${stats.categories.length} functional categories`}
          </h3>
        </div>

        {/* Quick status metrics */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-[#b9da71] bg-[#eef8cd] px-2.5 py-1 text-xs font-semibold text-[#40631b] dark:border-[#38531e] dark:bg-[#1f2d12] dark:text-[#bef264]">
            <CheckCircle2 size={13} />
            <span>{stats.enabled} {isAr ? "مفعّل" : "enabled"}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 border border-[#e2d9cd] bg-[#f5f1e8] px-2.5 py-1 text-xs font-semibold text-[#8c6b3e] dark:border-[#52442d] dark:bg-[#2b2214] dark:text-[#fcd34d]">
            <PauseCircle size={13} />
            <span>{stats.disabled} {isAr ? "معطّل" : "disabled"}</span>
          </span>

          {stats.uninstalled > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-[#e5ded2] bg-[#eee9df] px-2.5 py-1 text-xs font-semibold text-[#78716c] dark:border-[#3f3f46] dark:bg-[#27272a] dark:text-[#a1a1aa]">
              <MinusCircle size={13} />
              <span>{stats.uninstalled} {isAr ? "غير مثبت" : "uninstalled"}</span>
            </span>
          )}

          {stats.recommended > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-[#dba193] bg-[#fbe5df] px-2.5 py-1 text-xs font-semibold text-[#934639] dark:border-[#672d24] dark:bg-[#2d1715] dark:text-[#fca5a5]">
              <ShieldAlert size={13} />
              <span>{stats.recommended} {isAr ? "موصى بإزالته" : "recommended"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Proportional category visual bar */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-sm bg-[#e8e2d5] dark:bg-[#203246]">
        {stats.categories.map(({ category, count }) => {
          const pct = Math.max(1, (count / stats.total) * 100);
          return (
            <div
              key={category.id}
              className={`${category.dotColor} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${isAr ? category.nameAr : category.name}: ${count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>

      {/* Category selector chips */}
      <div className={`mt-4 flex flex-wrap gap-1.5 ${compact ? "max-h-24 overflow-y-auto" : ""}`}>
        {onSelectCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory("all")}
            className={`action-button inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all ${
              selectedCategory === "all"
                ? "border-[#14253a] bg-[#14253a] text-[#f6f2ea] dark:border-[#c8f04a] dark:bg-[#c8f04a] dark:text-[#14253a]"
                : "border-[#d8d1c4] bg-[#fffdf8] text-[#526273] hover:border-[#14253a] dark:border-[#3d566e] dark:bg-[#18283b] dark:text-[#c7d3dc]"
            }`}
          >
            <Sparkles size={12} />
            <span>{isAr ? "جميع الفئات" : "All categories"}</span>
            <span className="mono text-[0.68rem] opacity-75">({stats.total})</span>
          </button>
        )}

        {stats.categories.map(({ category, count, disabledCount }) => {
          const isSelected = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory?.(category.id)}
              className={`action-button inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all ${
                isSelected
                  ? "ring-2 ring-[#14253a] dark:ring-[#c8f04a]"
                  : "hover:border-[#14253a] dark:hover:border-[#c8f04a]"
              } ${category.badgeClass}`}
            >
              <CategoryGlyph categoryId={category.id} size={12} />
              <span>{isAr ? category.shortLabelAr : category.shortLabel}</span>
              <span className="mono text-[0.66rem] font-semibold opacity-85">
                {count}
                {disabledCount > 0 && (
                  <span className="ml-1 text-[#b45309] dark:text-[#fbbf24]">
                    ({disabledCount} {isAr ? "معطل" : "off"})
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
