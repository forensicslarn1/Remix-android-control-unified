/**
 * Community Catalog for Android Debloat (UAD-ng definitions).
 */

export type RemovalLevel = "Recommended" | "Advanced" | "Expert" | "Unsafe" | "Unclassified";

export interface CommunityPackage {
  id: string;
  list?: string;
  description: string;
  removal: RemovalLevel;
  dependencies?: string[];
  neededBy?: string[];
  labels?: string[];
}

export const COMMUNITY_SOURCE =
  "https://raw.githubusercontent.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation/main/resources/assets/uad_lists.json";

const BUILTIN_PACKAGES: CommunityPackage[] = [
  {
    id: "com.facebook.katana",
    list: "Facebook",
    description: "Main Facebook application client. Safe to remove if unused.",
    removal: "Recommended",
    labels: ["Social", "Telemetry"],
  },
  {
    id: "com.facebook.orca",
    list: "Facebook",
    description: "Facebook Messenger client. Safe to remove.",
    removal: "Recommended",
    labels: ["Social"],
  },
  {
    id: "com.facebook.services",
    list: "Facebook",
    description: "Facebook background services and analytics telemetry.",
    removal: "Recommended",
    labels: ["Telemetry"],
  },
  {
    id: "com.facebook.system",
    list: "Facebook",
    description: "Preinstalled Facebook app installer daemon.",
    removal: "Recommended",
    labels: ["OEM", "Telemetry"],
  },
  {
    id: "com.facebook.appmanager",
    list: "Facebook",
    description: "Facebook silent auto-update manager.",
    removal: "Recommended",
    labels: ["OEM", "Telemetry"],
  },
  {
    id: "com.google.android.apps.tachyon",
    list: "Google",
    description: "Google Meet / Duo video calling application.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.apps.photos",
    list: "Google",
    description: "Google Photos gallery and cloud backup client.",
    removal: "Advanced",
    labels: ["Google", "Media"],
  },
  {
    id: "com.google.android.apps.maps",
    list: "Google",
    description: "Google Maps navigation and place services.",
    removal: "Advanced",
    labels: ["Google"],
  },
  {
    id: "com.google.android.gm",
    list: "Google",
    description: "Gmail client. Can be replaced with K-9 Mail or FairEmail.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.youtube",
    list: "Google",
    description: "Official YouTube video application.",
    removal: "Recommended",
    labels: ["Google", "Media"],
  },
  {
    id: "com.google.android.videos",
    list: "Google",
    description: "Google TV / Play Movies app.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.apps.books",
    list: "Google",
    description: "Google Play Books reader.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.apps.docs",
    list: "Google",
    description: "Google Drive cloud document storage client.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.music",
    list: "Google",
    description: "Legacy Google Play Music placeholder.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.apps.magazines",
    list: "Google",
    description: "Google News feed reader.",
    removal: "Recommended",
    labels: ["Google"],
  },
  {
    id: "com.google.android.feedback",
    list: "Google",
    description: "Google Feedback crash report telemetry.",
    removal: "Recommended",
    labels: ["Google", "Telemetry"],
  },
  {
    id: "com.google.android.marvin.talkback",
    list: "Google",
    description: "Android Accessibility Suite TalkBack screen reader.",
    removal: "Advanced",
    labels: ["System"],
  },
  {
    id: "com.google.android.googlequicksearchbox",
    list: "Google",
    description: "Google Search, Discover feed, and Google Assistant core.",
    removal: "Advanced",
    labels: ["Google"],
  },
  {
    id: "com.google.android.gms",
    list: "Google",
    description: "Google Play Services core runtime. Highly dependent.",
    removal: "Expert",
    labels: ["Core", "Google"],
  },
  {
    id: "com.android.vending",
    list: "Google",
    description: "Google Play Store client.",
    removal: "Expert",
    labels: ["Core", "Google"],
  },
  {
    id: "com.microsoft.appmanager",
    list: "Microsoft",
    description: "Link to Windows (Your Phone Companion) OEM integration.",
    removal: "Recommended",
    labels: ["OEM"],
  },
  {
    id: "com.samsung.android.bixby.agent",
    list: "Samsung",
    description: "Samsung Bixby voice assistant voice engine.",
    removal: "Recommended",
    labels: ["OEM"],
  },
  {
    id: "com.samsung.android.game.gamehome",
    list: "Samsung",
    description: "Samsung Gaming Hub launcher overlay.",
    removal: "Recommended",
    labels: ["OEM"],
  },
  {
    id: "com.xiaomi.midrop",
    list: "Xiaomi",
    description: "Xiaomi ShareMe file transfer client.",
    removal: "Recommended",
    labels: ["OEM"],
  },
  {
    id: "com.miui.analytics",
    list: "Xiaomi",
    description: "MIUI system usage and ad targeting telemetry.",
    removal: "Recommended",
    labels: ["OEM", "Telemetry"],
  },
];

export async function fetchCommunityCatalog(): Promise<{
  entries: CommunityPackage[];
  refreshedAt: string;
}> {
  try {
    const res = await fetch(COMMUNITY_SOURCE, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const entries: CommunityPackage[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && item.id) {
          entries.push({
            id: String(item.id),
            list: item.list || "Community",
            description: item.description || "Community categorized package.",
            removal: item.removal || "Recommended",
            dependencies: item.dependencies || [],
            neededBy: item.neededBy || [],
            labels: item.labels || [],
          });
        }
      }
    } else if (typeof data === "object" && data !== null) {
      for (const [key, val] of Object.entries(data)) {
        const item = val as any;
        entries.push({
          id: key,
          list: item?.list || "Community",
          description: item?.description || "Community categorized package.",
          removal: item?.removal || "Recommended",
          dependencies: item?.dependencies || [],
          neededBy: item?.neededBy || [],
          labels: item?.labels || [],
        });
      }
    }
    if (entries.length > 0) {
      return { entries, refreshedAt: new Date().toISOString() };
    }
  } catch {
    // Network or parse failure, fallback to built-in list
  }

  return {
    entries: BUILTIN_PACKAGES,
    refreshedAt: new Date().toISOString(),
  };
}
