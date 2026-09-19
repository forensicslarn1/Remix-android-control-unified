export type DebloatTier = 'safe' | 'telemetry' | 'advanced';
export type RecommendedAction = 'uninstall' | 'disable';

export interface DebloatItem {
  package: string;
  name: string;
  description: string;
  tier: DebloatTier;
  recommendedAction: RecommendedAction;
}

export interface DebloatPreset {
  id: string;
  name: string;
  manufacturer: string;
  description: string;
  items: DebloatItem[];
}

export const GLOBAL_PROTECTED_PACKAGES: string[] = [
  'com.samsung.android.honeyboard',
  'com.google.android.inputmethod.latin',
  'com.facemoji.lite.transsion',
  'com.touchtype.swiftkey',
  'com.android.inputmethod.latin',
  'android',
  'com.android.systemui',
  'com.android.settings',
  'com.android.phone',
];

export const SAMSUNG_PRESET: DebloatPreset = {
  id: 'samsung_unified',
  name: 'Samsung One UI Debloat Suite',
  manufacturer: 'samsung',
  description: 'تنظيف شامل لواجهات One UI مصنف حسب درجة الأمان والخصوصية',
  items: [
    {
      package: 'com.samsung.android.bixby.agent',
      name: 'Bixby Voice / Agent',
      description: 'المساعد الصوتي Bixby ومحرك الاستجابة',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.bixbyvision.framework',
      name: 'Bixby Vision Framework',
      description: 'ميزة التعرف البصري داخل الكاميرا والاستوديو',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.app.spage',
      name: 'Samsung Free / Bixby Home',
      description: 'شاشة الأخبار والمحتوى الترويجي أقصى يسار الواجهة',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.arzone',
      name: 'AR Zone',
      description: 'تطبيقات الواقع المعزز وملصقات الكاميرا',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.game.gamehome',
      name: 'Gaming Hub / Game Launcher',
      description: 'مركز تشغيل الألعاب والإعلانات المرافقة له',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.app.tips',
      name: 'Samsung Tips',
      description: 'إشعارات النصائح واستعراض مزايا الجهاز',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.microsoft.skydrive',
      name: 'Microsoft OneDrive',
      description: 'خدمة التخزين السحابي من مايكروسوفت المدمجة في ملفاتي',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.facebook.services',
      name: 'Facebook Services',
      description: 'خدمات فيسبوك الخفية المدمجة بالنظام',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.google.android.videos',
      name: 'Google TV',
      description: 'تطبيق الأفلام والمسلسلات التابع لـ Google',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.samsung.android.rubin.app',
      name: 'Customization Service (Rubin)',
      description: 'محرك تحليل عادات المستخدم وتتبع الموقع للإعلانات الموجهة',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.samsung.android.game.gos',
      name: 'Game Optimizing Service (GOS)',
      description: 'خدمة تقييد أداء المعالج والحرارة، تستهلك طاقة بالمراقبة المستمرة',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.samsung.android.beaconmanager',
      name: 'SmartThings Beacon Manager',
      description: 'المسح الدائم لشبكات البلوتوث منخفض الطاقة BLE للبحث عن أجهزة مجاورة',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.facebook.appmanager',
      name: 'Facebook App Manager',
      description: 'مزامنة وتتبع تشغيل تطبيقات شركاء ميتا',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.facebook.system',
      name: 'Facebook App Installer',
      description: 'تثبيت تحديثات خدمات ميتا بصمت دون الرجوع للمتجر',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.google.android.feedback',
      name: 'Google Feedback Core',
      description: 'إرسال تقارير الأخطاء وسجلات التشغيل إلى خوادم Google',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.sec.android.app.samsungapps',
      name: 'Galaxy Store',
      description: 'متجر تطبيقات سامسونج (تعطيله يمنع تحديث تطبيقات الكاميرا والاستوديو)',
      tier: 'advanced',
      recommendedAction: 'disable',
    },
    {
      package: 'com.android.vending',
      name: 'Google Play Store',
      description: 'متجر Google Play الرسمي (يتطلب وجود متجر بديل مثبت مسبقاً)',
      tier: 'advanced',
      recommendedAction: 'disable',
    },
  ],
};

export const TRANSSION_PRESET: DebloatPreset = {
  id: 'transsion_unified',
  name: 'Transsion HiOS / XOS Debloat',
  manufacturer: 'transsion',
  description: 'تطهير خدمات Infinix و Tecno مع حماية لوحة المفاتيح',
  items: [
    {
      package: 'com.transsnet.store',
      name: 'PalmStore',
      description: 'متجر التطبيقات المدمج المليء بالإعلانات',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.talpa.hibrowser',
      name: 'Hi Browser',
      description: 'المتصفح الافتراضي المحمّل بالإشعارات الترويجية',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'tech.palm.find',
      name: 'Aha Games',
      description: 'مركز الألعاب الترويجي والتثبيت الصامت',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.transsion.folax',
      name: 'Folax Voice Assistant',
      description: 'المساعد الصوتي لأجهزة Transsion',
      tier: 'safe',
      recommendedAction: 'uninstall',
    },
    {
      package: 'com.transsion.statisticalsales',
      name: 'Transsion Sales Statistics',
      description: 'تتبع مبيعات الأجهزة وإرسال القياسات عن بعد',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.transsion.personalizedService.xos',
      name: 'Personalized Service (XOS)',
      description: 'محرك الإعلانات وتخصيص تجربة المستخدم',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.idea.questionnaire',
      name: 'Feedback Questionnaire',
      description: 'أداة الاستبيانات وجمع تقارير الاستخدام',
      tier: 'telemetry',
      recommendedAction: 'disable',
    },
    {
      package: 'com.transsion.phonemaster',
      name: 'Phone Master',
      description: 'مدير الصيانة والأذونات (قد يرتبط ببعض ضوابط البطارية في الواجهات القديمة)',
      tier: 'advanced',
      recommendedAction: 'disable',
    },
  ],
};

export const ALL_PRESETS: DebloatPreset[] = [SAMSUNG_PRESET, TRANSSION_PRESET];

export function getPresetForManufacturer(manufacturer: string): DebloatPreset | undefined {
  const norm = manufacturer.toLowerCase();
  if (norm.includes('samsung')) return SAMSUNG_PRESET;
  if (norm.includes('infinix') || norm.includes('tecno') || norm.includes('itel') || norm.includes('transsion')) {
    return TRANSSION_PRESET;
  }
  return undefined;
}

export function filterItemsByTier(items: DebloatItem[], tier: DebloatTier): DebloatItem[] {
  return items.filter((item) => item.tier === tier);
}

export function isPackageProtected(packageName: string): boolean {
  return GLOBAL_PROTECTED_PACKAGES.includes(packageName.trim());
}
