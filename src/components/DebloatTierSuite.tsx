import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Sliders,
  Check,
  Sparkles,
  ChevronDown,
  Info,
  Lock,
  Smartphone,
  CheckSquare,
} from "lucide-react";
import {
  type DebloatTier,
  type DebloatPreset,
  ALL_PRESETS,
  GLOBAL_PROTECTED_PACKAGES,
} from "@/data/presets";

interface DebloatTierSuiteProps {
  selectedTier: DebloatTier | "all";
  onSelectTier: (tier: DebloatTier | "all") => void;
  activePresetId: string | "all";
  onSelectPreset: (presetId: string | "all") => void;
  tierCounts: {
    safe: number;
    telemetry: number;
    advanced: number;
    all: number;
  };
  detectedManufacturer?: string;
  isArabic: boolean;
  onQuickSelectTier: (tier: DebloatTier) => void;
  activePreset?: DebloatPreset;
}

export const DebloatTierSuite: React.FC<DebloatTierSuiteProps> = ({
  selectedTier,
  onSelectTier,
  activePresetId,
  onSelectPreset,
  tierCounts,
  detectedManufacturer,
  isArabic,
  onQuickSelectTier,
  activePreset,
}) => {
  const [showGuardrailDetails, setShowGuardrailDetails] = useState(false);

  return (
    <div className="space-y-3">
      {/* Preset Selector & Suite Info Card */}
      <div className="border border-[#d8d1c4] dark:border-slate-800 bg-[#fffdf8] dark:bg-slate-900/90 rounded-xs p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#eee7da] dark:border-slate-800">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[#526273] dark:text-slate-400">
              {isArabic ? "حزمة التنظيف المعتمدة (Preset):" : "Curated Preset Suite:"}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectPreset("all")}
                className={`px-3 py-1 text-xs font-semibold rounded-xs border transition-colors ${
                  activePresetId === "all"
                    ? "bg-[#14253a] text-white border-[#14253a] dark:bg-cyan-600 dark:border-cyan-500"
                    : "bg-[#fbf9f3] dark:bg-slate-800 text-[#526273] dark:text-slate-300 border-[#d8d1c4] dark:border-slate-700 hover:border-[#14253a] dark:hover:border-slate-500"
                }`}
              >
                {isArabic ? "جميع الحزم (الوضع الكامل)" : "All Packages (Full Inventory)"}
              </button>

              {ALL_PRESETS.map((preset) => {
                const isMatch = detectedManufacturer && detectedManufacturer.toLowerCase().includes(preset.manufacturer);
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className={`relative px-3 py-1 text-xs font-semibold rounded-xs border transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-[#14253a] text-white border-[#14253a] dark:bg-cyan-600 dark:border-cyan-500"
                        : "bg-[#fbf9f3] dark:bg-slate-800 text-[#526273] dark:text-slate-300 border-[#d8d1c4] dark:border-slate-700 hover:border-[#14253a] dark:hover:border-slate-500"
                    }`}
                  >
                    {isMatch && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                    <span>{preset.name}</span>
                    <span className="text-[0.65rem] opacity-75">({preset.items.length})</span>
                    {isMatch && (
                      <span className="text-[0.6rem] uppercase tracking-wider font-mono bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 px-1 py-0.2 rounded">
                        {isArabic ? "مطابق" : "Device"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {detectedManufacturer && (
            <div className="flex items-center gap-1.5 text-xs text-[#526273] dark:text-slate-400 font-mono">
              <Smartphone size={13} className="text-cyan-500" />
              <span>{isArabic ? "الشركة المصنعة للجهاز:" : "Detected OEM:"}</span>
              <span className="font-bold text-[#14253a] dark:text-slate-200 capitalize">
                {detectedManufacturer}
              </span>
            </div>
          )}
        </div>

        {/* Active Preset Summary Banner (if a preset is chosen) */}
        {activePreset && (
          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-semibold text-[#14253a] dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500 shrink-0" />
                <span>{activePreset.name}</span>
                <span className="text-[0.68rem] font-mono text-[#526273] dark:text-slate-400 border border-[#d8d1c4] dark:border-slate-700 px-1.5 py-0.2 rounded">
                  {activePreset.manufacturer.toUpperCase()}
                </span>
              </p>
              <p className="text-[0.73rem] text-[#687584] dark:text-slate-400 mt-0.5">
                {activePreset.description}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="mono text-[0.68rem] px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                {activePreset.items.filter((i) => i.tier === "safe").length} {isArabic ? "آمن" : "Safe"}
              </span>
              <span className="mono text-[0.68rem] px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                {activePreset.items.filter((i) => i.tier === "telemetry").length} {isArabic ? "تتبع" : "Telemetry"}
              </span>
              <span className="mono text-[0.68rem] px-2 py-0.5 rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                {activePreset.items.filter((i) => i.tier === "advanced").length} {isArabic ? "متقدم" : "Advanced"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3-Way Tier Filter Bar */}
      <div className="border border-[#d8d1c4] dark:border-slate-800 bg-[#fffdf8] dark:bg-slate-900/90 rounded-xs p-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[#526273] dark:text-slate-400 shrink-0">
              {isArabic ? "تصفية المستويات الثلاثية (3-Way Tier):" : "3-Way Tier Filter:"}
            </span>
            <button
              type="button"
              onClick={() => onSelectTier("all")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-xs border transition-colors ${
                selectedTier === "all"
                  ? "bg-[#14253a] text-white border-[#14253a] dark:bg-slate-700 dark:border-slate-600"
                  : "bg-transparent text-[#526273] dark:text-slate-400 border-transparent hover:bg-[#f3efe6] dark:hover:bg-slate-800"
              }`}
            >
              {isArabic ? "جميع المستويات" : "All Tiers"} ({tierCounts.all})
            </button>
          </div>

          {/* Quick Select current tier action */}
          {selectedTier !== "all" && (
            <button
              type="button"
              onClick={() => onQuickSelectTier(selectedTier)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xs border border-[#59869c] bg-[#eef6fa] dark:bg-cyan-950/60 text-[#1d5c8a] dark:text-cyan-300 hover:bg-[#e1f0f7] dark:hover:bg-cyan-900/60"
            >
              <CheckSquare size={13} />
              <span>
                {isArabic
                  ? `تحديد حزم مستوى (${selectedTier}) المفعلة`
                  : `Select all enabled (${selectedTier})`}
              </span>
            </button>
          )}
        </div>

        {/* The 3 Tier Segmented Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
          {/* 1. Safe Tier */}
          <button
            type="button"
            onClick={() => onSelectTier(selectedTier === "safe" ? "all" : "safe")}
            className={`p-3 text-left border rounded-xs transition-all flex flex-col justify-between ${
              selectedTier === "safe"
                ? "border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/40 shadow-xs"
                : "border-[#d8d1c4] dark:border-slate-800 bg-[#fbf9f3] dark:bg-slate-800/60 text-[#14253a] dark:text-slate-300 hover:border-emerald-500/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  className={selectedTier === "safe" ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-500"}
                />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isArabic ? "آمن (Safe)" : "Safe Tier"}
                </span>
              </div>
              <span
                className={`mono text-xs px-2 py-0.5 rounded font-bold ${
                  selectedTier === "safe"
                    ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
                    : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                }`}
              >
                {tierCounts.safe}
              </span>
            </div>
            <p className="text-[0.7rem] text-[#526273] dark:text-slate-400 mt-2 leading-relaxed">
              {isArabic
                ? "تطبيقات ترويجية وإضافات غير أساسية (Bixby, OneDrive, PalmStore, Hi Browser). إزالتها آمنة 100% دون أي تأثير على النظام."
                : "Bloatware, promotional apps, and duplicate services. 100% safe to uninstall without breaking Android."}
            </p>
          </button>

          {/* 2. Telemetry Tier */}
          <button
            type="button"
            onClick={() => onSelectTier(selectedTier === "telemetry" ? "all" : "telemetry")}
            className={`p-3 text-left border rounded-xs transition-all flex flex-col justify-between ${
              selectedTier === "telemetry"
                ? "border-cyan-600 bg-cyan-50/80 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-100 ring-2 ring-cyan-500/40 shadow-xs"
                : "border-[#d8d1c4] dark:border-slate-800 bg-[#fbf9f3] dark:bg-slate-800/60 text-[#14253a] dark:text-slate-300 hover:border-cyan-500/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity
                  size={16}
                  className={selectedTier === "telemetry" ? "text-cyan-600 dark:text-cyan-400" : "text-cyan-500"}
                />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isArabic ? "القياس والتتبع (Telemetry)" : "Telemetry Tier"}
                </span>
              </div>
              <span
                className={`mono text-xs px-2 py-0.5 rounded font-bold ${
                  selectedTier === "telemetry"
                    ? "bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950"
                    : "bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800"
                }`}
              >
                {tierCounts.telemetry}
              </span>
            </div>
            <p className="text-[0.7rem] text-[#526273] dark:text-slate-400 mt-2 leading-relaxed">
              {isArabic
                ? "محركات تحليل السلوك وجمع الإحصاءات والإعلانات الخفية (Rubin, GOS, Beacon, Meta Analytics). الإجراء الموصى به: تعطيل (disable)."
                : "Background trackers, crash analytics, and ad profilers. Recommended action: disable to save battery and preserve privacy."}
            </p>
          </button>

          {/* 3. Advanced Tier */}
          <button
            type="button"
            onClick={() => onSelectTier(selectedTier === "advanced" ? "all" : "advanced")}
            className={`p-3 text-left border rounded-xs transition-all flex flex-col justify-between ${
              selectedTier === "advanced"
                ? "border-amber-600 bg-amber-50/80 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/40 shadow-xs"
                : "border-[#d8d1c4] dark:border-slate-800 bg-[#fbf9f3] dark:bg-slate-800/60 text-[#14253a] dark:text-slate-300 hover:border-amber-500/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders
                  size={16}
                  className={selectedTier === "advanced" ? "text-amber-600 dark:text-amber-400" : "text-amber-500"}
                />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isArabic ? "متقدم بحذر (Advanced)" : "Advanced Tier"}
                </span>
              </div>
              <span
                className={`mono text-xs px-2 py-0.5 rounded font-bold ${
                  selectedTier === "advanced"
                    ? "bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950"
                    : "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                }`}
              >
                {tierCounts.advanced}
              </span>
            </div>
            <p className="text-[0.7rem] text-[#526273] dark:text-slate-400 mt-2 leading-relaxed">
              {isArabic
                ? "متاجر التطبيقات (Galaxy Store, Play Store) ومديرو الصيانة. تعطيلها يتطلب وجود بديل، وقد يؤثر على تحديث ميزات الكاميرا."
                : "Store clients and maintenance daemons. Disabling requires an alternative store (F-Droid, Aurora) already installed."}
            </p>
          </button>
        </div>
      </div>

      {/* Global Protected Packages Guardrail Banner */}
      <div className="border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xs p-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                {isArabic
                  ? "حواجز الحماية العالمية مفعلة (GLOBAL_PROTECTED_PACKAGES Active):"
                  : "Global Protected Guardrails Enforced:"}
              </span>
              <span className="text-xs text-emerald-800 dark:text-emerald-300 ml-1.5">
                {isArabic
                  ? "لوحات المفاتيح (Honeyboard, Gboard, Facemoji, SwiftKey) ومكونات النظام الأساسية (SystemUI, Settings, Phone) محمية بقفل أمان صلب لمنع تعطل الجهاز."
                  : "Keyboards (Honeyboard, Gboard, Facemoji, SwiftKey) and OS cores (SystemUI, Settings, Phone) are strictly locked against removal."}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGuardrailDetails(!showGuardrailDetails)}
            className="text-[0.68rem] font-mono font-semibold text-emerald-800 dark:text-emerald-300 underline hover:text-emerald-950 shrink-0 self-start sm:self-auto"
          >
            {showGuardrailDetails
              ? (isArabic ? "إخفاء القائمة المحمية" : "Hide Protected List")
              : (isArabic ? `عرض الحزم المحمية (${GLOBAL_PROTECTED_PACKAGES.length})` : `Show Protected List (${GLOBAL_PROTECTED_PACKAGES.length})`)}
          </button>
        </div>

        {showGuardrailDetails && (
          <div className="mt-2.5 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {GLOBAL_PROTECTED_PACKAGES.map((pkg) => (
              <div
                key={pkg}
                className="flex items-center gap-1.5 text-[0.68rem] font-mono bg-white/70 dark:bg-slate-900/60 border border-emerald-300/60 dark:border-emerald-800/60 px-2 py-1 rounded text-emerald-900 dark:text-emerald-200"
              >
                <Lock size={10} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate" title={pkg}>
                  {pkg}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebloatTierSuite;
