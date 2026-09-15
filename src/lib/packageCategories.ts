/**
 * Field Service Ledger style: Android package taxonomy and categorization engine.
 * Classifies packages by purpose, vendor, and role, enabling consistent
 * category filtering, sorting, and telemetry across all desk features.
 */
import type { CommunityPackage, RemovalLevel } from "./communityCatalog";

export type AppCategoryId =
  | "google"
  | "system"
  | "oem"
  | "carrier"
  | "telemetry"
  | "social"
  | "media"
  | "productivity"
  | "browser"
  | "utilities"
  | "games"
  | "other";

export type PackageStatus = "enabled" | "disabled" | "uninstalled";
export type PackageRawState = "disabled-user" | "not installed" | "enabled";

export interface PackageParsedState {
  status: PackageStatus;
  rawState: PackageRawState;
}

/**
 * Parses raw package state string (from dumpsys, pm list, or error outputs)
 * into canonical status and rawState:
 * - Disabled (`disabled-user`)
 * - Uninstalled for user 0 (`not installed`)
 * - Fully enabled (`enabled`)
 */
export function parsePackageState(rawStateOrOutput: string): PackageParsedState {
  const text = (rawStateOrOutput || "").toLowerCase().trim();

  // Check for uninstalled / not installed for user 0
  if (
    text.includes("not installed") ||
    text.includes("not_installed") ||
    text.includes("installed=false") ||
    text.includes("uninstalled") ||
    text.includes("package not found") ||
    text.includes("unknown package") ||
    text.includes("is not installed for user")
  ) {
    return { status: "uninstalled", rawState: "not installed" };
  }

  // Check for disabled / disabled-user
  if (
    text.includes("disabled-user") ||
    text.includes("disabled_user") ||
    text.includes("disabled") ||
    text.includes("enabled=3") || // COMPONENT_ENABLED_STATE_DISABLED_USER in dumpsys
    text.includes("enabled=2") || // COMPONENT_ENABLED_STATE_DISABLED
    text.includes("enabled=4")    // COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED
  ) {
    return { status: "disabled", rawState: "disabled-user" };
  }

  // Default to fully enabled
  return { status: "enabled", rawState: "enabled" };
}

export interface AppCategoryInfo {
  id: AppCategoryId;
  name: string;
  nameAr: string;
  shortLabel: string;
  shortLabelAr: string;
  badgeClass: string;
  badgeTone: string;
  dotColor: string;
  iconName: string;
  description: string;
  descriptionAr: string;
}

export interface CategorizedPackage {
  id: string;
  category: AppCategoryInfo;
  status: PackageStatus;
  rawState?: PackageRawState;
  hasCommunityContext: boolean;
  list?: string;
  description: string;
  removal: RemovalLevel;
  dependencies: string[];
  neededBy: string[];
  labels: string[];
}

export const APP_CATEGORIES: Record<AppCategoryId, AppCategoryInfo> = {
  google: {
    id: "google",
    name: "Google Services & GMS",
    nameAr: "خدمات Google وGMS",
    shortLabel: "Google",
    shortLabelAr: "جوجل",
    badgeClass: "border-[#9fc3dc] bg-[#eaf4fb] text-[#1c5578] dark:bg-[#1a2f3f] dark:text-[#a5d2f0] dark:border-[#2f516a]",
    badgeTone: "border-[#9fc3dc] text-[#1c5578]",
    dotColor: "bg-[#2563eb]",
    iconName: "Globe",
    description: "Google Mobile Services, Play ecosystem, search, and cloud frameworks.",
    descriptionAr: "خدمات Google للأجهزة المحمولة، ومتجر Play، وأطر عمل السحابة.",
  },
  system: {
    id: "system",
    name: "System & Core OS",
    nameAr: "النظام ونواة الأندرويد",
    shortLabel: "System",
    shortLabelAr: "نظام",
    badgeClass: "border-[#c4b5fd] bg-[#f5f3ff] text-[#6d28d9] dark:bg-[#281e3e] dark:text-[#d8b4fe] dark:border-[#4c3575]",
    badgeTone: "border-[#c4b5fd] text-[#6d28d9]",
    dotColor: "bg-[#7c3aed]",
    iconName: "Cpu",
    description: "Android AOSP framework, system UI, telephony, Bluetooth, and hardware interfaces.",
    descriptionAr: "إطار عمل AOSP ونظام الواجهة والهاتف والبلوتوث وواجهات العتاد الأساسية.",
  },
  oem: {
    id: "oem",
    name: "OEM & Manufacturer",
    nameAr: "الشركة المصنعة والواجهة",
    shortLabel: "OEM",
    shortLabelAr: "المصنّع",
    badgeClass: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] dark:bg-[#341d13] dark:text-[#fdba74] dark:border-[#6a351d]",
    badgeTone: "border-[#fed7aa] text-[#c2410c]",
    dotColor: "bg-[#ea580c]",
    iconName: "Building2",
    description: "Vendor skin components (Samsung OneUI, Xiaomi MIUI/HyperOS, Moto, Huawei, etc.).",
    descriptionAr: "واجهات وتطبيقات الشركات المصنعة (سامسونج، شاومي، هواوي، ون بلس، وغيرها).",
  },
  carrier: {
    id: "carrier",
    name: "Carrier & Telecom",
    nameAr: "شبكات الاتصال والشريحة",
    shortLabel: "Carrier",
    shortLabelAr: "الشبكة",
    badgeClass: "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c] dark:bg-[#381616] dark:text-[#fca5a5] dark:border-[#6b2626]",
    badgeTone: "border-[#fca5a5] text-[#b91c1c]",
    dotColor: "bg-[#dc2626]",
    iconName: "Radio",
    description: "Cellular operator bloatware, SIM provisioning, and billing services.",
    descriptionAr: "تطبيقات مشغلي شبكات الجوال، وخدمات الشريحة والتهيئة المسبقة.",
  },
  telemetry: {
    id: "telemetry",
    name: "Telemetry & Diagnostics",
    nameAr: "التتبع والقياس عن بعد",
    shortLabel: "Telemetry",
    shortLabelAr: "تتبع",
    badgeClass: "border-[#fcd34d] bg-[#fefce8] text-[#a16207] dark:bg-[#322910] dark:text-[#fde047] dark:border-[#685317]",
    badgeTone: "border-[#fcd34d] text-[#a16207]",
    dotColor: "bg-[#eab308]",
    iconName: "Activity",
    description: "Diagnostics, analytics beacons, crash collectors, and behavior trackers.",
    descriptionAr: "خدمات القياس والتشخيص وجمع سجلات الأخطاء ومراقبة الاستخدام.",
  },
  social: {
    id: "social",
    name: "Social & Communication",
    nameAr: "التواصل والرسائل والمكالمات",
    shortLabel: "Social",
    shortLabelAr: "تواصل",
    badgeClass: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857] dark:bg-[#112d22] dark:text-[#6ee7b7] dark:border-[#1d5942]",
    badgeTone: "border-[#a7f3d0] text-[#047857]",
    dotColor: "bg-[#10b981]",
    iconName: "MessageSquare",
    description: "Messaging, dialers, contacts, email, and social networks.",
    descriptionAr: "تطبيقات المراسلة والاتصال والبريد وسجل الهاتف وشبكات التواصل.",
  },
  media: {
    id: "media",
    name: "Media & Entertainment",
    nameAr: "الوسائط والصوت والفيديو",
    shortLabel: "Media",
    shortLabelAr: "وسائط",
    badgeClass: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d] dark:bg-[#361324] dark:text-[#f472b6] dark:border-[#672346]",
    badgeTone: "border-[#fbcfe8] text-[#be185d]",
    dotColor: "bg-[#ec4899]",
    iconName: "Film",
    description: "Music, video streaming, camera, gallery, podcasts, and photo tools.",
    descriptionAr: "مشغلات الصوت والفيديو، والكاميرا، والمعرض، وأدوات الصور والبودكاست.",
  },
  productivity: {
    id: "productivity",
    name: "Productivity & Office",
    nameAr: "الإنتاجية والمستندات",
    shortLabel: "Productivity",
    shortLabelAr: "إنتاجية",
    badgeClass: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1] dark:bg-[#11293a] dark:text-[#7dd3fc] dark:border-[#1c4d6f]",
    badgeTone: "border-[#bae6fd] text-[#0369a1]",
    dotColor: "bg-[#0284c7]",
    iconName: "FileText",
    description: "Notes, office editors, calendar, clock, calculators, and cloud storage.",
    descriptionAr: "الملاحظات ومحررات المستندات والتقويم والساعة والمساحات السحابية.",
  },
  browser: {
    id: "browser",
    name: "Browser & Navigation",
    nameAr: "المتصفحات والخرائط",
    shortLabel: "Browser",
    shortLabelAr: "تصفح",
    badgeClass: "border-[#99f6e4] bg-[#f0fdfa] text-[#0f766e] dark:bg-[#102b28] dark:text-[#5eead4] dark:border-[#1e5852]",
    badgeTone: "border-[#99f6e4] text-[#0f766e]",
    dotColor: "bg-[#14b8a6]",
    iconName: "Compass",
    description: "Web browsers, webview engines, GPS navigation, and mapping services.",
    descriptionAr: "متصفحات الويب، ومحركات العرض، وخرائط الملاحة وGPS.",
  },
  utilities: {
    id: "utilities",
    name: "Tools & Utilities",
    nameAr: "الأدوات والمرافق",
    shortLabel: "Utilities",
    shortLabelAr: "أدوات",
    badgeClass: "border-[#e2e8f0] bg-[#f8fafc] text-[#475569] dark:bg-[#1e293b] dark:text-[#cbd5e1] dark:border-[#334155]",
    badgeTone: "border-[#e2e8f0] text-[#475569]",
    dotColor: "bg-[#64748b]",
    iconName: "Wrench",
    description: "Keyboards, file managers, sync utilities, and device maintenance.",
    descriptionAr: "لوحات المفاتيح، ومديرو الملفات، وأدوات المزامنة والصيانة.",
  },
  games: {
    id: "games",
    name: "Games & App Stores",
    nameAr: "الألعاب ومتاجر التطبيقات",
    shortLabel: "Games",
    shortLabelAr: "ألعاب",
    badgeClass: "border-[#ddd6fe] bg-[#faf5ff] text-[#7e22ce] dark:bg-[#2c1842] dark:text-[#c084fc] dark:border-[#572b84]",
    badgeTone: "border-[#ddd6fe] text-[#7e22ce]",
    dotColor: "bg-[#9333ea]",
    iconName: "Gamepad2",
    description: "Gaming centers, standalone games, and third-party software stores.",
    descriptionAr: "مراكز الألعاب، والألعاب المستقلة، ومتاجر التطبيقات الخارجية.",
  },
  other: {
    id: "other",
    name: "General Applications",
    nameAr: "تطبيقات عامة ومتنوعة",
    shortLabel: "General",
    shortLabelAr: "عام",
    badgeClass: "border-[#d8d1c4] bg-[#f3efe6] text-[#526273] dark:bg-[#223347] dark:text-[#c7d3dc] dark:border-[#3d566e]",
    badgeTone: "border-[#d8d1c4] text-[#526273]",
    dotColor: "bg-[#78716c]",
    iconName: "Box",
    description: "General third-party packages or unclassified device software.",
    descriptionAr: "حزم الطرف الثالث العامة أو البرمجيات غير المصنفة مسبقاً.",
  },
};

export const ALL_CATEGORY_IDS: AppCategoryId[] = [
  "google",
  "system",
  "oem",
  "carrier",
  "telemetry",
  "social",
  "media",
  "productivity",
  "browser",
  "utilities",
  "games",
  "other",
];

// Heuristic pattern recognizers
const TELEMETRY_PATTERNS = [
  /analytics/i,
  /telemetry/i,
  /diagnostic/i,
  /bugreport/i,
  /crashlytics/i,
  /logger/i,
  /tracking/i,
  /metrics/i,
  /statspush/i,
  /survey/i,
  /feedback/i,
  /com\.google\.android\.gms\.analytics/i,
  /com\.sec\.android\.diagmonagent/i,
  /com\.samsung\.android\.rubin\.app/i,
  /com\.miui\.analytics/i,
  /com\.facebook\.analytics/i,
];

const CARRIER_PATTERNS = [
  /^com\.vzw\./i,
  /^com\.att\./i,
  /^com\.tmobile\./i,
  /^com\.sprint\./i,
  /^com\.vodafone\./i,
  /^com\.orange\./i,
  /^com\.telefonica\./i,
  /^com\.bell\./i,
  /^com\.rogers\./i,
  /^com\.telus\./i,
  /^com\.qualcomm\.qti\./i,
  /^com\.sec\.vsim\.verifier/i,
  /simtoolkit/i,
  /\.stk$/i,
  /carrier/i,
  /telephony\.provider/i,
];

const GOOGLE_PATTERNS = [
  /^com\.google\.android\./i,
  /^com\.google\.ar\./i,
  /^com\.android\.vending/i,
  /^com\.google\.audio\./i,
];

const OEM_PATTERNS = [
  /^com\.samsung\./i,
  /^com\.sec\./i,
  /^com\.miui\./i,
  /^com\.xiaomi\./i,
  /^com\.huawei\./i,
  /^com\.oneplus\./i,
  /^com\.coloros\./i,
  /^com\.heytap\./i,
  /^com\.oppo\./i,
  /^com\.vivo\./i,
  /^com\.motorola\./i,
  /^com\.sonymobile\./i,
  /^com\.sonyericsson\./i,
  /^com\.asus\./i,
  /^com\.lge\./i,
  /^com\.transsion\./i,
  /^com\.infinix\./i,
  /^com\.tecno\./i,
];

const BROWSER_PATTERNS = [
  /chrome/i,
  /firefox/i,
  /browser/i,
  /webview/i,
  /maps/i,
  /navigation/i,
  /waze/i,
  /organicmaps/i,
  /duckduckgo/i,
  /opera/i,
  /brave/i,
  /^com\.android\.chrome/i,
  /^org\.mozilla\.firefox/i,
];

const SOCIAL_PATTERNS = [
  /whatsapp/i,
  /telegram/i,
  /instagram/i,
  /facebook/i,
  /katana/i,
  /twitter/i,
  /signal/i,
  /discord/i,
  /snapchat/i,
  /reddit/i,
  /tiktok/i,
  /musically/i,
  /skype/i,
  /viber/i,
  /wechat/i,
  /line/i,
  /messaging/i,
  /contacts/i,
  /dialer/i,
  /phone/i,
  /sms/i,
  /mms/i,
  /email/i,
  /gmail/i,
  /^com\.google\.android\.gm$/i,
  /^com\.google\.android\.apps\.messaging/i,
];

const MEDIA_PATTERNS = [
  /youtube/i,
  /music/i,
  /video/i,
  /player/i,
  /camera/i,
  /gallery/i,
  /photos/i,
  /soundrecorder/i,
  /spotify/i,
  /netflix/i,
  /vlc/i,
  /podcast/i,
  /radio/i,
  /audioservice/i,
  /soundalive/i,
  /^com\.google\.android\.apps\.photos/i,
  /^com\.google\.android\.apps\.youtube/i,
];

const PRODUCTIVITY_PATTERNS = [
  /calendar/i,
  /clock/i,
  /calculator/i,
  /notes/i,
  /keep/i,
  /docs/i,
  /sheets/i,
  /slides/i,
  /drive/i,
  /office/i,
  /onedrive/i,
  /dropbox/i,
  /notion/i,
  /evernote/i,
  /tasks/i,
  /^com\.google\.android\.calendar/i,
  /^com\.google\.android\.keep/i,
  /^com\.google\.android\.apps\.docs/i,
];

const GAMES_PATTERNS = [
  /game/i,
  /gaming/i,
  /play\.games/i,
  /store/i,
  /appstore/i,
  /fdroid/i,
  /aurora\.store/i,
  /samsungapps/i,
  /epicgames/i,
  /steam/i,
];

const UTILITIES_PATTERNS = [
  /keyboard/i,
  /inputmethod/i,
  /ime/i,
  /latin/i,
  /swiftkey/i,
  /files/i,
  /filemanager/i,
  /documentsui/i,
  /backup/i,
  /restore/i,
  /clipboard/i,
  /flashlight/i,
  /compass/i,
  /weather/i,
  /packageinstaller/i,
  /nbu\.files/i,
];

const SYSTEM_PATTERNS = [
  /^android$/i,
  /^com\.android\.systemui/i,
  /^com\.android\.settings/i,
  /^com\.android\.providers\./i,
  /^com\.android\.server\./i,
  /^com\.android\.bluetooth/i,
  /^com\.android\.nfc/i,
  /^com\.android\.internal/i,
  /^com\.android\.keyguard/i,
  /^com\.android\.shell/i,
  /^com\.android\.externalstorage/i,
  /^com\.android\.networkstack/i,
  /^com\.android\.permissioncontroller/i,
  /^com\.android\.se/i,
  /^com\.android\.carrierdefaultapp/i,
  /^com\.android\.certinstaller/i,
];

/**
 * Accurately classifies an Android package into a cohesive category
 * using package ID, UAD upstream catalog metadata, and keyword semantics.
 */
export function classifyPackage(
  id: string,
  meta?: {
    list?: string;
    labels?: string[];
    description?: string;
    removal?: string;
  },
): AppCategoryInfo {
  const normId = id.toLowerCase();
  const list = (meta?.list || "").toLowerCase();
  const labels = (meta?.labels || []).map((l) => l.toLowerCase());
  const desc = (meta?.description || "").toLowerCase();

  // 1. Check explicit Telemetry / Tracking indicators
  if (
    labels.some((l) => /telemetry|tracking|analytics|diagnostic|metrics/.test(l)) ||
    TELEMETRY_PATTERNS.some((p) => p.test(normId)) ||
    /telemetry|tracking|analytics|diagnostic data|crash report/.test(desc)
  ) {
    return APP_CATEGORIES.telemetry;
  }

  // 2. Carrier checks
  if (
    list === "carrier" ||
    labels.some((l) => /carrier|telecom|sim/.test(l)) ||
    CARRIER_PATTERNS.some((p) => p.test(normId)) ||
    /carrier|telecom|sim toolkit/.test(desc)
  ) {
    return APP_CATEGORIES.carrier;
  }

  // 3. Social & Communication checks (high priority before Google/OEM)
  if (
    SOCIAL_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /messaging|sms|contacts|dialer|social|call/.test(l))
  ) {
    return APP_CATEGORIES.social;
  }

  // 4. Media & Entertainment checks
  if (
    MEDIA_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /music|video|gallery|camera|audio|podcast/.test(l))
  ) {
    return APP_CATEGORIES.media;
  }

  // 5. Browser & Navigation checks
  if (
    BROWSER_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /browser|maps|navigation|gps/.test(l))
  ) {
    return APP_CATEGORIES.browser;
  }

  // 6. Productivity & Office
  if (
    PRODUCTIVITY_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /calendar|clock|calculator|notes|cloud|documents|office/.test(l))
  ) {
    return APP_CATEGORIES.productivity;
  }

  // 7. Games & App Stores
  if (
    GAMES_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /game|gaming|store|appstore/.test(l))
  ) {
    return APP_CATEGORIES.games;
  }

  // 8. Tools & Utilities
  if (
    UTILITIES_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /keyboard|ime|file manager|utility|tools|backup/.test(l))
  ) {
    return APP_CATEGORIES.utilities;
  }

  // 9. Core System & AOSP
  if (
    list === "aosp" ||
    SYSTEM_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /aosp|system|framework|core/.test(l))
  ) {
    return APP_CATEGORIES.system;
  }

  // 10. Google Services
  if (
    list === "google" ||
    GOOGLE_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /google|gms|play/.test(l))
  ) {
    return APP_CATEGORIES.google;
  }

  // 11. OEM & Vendor
  if (
    ["samsung", "xiaomi", "huawei", "oem", "motorola", "oneplus", "sony", "asus", "oppo", "vivo"].includes(list) ||
    OEM_PATTERNS.some((p) => p.test(normId)) ||
    labels.some((l) => /oem|vendor|samsung|xiaomi|miui|oneui/.test(l))
  ) {
    return APP_CATEGORIES.oem;
  }

  // 12. Fallback
  return APP_CATEGORIES.other;
}

/**
 * Creates unified CategorizedPackage items joining raw inventory,
 * optional UAD catalog, and enabled/disabled/uninstalled status.
 */
export function buildCategorizedInventory(
  packageIds: string[],
  catalog: CommunityPackage[],
  disabledPackageIds: string[] | Set<string>,
  uninstalledPackageIds?: string[] | Set<string>,
): CategorizedPackage[] {
  const disabledSet = disabledPackageIds instanceof Set ? disabledPackageIds : new Set(disabledPackageIds);
  const uninstalledSet = uninstalledPackageIds instanceof Set ? uninstalledPackageIds : new Set(uninstalledPackageIds || []);
  const catalogMap = new Map(catalog.map((item) => [item.id, item]));

  return packageIds.map((id) => {
    const context = catalogMap.get(id);
    const category = classifyPackage(id, context);

    let status: PackageStatus = "enabled";
    let rawState: PackageRawState = "enabled";

    if (uninstalledSet.has(id)) {
      status = "uninstalled";
      rawState = "not installed";
    } else if (disabledSet.has(id)) {
      status = "disabled";
      rawState = "disabled-user";
    }

    return {
      id,
      category,
      status,
      rawState,
      hasCommunityContext: Boolean(context),
      list: context?.list || (category.id === "oem" ? "OEM" : category.id === "google" ? "Google" : category.id === "system" ? "AOSP" : "Installed"),
      description: context?.description || (category.description),
      removal: (context?.removal as RemovalLevel) || "Unclassified",
      dependencies: context?.dependencies || [],
      neededBy: context?.neededBy || [],
      labels: context?.labels || [category.shortLabel],
    };
  });
}

export type SortCriterion = "category" | "id" | "status" | "removal";
export type SortOrder = "asc" | "desc";

/**
 * Sorts categorized packages by category, id, status, or removal risk.
 */
export function sortCategorizedPackages(
  items: CategorizedPackage[],
  sortBy: SortCriterion,
  order: SortOrder = "asc",
): CategorizedPackage[] {
  const removalRank: Record<string, number> = {
    Recommended: 1,
    Advanced: 2,
    Expert: 3,
    Unsafe: 4,
    Unclassified: 5,
  };

  const statusRank: Record<PackageStatus, number> = {
    enabled: 1,
    disabled: 2,
    uninstalled: 3,
  };

  return [...items].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "category":
        comparison = a.category.name.localeCompare(b.category.name);
        if (comparison === 0) comparison = a.id.localeCompare(b.id);
        break;
      case "status":
        comparison = (statusRank[a.status] || 9) - (statusRank[b.status] || 9);
        if (comparison === 0) comparison = a.category.name.localeCompare(b.category.name);
        if (comparison === 0) comparison = a.id.localeCompare(b.id);
        break;
      case "removal":
        comparison = (removalRank[a.removal] || 9) - (removalRank[b.removal] || 9);
        if (comparison === 0) comparison = a.category.name.localeCompare(b.category.name);
        if (comparison === 0) comparison = a.id.localeCompare(b.id);
        break;
      case "id":
      default:
        comparison = a.id.localeCompare(b.id);
        break;
    }

    return order === "desc" ? -comparison : comparison;
  });
}

export interface CategorySummaryStats {
  total: number;
  enabled: number;
  disabled: number;
  uninstalled: number;
  recommended: number;
  categories: Array<{
    category: AppCategoryInfo;
    count: number;
    enabledCount: number;
    disabledCount: number;
    uninstalledCount: number;
    recommendedCount: number;
  }>;
  counts: Record<AppCategoryId, number>;
  byCategory: Record<AppCategoryId, {
    category: AppCategoryInfo;
    count: number;
    enabledCount: number;
    disabledCount: number;
    uninstalledCount: number;
    recommendedCount: number;
  }>;
}

/**
 * Computes category distribution and enabled/disabled/uninstalled counts across packages.
 */
export function calculateCategoryStats(packages: CategorizedPackage[]): CategorySummaryStats {
  const map = new Map<AppCategoryId, {
    category: AppCategoryInfo;
    count: number;
    enabledCount: number;
    disabledCount: number;
    uninstalledCount: number;
    recommendedCount: number;
  }>();

  ALL_CATEGORY_IDS.forEach((catId) => {
    map.set(catId, {
      category: APP_CATEGORIES[catId],
      count: 0,
      enabledCount: 0,
      disabledCount: 0,
      uninstalledCount: 0,
      recommendedCount: 0,
    });
  });

  let totalEnabled = 0;
  let totalDisabled = 0;
  let totalUninstalled = 0;
  let totalRecommended = 0;

  packages.forEach((pkg) => {
    const entry = map.get(pkg.category.id) || {
      category: pkg.category,
      count: 0,
      enabledCount: 0,
      disabledCount: 0,
      uninstalledCount: 0,
      recommendedCount: 0,
    };

    entry.count += 1;
    if (pkg.status === "uninstalled") {
      entry.uninstalledCount = (entry.uninstalledCount || 0) + 1;
      totalUninstalled += 1;
    } else if (pkg.status === "disabled") {
      entry.disabledCount += 1;
      totalDisabled += 1;
    } else {
      entry.enabledCount += 1;
      totalEnabled += 1;
    }

    if (pkg.removal === "Recommended") {
      entry.recommendedCount += 1;
      totalRecommended += 1;
    }

    map.set(pkg.category.id, entry);
  });

  const categories = Array.from(map.values())
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const counts = {} as Record<AppCategoryId, number>;
  const byCategory = {} as CategorySummaryStats["byCategory"];
  ALL_CATEGORY_IDS.forEach((catId) => {
    const entry = map.get(catId)!;
    counts[catId] = entry.count;
    byCategory[catId] = entry;
  });

  return {
    total: packages.length,
    enabled: totalEnabled,
    disabled: totalDisabled,
    uninstalled: totalUninstalled,
    recommended: totalRecommended,
    categories,
    counts,
    byCategory,
  };
}
