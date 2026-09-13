/**
 * De-Google catalog definitions, candidates, and privacy-preserving alternatives.
 */

export type DeGoogleLevel = "essential" | "low" | "medium" | "high" | "total";

export type AlternativeIcon =
  | "mail"
  | "map"
  | "image"
  | "cloud"
  | "video"
  | "store"
  | "notes"
  | "calendar"
  | "contacts"
  | "message"
  | "music"
  | "files"
  | "search";

export interface DeGoogleAlternative {
  name: string;
  url: string;
  source: "F-Droid" | "Project";
  icon: AlternativeIcon;
  minAndroid?: number;
}

export interface DeGoogleCandidate {
  id: string;
  name: string;
  group: string;
  level: DeGoogleLevel;
  action: "disable" | "review";
  warning?: string;
  profileGuard?: boolean;
  alternatives?: DeGoogleAlternative[];
}

export interface OemProfile {
  id: string;
  name: string;
  label: string;
  labelAr: string;
  notice: string;
  noticeAr: string;
  guardPackages: string[];
  notes: string;
}

export const DEGOOGLE_LEVELS: Array<{ id: DeGoogleLevel }> = [
  { id: "essential" },
  { id: "low" },
  { id: "medium" },
  { id: "high" },
  { id: "total" },
];

export const OEM_PROFILES: OemProfile[] = [
  {
    id: "generic",
    name: "Generic AOSP / Standard",
    label: "Generic AOSP / Standard",
    labelAr: "نظام أندرويد القياسي AOSP",
    notice: "Standard guard rails for AOSP and unmodified OEM builds.",
    noticeAr: "حواجز حماية قياسية لبيئات أندرويد الخام والأجهزة غير المخصصة.",
    guardPackages: ["android", "com.android.systemui"],
    notes: "Default guard profile for stock Android and unlisted OEMs.",
  },
  {
    id: "samsung",
    name: "Samsung One UI",
    label: "Samsung One UI / Knox",
    labelAr: "سامسونج One UI / نوكس",
    notice: "Guards critical Samsung Knox security container and system launcher.",
    noticeAr: "يحمي حاوية أمان سامسونج نوكس ومشغل النظام الأساسي لمنع التوقف.",
    guardPackages: [
      "com.sec.android.app.launcher",
      "com.samsung.android.knox.containercore",
      "com.samsung.android.provider.filterprovider",
    ],
    notes: "Guards Knox security container and OneUI system shell components.",
  },
  {
    id: "xiaomi",
    name: "Xiaomi MIUI / HyperOS",
    label: "Xiaomi MIUI / HyperOS",
    labelAr: "شاومي MIUI / HyperOS",
    notice: "Guards Xiaomi HyperOS security daemon and Home Launcher.",
    noticeAr: "يحمي خدمات حماية شاومي ومشغل الشاشة الرئيسية لتجنب الشاشة السوداء.",
    guardPackages: [
      "com.miui.home",
      "com.miui.securityadd",
      "com.xiaomi.finddevice",
    ],
    notes: "Guards HyperOS security center and primary launcher.",
  },
  {
    id: "google",
    name: "Google Pixel",
    label: "Google Pixel Experience",
    labelAr: "تجربة جوجل بيكسل",
    notice: "Pixel hardware profile. Core components remain in manual review.",
    noticeAr: "ملف تعريف أجهزة بيكسل. المكونات الأساسية تظل للمراجعة اليدوية.",
    guardPackages: [
      "com.google.android.apps.nexuslauncher",
      "com.google.android.setupwizard",
    ],
    notes: "Pixel device profile. Core system apps should remain on review mode.",
  },
];

export const DEGOOGLE_CANDIDATES: DeGoogleCandidate[] = [
  // Low level: non-essential media & content
  {
    id: "com.google.android.youtube",
    name: "YouTube",
    group: "Media",
    level: "low",
    action: "disable",
    alternatives: [
      { name: "NewPipe", url: "https://newpipe.net", source: "F-Droid", icon: "video", minAndroid: 8 },
      { name: "LibreTube", url: "https://libre-tube.github.io", source: "F-Droid", icon: "video", minAndroid: 9 },
    ],
  },
  {
    id: "com.google.android.videos",
    name: "Google TV / Movies",
    group: "Media",
    level: "low",
    action: "disable",
    alternatives: [
      { name: "VLC for Android", url: "https://www.videolan.org/vlc/download-android.html", source: "F-Droid", icon: "video", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.apps.books",
    name: "Google Play Books",
    group: "Media",
    level: "low",
    action: "disable",
    alternatives: [
      { name: "Librera Reader", url: "https://f-droid.org/packages/com.foobnix.pro.pdf.reader/", source: "F-Droid", icon: "notes", minAndroid: 6 },
    ],
  },
  {
    id: "com.google.android.apps.magazines",
    name: "Google News",
    group: "News",
    level: "low",
    action: "disable",
    alternatives: [
      { name: "Feeder", url: "https://f-droid.org/packages/com.nononsenseapps.feeder/", source: "F-Droid", icon: "notes", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.music",
    name: "Google Play Music",
    group: "Media",
    level: "low",
    action: "disable",
    alternatives: [
      { name: "Auxio Music", url: "https://f-droid.org/packages/org.oxycblt.auxio/", source: "F-Droid", icon: "music", minAndroid: 7 },
    ],
  },

  // Medium level: user productivity & replaceable apps
  {
    id: "com.google.android.gm",
    name: "Gmail",
    group: "Communication",
    level: "medium",
    action: "disable",
    alternatives: [
      { name: "K-9 Mail (Thunderbird)", url: "https://k9mail.app", source: "F-Droid", icon: "mail", minAndroid: 8 },
      { name: "FairEmail", url: "https://fairemail.email", source: "Project", icon: "mail", minAndroid: 8 },
    ],
  },
  {
    id: "com.google.android.apps.maps",
    name: "Google Maps",
    group: "Navigation",
    level: "medium",
    action: "disable",
    alternatives: [
      { name: "Organic Maps", url: "https://organicmaps.app", source: "F-Droid", icon: "map", minAndroid: 8 },
      { name: "OsmAnd~", url: "https://f-droid.org/packages/net.osmand.plus/", source: "F-Droid", icon: "map", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.apps.photos",
    name: "Google Photos",
    group: "Media",
    level: "medium",
    action: "disable",
    alternatives: [
      { name: "Aves Gallery", url: "https://f-droid.org/packages/deckers.thibault.aves/", source: "F-Droid", icon: "image", minAndroid: 8 },
      { name: "Immich", url: "https://immich.app", source: "Project", icon: "cloud", minAndroid: 9 },
    ],
  },
  {
    id: "com.google.android.apps.docs",
    name: "Google Drive",
    group: "Productivity",
    level: "medium",
    action: "disable",
    alternatives: [
      { name: "Nextcloud", url: "https://nextcloud.com", source: "F-Droid", icon: "cloud", minAndroid: 8 },
      { name: "Syncthing", url: "https://syncthing.net", source: "F-Droid", icon: "files", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.apps.tachyon",
    name: "Google Meet",
    group: "Communication",
    level: "medium",
    action: "disable",
    alternatives: [
      { name: "Jitsi Meet", url: "https://jitsi.org", source: "F-Droid", icon: "video", minAndroid: 8 },
      { name: "Signal", url: "https://signal.org", source: "Project", icon: "message", minAndroid: 8 },
    ],
  },

  // High level: system-adjacent services
  {
    id: "com.google.android.googlequicksearchbox",
    name: "Google Search & Assistant",
    group: "Search",
    level: "high",
    action: "review",
    warning: "Disabling will remove home screen search widget and voice trigger.",
    alternatives: [
      { name: "DuckDuckGo Browser", url: "https://duckduckgo.com", source: "Project", icon: "search", minAndroid: 8 },
      { name: "Fennec F-Droid", url: "https://f-droid.org/packages/org.mozilla.fennec_fdroid/", source: "F-Droid", icon: "search", minAndroid: 8 },
    ],
  },
  {
    id: "com.google.android.apps.messaging",
    name: "Google Messages",
    group: "Communication",
    level: "high",
    action: "review",
    warning: "Ensure another SMS default app (e.g. Simple SMS Messenger) is active before disabling.",
    alternatives: [
      { name: "QKSMS", url: "https://f-droid.org/packages/com.moez.QKSMS/", source: "F-Droid", icon: "message", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.dialer",
    name: "Google Phone",
    group: "Communication",
    level: "high",
    action: "review",
    warning: "Ensure an alternative telephony dialer is installed to receive incoming calls.",
    alternatives: [
      { name: "Koler", url: "https://f-droid.org/packages/com.chooloo.www.koler/", source: "F-Droid", icon: "contacts", minAndroid: 8 },
    ],
  },

  // Total level: core components (review only)
  {
    id: "com.android.vending",
    name: "Google Play Store",
    group: "Store",
    level: "total",
    action: "review",
    warning: "Play Store removal requires an alternative package manager like Aurora Store or F-Droid.",
    alternatives: [
      { name: "Aurora Store", url: "https://auroraoss.com", source: "F-Droid", icon: "store", minAndroid: 7 },
      { name: "F-Droid", url: "https://f-droid.org", source: "Project", icon: "store", minAndroid: 7 },
    ],
  },
  {
    id: "com.google.android.gms",
    name: "Google Play Services",
    group: "Core Runtime",
    level: "total",
    action: "review",
    warning: "Core push notifications, SafetyNet, and location API will cease. microG is needed for apps depending on GMS.",
    alternatives: [
      { name: "microG Project", url: "https://microg.org", source: "Project", icon: "cloud", minAndroid: 8 },
    ],
  },
  {
    id: "com.google.android.gsf",
    name: "Google Services Framework",
    group: "Core Runtime",
    level: "total",
    action: "review",
    warning: "System framework component.",
  },
];

const LEVEL_RANK: Record<DeGoogleLevel, number> = {
  essential: 0,
  low: 1,
  medium: 2,
  high: 3,
  total: 4,
};

export function detectOemProfile(manufacturer?: string): OemProfile {
  const norm = (manufacturer || "").toLowerCase();
  if (norm.includes("samsung")) return OEM_PROFILES[1];
  if (norm.includes("xiaomi") || norm.includes("redmi") || norm.includes("poco")) return OEM_PROFILES[2];
  if (norm.includes("google")) return OEM_PROFILES[3];
  return OEM_PROFILES[0];
}

export function getOemProfile(id: string): OemProfile {
  return OEM_PROFILES.find((p) => p.id === id) || OEM_PROFILES[0];
}

export function deGoogleCandidatesFor(
  level: DeGoogleLevel,
  packages: string[],
  profile: OemProfile
): DeGoogleCandidate[] {
  const targetRank = LEVEL_RANK[level];
  const pkgSet = new Set(packages);
  const guardSet = new Set(profile.guardPackages);

  return DEGOOGLE_CANDIDATES.filter((candidate) => {
    const isGuarded = guardSet.has(candidate.id);
    if (!pkgSet.has(candidate.id)) return false;
    const itemRank = LEVEL_RANK[candidate.level];
    if (itemRank > targetRank) return false;
    if (isGuarded) {
      candidate.profileGuard = true;
    }
    return true;
  });
}

export function getAlternativeMinimumAndroid(alternative: { minAndroid?: number }): number | undefined {
  return alternative.minAndroid;
}
