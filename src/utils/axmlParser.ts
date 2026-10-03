/**
 * Client-Side Android Binary XML (AXML) Parser
 * 
 * Decodes compiled AndroidManifest.xml from raw APK buffers directly
 * in the browser without any heavy Java or server dependencies.
 */

export interface ComponentEntry {
  name: string;
  type: "activity" | "service" | "receiver" | "provider";
  exported: boolean;
  permission?: string;
  actions: string[];
  categories: string[];
}

export interface ManifestPermission {
  name: string;
  isDangerous: boolean;
  category: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface ParsedAndroidManifest {
  packageName: string;
  versionCode: number | string;
  versionName: string;
  minSdkVersion: number | string;
  targetSdkVersion: number | string;
  application: {
    label?: string;
    debuggable: boolean;
    allowBackup: boolean;
    usesCleartextTraffic: boolean;
    networkSecurityConfig?: string;
  };
  permissions: ManifestPermission[];
  activities: ComponentEntry[];
  services: ComponentEntry[];
  receivers: ComponentEntry[];
  providers: ComponentEntry[];
  exportedComponents: ComponentEntry[];
  rawXmlSummary: string;
}

// Android AXML Chunk Constants
const RES_XML_TYPE = 0x00080003;
const RES_STRING_POOL_TYPE = 0x001c0001;
const RES_XML_RESOURCE_MAP_TYPE = 0x00080180;
const RES_XML_START_NAMESPACE_TYPE = 0x00100100;
const RES_XML_END_NAMESPACE_TYPE = 0x00100101;
const RES_XML_START_ELEMENT_TYPE = 0x00100102;
const RES_XML_END_ELEMENT_TYPE = 0x00100103;
const RES_XML_CDATA_TYPE = 0x00100104;

// Attribute types
const TYPE_STRING = 3;
const TYPE_INT_DEC = 16;
const TYPE_INT_HEX = 17;
const TYPE_INT_BOOLEAN = 18;

// Dangerous & Sensitive permissions database
const DANGEROUS_PERMISSIONS: Record<string, { category: string; en: string; ar: string }> = {
  "android.permission.READ_SMS": { category: "SMS", en: "Read SMS messages and authentication OTPs", ar: "قراءة الرسائل النصية ورموز التحقق OTP" },
  "android.permission.RECEIVE_SMS": { category: "SMS", en: "Intercept and inspect incoming SMS texts", ar: "اعتراض وقراءة الرسائل النصية الواردة" },
  "android.permission.SEND_SMS": { category: "SMS", en: "Send outbound SMS messages (may incur charges)", ar: "إرسال رسائل نصية (قد يترتب عليه رسوم)" },
  "android.permission.READ_CONTACTS": { category: "Contacts", en: "Read personal address book and contact list", ar: "قراءة دليل الهاتف وقائمة جهات الاتصال" },
  "android.permission.WRITE_CONTACTS": { category: "Contacts", en: "Modify, add, or delete personal contacts", ar: "تعديل أو إضافة أو حذف جهات الاتصال" },
  "android.permission.ACCESS_FINE_LOCATION": { category: "Location", en: "Precise GPS geographical coordinates tracking", ar: "تتبع الموقع الجغرافي الدقيق عبر GPS" },
  "android.permission.ACCESS_COARSE_LOCATION": { category: "Location", en: "Approximate cellular / Wi-Fi network location", ar: "تحديد الموقع التقريبي عبر الشبكة و Wi-Fi" },
  "android.permission.ACCESS_BACKGROUND_LOCATION": { category: "Location", en: "Continuous location tracking when app is closed", ar: "تتبع الموقع في الخلفية حتى عند إغلاق التطبيق" },
  "android.permission.CAMERA": { category: "Camera", en: "Capture live camera photos and video streams", ar: "التقاط الصور ومقاطع الفيديو عبر الكاميرا" },
  "android.permission.RECORD_AUDIO": { category: "Microphone", en: "Continuous microphone audio recording", ar: "تسجيل الصوت والمحادثات عبر الميكروفون" },
  "android.permission.READ_CALL_LOG": { category: "Call Log", en: "Inspect private incoming and outgoing call logs", ar: "الاطلاع على سجل المكالمات الصادرة والواردة" },
  "android.permission.WRITE_CALL_LOG": { category: "Call Log", en: "Alter or wipe phone call history", ar: "تعديل أو مسح سجل المكالمات الهاتفية" },
  "android.permission.READ_PHONE_STATE": { category: "Phone", en: "Access IMEI, IMSI, cellular carrier, and SIM identity", ar: "الوصول إلى هوية الجهاز IMEI والـ SIM وحالة الشبكة" },
  "android.permission.READ_EXTERNAL_STORAGE": { category: "Storage", en: "Read files, documents, and media on device storage", ar: "قراءة الملفات والمستندات في مساحة التخزين" },
  "android.permission.WRITE_EXTERNAL_STORAGE": { category: "Storage", en: "Write and delete files on shared device storage", ar: "تعديل وكتابة وحذف الملفات على الذاكرة المشتركة" },
  "android.permission.MANAGE_EXTERNAL_STORAGE": { category: "Storage", en: "Unrestricted, device-wide storage filesystem access", ar: "وصول شامل وغير مقيد لجميع ملفات النظام المشتركة" },
  "android.permission.SYSTEM_ALERT_WINDOW": { category: "Overlay", en: "Display overlay windows on top of any other app", ar: "العرض فوق التطبيقات الأخرى (نافذة عائمة)" },
  "android.permission.PACKAGE_USAGE_STATS": { category: "Analytics", en: "Monitor usage duration and launch frequency of other apps", ar: "مراقبة نشاط واستخدام التطبيقات الأخرى" },
  "android.permission.BIND_ACCESSIBILITY_SERVICE": { category: "Accessibility", en: "Read full screen contents and simulate user touch input", ar: "خدمة إمكانية الوصول: قراءة محتوى الشاشة ومحاكاة النقر" },
  "android.permission.REQUEST_INSTALL_PACKAGES": { category: "Install", en: "Silently request downloading and installing other APKs", ar: "طلب تثبيت حزم وتطبيقات APK أخرى" },
  "android.permission.USE_BIOMETRIC": { category: "Biometrics", en: "Access biometric authentication hardware", ar: "استخدام أجهزة المصادقة البيومترية" },
  "android.permission.BLUETOOTH_CONNECT": { category: "Bluetooth", en: "Connect and transmit data to nearby Bluetooth devices", ar: "الاتصال بأجهزة البلوتوث المجاورة ونقل البيانات" },
  "android.permission.BLUETOOTH_SCAN": { category: "Bluetooth", en: "Scan for nearby Bluetooth beacons for physical tracking", ar: "مسح أجهزة البلوتوث المحيطة للتتبع الجغرافي" },
};

/**
 * Reads a 32-bit unsigned integer from a DataView at offset (Little-Endian)
 */
function getUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/**
 * Reads a 16-bit unsigned integer from a DataView at offset (Little-Endian)
 */
function getUint16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

/**
 * Parses the String Pool chunk from AXML binary data
 */
function parseStringPool(view: DataView, offset: number): { strings: string[]; endOffset: number } {
  const chunkSize = getUint32LE(view, offset + 4);
  const stringCount = getUint32LE(view, offset + 8);
  const flags = getUint32LE(view, offset + 16);
  const stringsStart = getUint32LE(view, offset + 20);

  const isUtf8 = (flags & (1 << 8)) !== 0;

  // Array of string offsets relative to stringPoolBase
  const stringOffsets: number[] = [];
  for (let i = 0; i < stringCount; i++) {
    stringOffsets.push(getUint32LE(view, offset + 28 + i * 4));
  }

  const stringPoolBase = offset + stringsStart;
  const strings: string[] = [];

  for (let i = 0; i < stringCount; i++) {
    const strOffset = stringPoolBase + stringOffsets[i];
    if (strOffset >= view.byteLength) {
      strings.push("");
      continue;
    }

    try {
      if (isUtf8) {
        // UTF-8 string: length encoded as 1 or 2 bytes for chars, then 1 or 2 bytes for byte length
        let cur = strOffset;
        let u16len = view.getUint8(cur++);
        if ((u16len & 0x80) !== 0) {
          u16len = ((u16len & 0x7f) << 8) | view.getUint8(cur++);
        }
        let u8len = view.getUint8(cur++);
        if ((u8len & 0x80) !== 0) {
          u8len = ((u8len & 0x7f) << 8) | view.getUint8(cur++);
        }

        const bytes = new Uint8Array(view.buffer, view.byteOffset + cur, u8len);
        strings.push(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
      } else {
        // UTF-16 LE string: length encoded as 1 or 2 words (16-bit uint)
        let cur = strOffset;
        let u16len = getUint16LE(view, cur);
        cur += 2;
        if ((u16len & 0x8000) !== 0) {
          u16len = ((u16len & 0x7fff) << 16) | getUint16LE(view, cur);
          cur += 2;
        }

        const chars: string[] = [];
        for (let c = 0; c < u16len; c++) {
          if (cur + c * 2 + 1 < view.byteLength) {
            chars.push(String.fromCharCode(getUint16LE(view, cur + c * 2)));
          }
        }
        strings.push(chars.join(""));
      }
    } catch {
      strings.push("");
    }
  }

  return { strings, endOffset: offset + chunkSize };
}

/**
 * Fallback parser extracting strings via RegExp if AXML binary chunk table is malformed
 */
function fallbackRegexParser(rawBytes: Uint8Array): ParsedAndroidManifest {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);

  let packageName = "unknown.package";
  const pkgMatch = text.match(/package="([^"]+)"/) || text.match(/([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+)/i);
  if (pkgMatch) packageName = pkgMatch[1];

  let versionCode = "1";
  const vcMatch = text.match(/versionCode="([^"]+)"/);
  if (vcMatch) versionCode = vcMatch[1];

  let versionName = "1.0";
  const vnMatch = text.match(/versionName="([^"]+)"/);
  if (vnMatch) versionName = vnMatch[1];

  const permissions: ManifestPermission[] = [];
  const permSet = new Set<string>();
  const permRegex = /android\.permission\.([A-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = permRegex.exec(text)) !== null) {
    const full = `android.permission.${m[1]}`;
    if (!permSet.has(full)) {
      permSet.add(full);
      const info = DANGEROUS_PERMISSIONS[full];
      permissions.push({
        name: full,
        isDangerous: Boolean(info),
        category: info?.category || "Standard",
        descriptionEn: info?.en || "Standard Android application permission.",
        descriptionAr: info?.ar || "إذن قياسي لنظام أندرويد.",
      });
    }
  }

  return {
    packageName,
    versionCode,
    versionName,
    minSdkVersion: "21",
    targetSdkVersion: "33",
    application: {
      label: packageName,
      debuggable: text.includes("debuggable"),
      allowBackup: text.includes("allowBackup"),
      usesCleartextTraffic: text.includes("usesCleartextTraffic"),
    },
    permissions,
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    exportedComponents: [],
    rawXmlSummary: text.slice(0, 1000),
  };
}

/**
 * Decodes compiled Android Binary XML (AXML) into a structured manifest model
 */
export function parseAxml(buffer: ArrayBuffer | Uint8Array): ParsedAndroidManifest {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);

  // Check magic number
  if (view.byteLength < 8) {
    return fallbackRegexParser(uint8);
  }

  const magic = getUint32LE(view, 0);
  if (magic !== RES_XML_TYPE) {
    // Might be plaintext XML
    return fallbackRegexParser(uint8);
  }

  let offset = 8; // skip magic (4) and file size (4)
  let stringPool: string[] = [];

  // Intermediate state
  let packageName = "";
  let versionCode: number | string = 1;
  let versionName = "1.0";
  let minSdkVersion: number | string = "Unknown";
  let targetSdkVersion: number | string = "Unknown";

  let appLabel = "";
  let appDebuggable = false;
  let appAllowBackup = true; // default in Android is true unless explicitly set false
  let appUsesCleartextTraffic = false;
  let appNetworkSecurityConfig: string | undefined = undefined;

  const permissions: ManifestPermission[] = [];
  const permSet = new Set<string>();

  const activities: ComponentEntry[] = [];
  const services: ComponentEntry[] = [];
  const receivers: ComponentEntry[] = [];
  const providers: ComponentEntry[] = [];

  let currentElement: {
    tag: string;
    type: "activity" | "service" | "receiver" | "provider";
    name: string;
    exported: boolean;
    hasExplicitExported: boolean;
    permission?: string;
    actions: string[];
    categories: string[];
    hasIntentFilters: boolean;
  } | null = null;

  try {
    while (offset < view.byteLength) {
      if (offset + 8 > view.byteLength) break;
      const chunkType = getUint32LE(view, offset);
      const chunkSize = getUint32LE(view, offset + 4);

      if (chunkSize <= 0 || offset + chunkSize > view.byteLength) {
        break;
      }

      if (chunkType === RES_STRING_POOL_TYPE) {
        const pool = parseStringPool(view, offset);
        stringPool = pool.strings;
        offset = pool.endOffset;
        continue;
      }

      if (chunkType === RES_XML_START_ELEMENT_TYPE) {
        const nameIdx = getUint32LE(view, offset + 20);
        const tagName = stringPool[nameIdx] || "";
        const attrCount = getUint16LE(view, offset + 28);
        const attrStart = offset + 36;

        // Parse attributes
        const attributes: Record<string, { value: any; raw: string }> = {};

        for (let i = 0; i < attrCount; i++) {
          const aOffset = attrStart + i * 20;
          if (aOffset + 20 > view.byteLength) break;

          const attrNameIdx = getUint32LE(view, aOffset + 4);
          const rawValIdx = getUint32LE(view, aOffset + 8);
          const typedValType = view.getUint8(aOffset + 15);
          const typedValData = getUint32LE(view, aOffset + 16);

          const attrName = stringPool[attrNameIdx] || `attr_${attrNameIdx}`;
          let attrValue: any = stringPool[rawValIdx] || "";

          if (typedValType === TYPE_INT_BOOLEAN) {
            attrValue = typedValData !== 0;
          } else if (typedValType === TYPE_INT_DEC || typedValType === TYPE_INT_HEX) {
            attrValue = typedValData;
          } else if (typedValType === TYPE_STRING && stringPool[typedValData]) {
            attrValue = stringPool[typedValData];
          }

          attributes[attrName] = {
            value: attrValue,
            raw: String(attrValue),
          };
        }

        // 1. Root <manifest>
        if (tagName === "manifest") {
          if (attributes["package"]) packageName = attributes["package"].raw;
          if (attributes["versionCode"]) versionCode = attributes["versionCode"].value;
          if (attributes["versionName"]) versionName = attributes["versionName"].raw;
        }

        // 2. <uses-sdk>
        else if (tagName === "uses-sdk") {
          if (attributes["minSdkVersion"]) minSdkVersion = attributes["minSdkVersion"].value;
          if (attributes["targetSdkVersion"]) targetSdkVersion = attributes["targetSdkVersion"].value;
        }

        // 3. <uses-permission>
        else if (tagName === "uses-permission" || tagName === "uses-permission-sdk-23") {
          const pName = attributes["name"]?.raw;
          if (pName && !permSet.has(pName)) {
            permSet.add(pName);
            const info = DANGEROUS_PERMISSIONS[pName];
            permissions.push({
              name: pName,
              isDangerous: Boolean(info),
              category: info?.category || "Standard",
              descriptionEn: info?.en || "Standard application permission declared in manifest.",
              descriptionAr: info?.ar || "إذن قياسي مصرح به في بيان التطبيق.",
            });
          }
        }

        // 4. <application>
        else if (tagName === "application") {
          if (attributes["label"]) appLabel = attributes["label"].raw;
          if (attributes["debuggable"]) appDebuggable = Boolean(attributes["debuggable"].value);
          if (attributes["allowBackup"]) appAllowBackup = Boolean(attributes["allowBackup"].value);
          if (attributes["usesCleartextTraffic"]) appUsesCleartextTraffic = Boolean(attributes["usesCleartextTraffic"].value);
          if (attributes["networkSecurityConfig"]) appNetworkSecurityConfig = attributes["networkSecurityConfig"].raw;
        }

        // 5. Entry point components
        else if (["activity", "activity-alias", "service", "receiver", "provider"].includes(tagName)) {
          const compType: "activity" | "service" | "receiver" | "provider" =
            tagName === "activity-alias" ? "activity" : (tagName as any);

          const cName = attributes["name"]?.raw || "UnnamedComponent";
          const hasExportedAttr = "exported" in attributes;
          const exportedVal = Boolean(attributes["exported"]?.value);
          const perm = attributes["permission"]?.raw;

          currentElement = {
            tag: tagName,
            type: compType,
            name: cName,
            exported: exportedVal,
            hasExplicitExported: hasExportedAttr,
            permission: perm,
            actions: [],
            categories: [],
            hasIntentFilters: false,
          };
        }

        // 6. Child elements: <action> & <category> inside <intent-filter>
        else if (currentElement && tagName === "action") {
          if (attributes["name"]) currentElement.actions.push(attributes["name"].raw);
        } else if (currentElement && tagName === "category") {
          if (attributes["name"]) currentElement.categories.push(attributes["name"].raw);
        } else if (currentElement && tagName === "intent-filter") {
          currentElement.hasIntentFilters = true;
        }

        offset += chunkSize;
        continue;
      }

      if (chunkType === RES_XML_END_ELEMENT_TYPE) {
        const nameIdx = getUint32LE(view, offset + 20);
        const tagName = stringPool[nameIdx] || "";

        if (currentElement && (currentElement.tag === tagName || (tagName === "activity" && currentElement.tag === "activity-alias"))) {
          // If exported attribute was not explicitly declared:
          // In Android, if an intent-filter is present, default is exported = true!
          let finalExported = currentElement.exported;
          if (!currentElement.hasExplicitExported && currentElement.hasIntentFilters) {
            finalExported = true;
          }

          const entry: ComponentEntry = {
            name: currentElement.name,
            type: currentElement.type,
            exported: finalExported,
            permission: currentElement.permission,
            actions: currentElement.actions,
            categories: currentElement.categories,
          };

          if (currentElement.type === "activity") activities.push(entry);
          else if (currentElement.type === "service") services.push(entry);
          else if (currentElement.type === "receiver") receivers.push(entry);
          else if (currentElement.type === "provider") providers.push(entry);

          currentElement = null;
        }

        offset += chunkSize;
        continue;
      }

      // Skip other chunks (CDATA, namespaces, resource map)
      offset += chunkSize;
    }
  } catch (err) {
    console.warn("AXML parse ended with recovery:", err);
  }

  // Fallback to string pool extraction if critical fields were not captured
  if (!packageName && stringPool.length > 0) {
    const pkgCandidate = stringPool.find((s) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(s));
    if (pkgCandidate) packageName = pkgCandidate;
  }

  if (permissions.length === 0 && stringPool.length > 0) {
    for (const str of stringPool) {
      if (str.startsWith("android.permission.")) {
        if (!permSet.has(str)) {
          permSet.add(str);
          const info = DANGEROUS_PERMISSIONS[str];
          permissions.push({
            name: str,
            isDangerous: Boolean(info),
            category: info?.category || "Standard",
            descriptionEn: info?.en || "Standard application permission declared in manifest.",
            descriptionAr: info?.ar || "إذن قياسي مصرح به في بيان التطبيق.",
          });
        }
      }
    }
  }

  // Aggregate all exported components (attack surface)
  const allComponents = [...activities, ...services, ...receivers, ...providers];
  const exportedComponents = allComponents.filter((c) => c.exported);

  const rawXmlSummary = `Package: ${packageName || "unknown"} (v${versionName} - ${versionCode})\nMin SDK: ${minSdkVersion} | Target SDK: ${targetSdkVersion}\nExported Components: ${exportedComponents.length}\nPermissions: ${permissions.length}`;

  return {
    packageName: packageName || "unknown.package",
    versionCode,
    versionName,
    minSdkVersion,
    targetSdkVersion,
    application: {
      label: appLabel || packageName,
      debuggable: appDebuggable,
      allowBackup: appAllowBackup,
      usesCleartextTraffic: appUsesCleartextTraffic,
      networkSecurityConfig: appNetworkSecurityConfig,
    },
    permissions,
    activities,
    services,
    receivers,
    providers,
    exportedComponents,
    rawXmlSummary,
  };
}
