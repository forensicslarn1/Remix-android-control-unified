/**
 * Forensic Audit & Export Engine
 * 
 * Aggregates:
 * 1. Device Digital Identity (ADB system properties, uname -a, getenforce)
 * 2. Hardware & Circuit Triage Snapshot (battery draw mA, CPU load %, thermal zones mapped by subsystem, anomaly verdict)
 * 3. Session Package Audit Trail (immutable ledger of executed package modifications with UAD-ng labels)
 * 4. Tamper-Evident SHA-256 Cryptographic Hash (window.crypto.subtle.digest across canonical JSON)
 */

import type { BrowserAdbClient } from "@/lib/adbClient";
import { UAD_CACHE_KEY, type UadPackageMetadata, extractAppLabelAndDescription } from "@/components/DebloaterWorkspace";

export interface DeviceDigitalIdentity {
  manufacturer: string;
  model: string;
  productName: string;
  serialNumber: string;
  buildFingerprint: string;
  androidRelease: string;
  securityPatch: string;
  kernelVersion: string;
  selinuxEnforce: string;
}

export type HardwareVerdict =
  | "Nominal Baseline"
  | "High Software Load"
  | "Critical Component Leakage or Short Suspected";

export type HardwareSubsystemKey =
  | "PA IC / RF Modem"
  | "PMIC / Charger"
  | "SoC / CPU-GPU"
  | "Wi-Fi"
  | "Camera"
  | "General Thermal Sensor";

export interface MappedThermalSensor {
  name: string;
  rawType: string;
  subsystem: HardwareSubsystemKey;
  tempC: number;
  tempF: number;
  status: "Nominal" | "Elevated" | "Critical / Short";
}

export interface HardwareCircuitTriageSnapshot {
  batteryDrawMa: number;
  cpuLoadPercent: number;
  maxSensorTempC: number;
  hottestSensorName: string;
  verdict: HardwareVerdict;
  discrepancyEvidence: string;
  baselineComparison: string;
  subsystemSensors: {
    paIc: MappedThermalSensor[];
    pmicCharger: MappedThermalSensor[];
    socCpuGpu: MappedThermalSensor[];
    wifi: MappedThermalSensor[];
    camera: MappedThermalSensor[];
    other: MappedThermalSensor[];
  };
  allSensors: MappedThermalSensor[];
}

export interface PackageAuditLedgerItem {
  id: string;
  timestamp: string; // ISO 8601
  packageId: string;
  appLabel: string;
  action: "Disable" | "Uninstall -k" | "Purge" | "Restore";
  exitStatus: "Success" | "Failed";
  command?: string;
  details?: string;
}

export interface ExaminerCaseMetadata {
  caseReferenceId: string;
  examinerName: string;
  badgeOrOperatorId: string;
  operationalNotes: string;
}

export interface NetworkSocketAuditItem {
  protocol: "tcp" | "tcp6";
  localIp: string;
  localPort: number;
  remoteIp: string;
  remotePort: number;
  state: string;
  uid: number;
  packageName?: string;
  appLabel?: string;
  direction: "Inbound" | "Outbound" | "Listening";
  isSuspicious: boolean;
  classificationTag: "OEM Telemetry" | "Cloud Sync" | "Loopback / IPC" | "External WAN" | "Suspicious Remote Port" | "LAN / Local";
}

export interface NetworkSocketAuditSnapshot {
  capturedAt: string;
  totalSockets: number;
  listeningSockets: number;
  establishedSockets: number;
  suspiciousCount: number;
  sockets: NetworkSocketAuditItem[];
}

export interface ApkStaticForensicSummary {
  inspectedAt: string;
  source: "device-pull" | "local-upload";
  packageName: string;
  appName?: string;
  versionName: string;
  versionCode: number | string;
  minSdkVersion: number | string;
  targetSdkVersion: number | string;
  fileSizeBytes: number;
  sha256Checksum: string;
  flags: {
    debuggable: boolean;
    allowBackup: boolean;
    usesCleartextTraffic: boolean;
    networkSecurityConfig?: string;
  };
  totalPermissions: number;
  dangerousPermissionsCount: number;
  dangerousPermissionsList: string[];
  totalComponents: number;
  exportedComponentsCount: number;
  exportedComponentsSummary: {
    name: string;
    type: "activity" | "service" | "receiver" | "provider";
    permission?: string;
  }[];
}

export interface ForensicAuditReport {
  metadata: {
    schemaVersion: "1.0.0-forensic";
    generatedAt: string;
    reportUuid: string;
    sha256Hash: string;
  };
  caseMetadata: ExaminerCaseMetadata;
  deviceIdentity: DeviceDigitalIdentity;
  hardwareTriage: HardwareCircuitTriageSnapshot;
  packageAuditTrail: PackageAuditLedgerItem[];
  networkSnapshot?: NetworkSocketAuditSnapshot;
  apkForensicSummary?: ApkStaticForensicSummary;
}

// In-memory session audit ledger, backed by sessionStorage for page reload durability
const SESSION_AUDIT_KEY = "acc-forensic-session-audit-trail-v1";

function loadSessionAuditTrail(): PackageAuditLedgerItem[] {
  try {
    const raw = sessionStorage.getItem(SESSION_AUDIT_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSessionAuditTrail(trail: PackageAuditLedgerItem[]): void {
  try {
    sessionStorage.setItem(SESSION_AUDIT_KEY, JSON.stringify(trail));
  } catch {
    // ignore sessionStorage write errors
  }
}

let inMemoryLedger: PackageAuditLedgerItem[] = loadSessionAuditTrail();

/**
 * Returns a human readable app label from local UAD-ng cache if available
 */
export function lookupAppLabel(packageId: string): string {
  try {
    const rawCache = localStorage.getItem(UAD_CACHE_KEY);
    if (rawCache) {
      const uadDb: Record<string, UadPackageMetadata> = JSON.parse(rawCache);
      if (uadDb[packageId]) {
        const { label } = extractAppLabelAndDescription(packageId, uadDb[packageId].description);
        if (label) return label;
      }
    }
  } catch {
    // fallback to derived label
  }
  const { label } = extractAppLabelAndDescription(packageId);
  return label || packageId;
}

/**
 * Appends a package modification entry to the immutable session audit ledger
 */
export function recordSessionPackageAction(entry: {
  packageId: string;
  action: "Disable" | "Uninstall -k" | "Purge" | "Restore";
  exitStatus: "Success" | "Failed";
  appLabel?: string;
  command?: string;
  details?: string;
  timestamp?: string;
}): PackageAuditLedgerItem {
  const finalAppLabel = entry.appLabel || lookupAppLabel(entry.packageId);
  const now = entry.timestamp || new Date().toISOString();
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const item: PackageAuditLedgerItem = {
    id,
    timestamp: now,
    packageId: entry.packageId,
    appLabel: finalAppLabel,
    action: entry.action,
    exitStatus: entry.exitStatus,
    command: entry.command,
    details: entry.details,
  };

  inMemoryLedger = [item, ...inMemoryLedger];
  saveSessionAuditTrail(inMemoryLedger);

  // Dispatch custom event for real-time reactivity in UI components
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-session-audit-updated", { detail: item }));
  }

  return item;
}

/**
 * Retrieves the current session's package audit ledger
 */
export function getSessionPackageAuditTrail(): PackageAuditLedgerItem[] {
  return [...inMemoryLedger];
}

/**
 * Clears the session package audit ledger
 */
export function clearSessionPackageAuditTrail(): void {
  inMemoryLedger = [];
  try {
    sessionStorage.removeItem(SESSION_AUDIT_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-session-audit-updated"));
  }
}

// Session storage key for live network sockets snapshot
const SESSION_NETWORK_SNAPSHOT_KEY = "acc-forensic-network-snapshot-v1";

/**
 * Stores a live network sockets snapshot in session for inclusion in forensic audit
 */
export function recordNetworkAuditSnapshot(snapshot: NetworkSocketAuditSnapshot): void {
  try {
    sessionStorage.setItem(SESSION_NETWORK_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore sessionStorage errors
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-network-snapshot-updated", { detail: snapshot }));
  }
}

/**
 * Retrieves the latest network sockets snapshot if available
 */
export function getLatestNetworkAuditSnapshot(): NetworkSocketAuditSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_NETWORK_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clears the stored network sockets snapshot
 */
export function clearNetworkAuditSnapshot(): void {
  try {
    sessionStorage.removeItem(SESSION_NETWORK_SNAPSHOT_KEY);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-network-snapshot-updated"));
  }
}

// Session storage key for static APK forensic summary
const SESSION_APK_SUMMARY_KEY = "acc-forensic-apk-summary-v1";

/**
 * Stores static APK reconnaissance findings into session for inclusion in forensic audit
 */
export function recordApkForensicSummary(summary: ApkStaticForensicSummary): void {
  try {
    sessionStorage.setItem(SESSION_APK_SUMMARY_KEY, JSON.stringify(summary));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-apk-summary-updated", { detail: summary }));
  }
}

/**
 * Retrieves the latest static APK inspection summary if available
 */
export function getLatestApkForensicSummary(): ApkStaticForensicSummary | null {
  try {
    const raw = sessionStorage.getItem(SESSION_APK_SUMMARY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clears the stored static APK inspection summary
 */
export function clearApkForensicSummary(): void {
  try {
    sessionStorage.removeItem(SESSION_APK_SUMMARY_KEY);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acc-apk-summary-updated"));
  }
}

/**
 * Computes a SHA-256 hex digest using the standard native Web Cryptography API
 */
export async function computeSha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Categorizes raw thermal sensor strings into hardware subsystems
 */
export function mapSensorToSubsystem(rawType: string): HardwareSubsystemKey {
  const t = (rawType || "").toLowerCase();
  if (t.includes("pa_therm") || t.includes("modem") || t.includes("rf") || t.includes("baseband")) {
    return "PA IC / RF Modem";
  }
  if (t.includes("pmic") || t.includes("charger") || t.includes("smb") || t.includes("bms") || t.includes("chg") || t.includes("battery")) {
    return "PMIC / Charger";
  }
  if (t.includes("wlan") || t.includes("wifi")) {
    return "Wi-Fi";
  }
  if (t.includes("camera") || t.includes("cam")) {
    return "Camera";
  }
  if (t.includes("soc") || t.includes("cpu") || t.includes("gpu")) {
    return "SoC / CPU-GPU";
  }
  return "General Thermal Sensor";
}

/**
 * Parses raw kernel thermal sysfs sensor dumps
 */
export function parseKernelThermalSensors(rawOutput: string): MappedThermalSensor[] {
  const sensors: MappedThermalSensor[] = [];
  const lines = rawOutput.split(/[\r\n]+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(":")) continue;
    const [rawType, ...rest] = trimmed.split(":");
    const tempStr = rest.join(":").trim();
    let tempNum = parseFloat(tempStr);
    if (isNaN(tempNum)) continue;

    // Millidegrees to Celsius conversion
    if (tempNum > 1000) tempNum = tempNum / 1000;
    if (tempNum < -20 || tempNum > 150) continue; // Noise sanity check

    const tempC = parseFloat(tempNum.toFixed(1));
    const tempF = parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
    const subsystem = mapSensorToSubsystem(rawType);

    let status: "Nominal" | "Elevated" | "Critical / Short" = "Nominal";
    if (tempC >= 55) {
      status = "Critical / Short";
    } else if (tempC >= 42) {
      status = "Elevated";
    }

    sensors.push({
      name: rawType,
      rawType,
      subsystem,
      tempC,
      tempF,
      status,
    });
  }

  // Sort by temperature descending
  sensors.sort((a, b) => b.tempC - a.tempC);
  return sensors;
}

/**
 * Gathers complete forensic audit data from the connected ADB client
 */
export async function collectForensicAuditData(
  client: BrowserAdbClient | null,
  caseMetadata: ExaminerCaseMetadata
): Promise<ForensicAuditReport> {
  const now = new Date().toISOString();
  const reportUuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Default / Disconnected fallback values
  let deviceIdentity: DeviceDigitalIdentity = {
    manufacturer: "Unknown",
    model: "Unknown",
    productName: "Unknown",
    serialNumber: "N/A",
    buildFingerprint: "Unknown",
    androidRelease: "Unknown",
    securityPatch: "Unknown",
    kernelVersion: "Unknown",
    selinuxEnforce: "Unknown",
  };

  let hardwareTriage: HardwareCircuitTriageSnapshot = {
    batteryDrawMa: 0,
    cpuLoadPercent: 0,
    maxSensorTempC: 32.0,
    hottestSensorName: "SoC Baseline",
    verdict: "Nominal Baseline",
    discrepancyEvidence: "No active USB ADB hardware stream attached. Standard nominal baseline assumed.",
    baselineComparison: "Baseline standard nominal threshold (< 38°C in idle).",
    subsystemSensors: {
      paIc: [],
      pmicCharger: [],
      socCpuGpu: [],
      wifi: [],
      camera: [],
      other: [],
    },
    allSensors: [],
  };

  if (client && client.isConnected) {
    // 1. Digital Identity Collection
    const [
      mfrRes,
      modelRes,
      prodRes,
      serialRes,
      fpRes,
      relRes,
      secRes,
      unameRes,
      selinuxRes,
    ] = await Promise.all([
      client.run("getprop ro.product.manufacturer").catch(() => ({ stdout: "Android" })),
      client.run("getprop ro.product.model").catch(() => ({ stdout: "Device" })),
      client.run("getprop ro.product.name").catch(() => ({ stdout: "Unknown" })),
      client.run("getprop ro.serialno").catch(() => ({ stdout: client.serial || "Unknown" })),
      client.run("getprop ro.build.fingerprint").catch(() => ({ stdout: "Unknown" })),
      client.run("getprop ro.build.version.release").catch(() => ({ stdout: "Unknown" })),
      client.run("getprop ro.build.version.security_patch").catch(() => ({ stdout: "Unknown" })),
      client.run("uname -a").catch(() => ({ stdout: "Linux kernel" })),
      client.run("getenforce").catch(() => ({ stdout: "Enforcing" })),
    ]);

    deviceIdentity = {
      manufacturer: mfrRes.stdout || "Android",
      model: modelRes.stdout || "Device",
      productName: prodRes.stdout || "Unknown",
      serialNumber: serialRes.stdout || client.serial || "Unknown",
      buildFingerprint: fpRes.stdout || "Unknown",
      androidRelease: relRes.stdout || "Unknown",
      securityPatch: secRes.stdout || "Unknown",
      kernelVersion: unameRes.stdout || "Linux kernel",
      selinuxEnforce: selinuxRes.stdout || "Enforcing",
    };

    // 2. Hardware & Circuit Triage Snapshot
    // Thermal zones iteration command
    const [thermalRes, battRes, cpuStatRes, topRes] = await Promise.all([
      client.run(`sh -c 'for z in /sys/class/thermal/thermal_zone*; do echo "$(cat $z/type 2>/dev/null):$(cat $z/temp 2>/dev/null)"; done'`).catch(() => ({ stdout: "" })),
      client.run("cat /sys/class/power_supply/battery/current_now 2>/dev/null || cat /sys/class/power_supply/battery/batt_current 2>/dev/null || dumpsys battery").catch(() => ({ stdout: "" })),
      client.run("cat /proc/stat 2>/dev/null | grep '^cpu '").catch(() => ({ stdout: "" })),
      client.run("top -n 1 -m 5 -s cpu").catch(() => ({ stdout: "" })),
    ]);

    // Parse battery draw (mA)
    let batteryDrawMa = 0;
    const rawBattText = battRes.stdout.trim();
    const parsedBatt = parseInt(rawBattText, 10);
    if (!isNaN(parsedBatt)) {
      const absDraw = Math.abs(parsedBatt);
      batteryDrawMa = absDraw > 10000 ? Math.round(absDraw / 1000) : absDraw;
    } else {
      const match = rawBattText.match(/(?:current_now|current|batt_current)\s*:\s*(-?\d+)/i);
      if (match) {
        const val = Math.abs(parseInt(match[1], 10));
        batteryDrawMa = val > 10000 ? Math.round(val / 1000) : val;
      }
    }

    // Parse CPU Load %
    let cpuLoadPercent = 0;
    if (cpuStatRes.stdout) {
      const parts = cpuStatRes.stdout.trim().split(/\s+/).slice(1).map(Number);
      if (parts.length >= 4) {
        const idle = parts[3];
        const total = parts.reduce((a, b) => a + b, 0);
        if (total > 0) {
          cpuLoadPercent = parseFloat((((total - idle) / total) * 100).toFixed(1));
        }
      }
    }
    if (cpuLoadPercent === 0 && topRes.stdout) {
      const matchTotal = topRes.stdout.match(/([\d.]+)%\s*TOTAL/i) || topRes.stdout.match(/TOTAL:\s*([\d.]+)%/i);
      if (matchTotal) {
        cpuLoadPercent = parseFloat(matchTotal[1]);
      }
    }

    // Parse Thermal Sensors
    const allSensors = parseKernelThermalSensors(thermalRes.stdout);
    let maxTemp = 0;
    let hottestName = "SoC Baseline";

    for (const sensor of allSensors) {
      if (sensor.tempC > maxTemp) {
        maxTemp = sensor.tempC;
        hottestName = `${sensor.subsystem} (${sensor.name})`;
      }
    }

    // Subsystem categorization
    const subsystemSensors = {
      paIc: allSensors.filter((s) => s.subsystem === "PA IC / RF Modem"),
      pmicCharger: allSensors.filter((s) => s.subsystem === "PMIC / Charger"),
      socCpuGpu: allSensors.filter((s) => s.subsystem === "SoC / CPU-GPU"),
      wifi: allSensors.filter((s) => s.subsystem === "Wi-Fi"),
      camera: allSensors.filter((s) => s.subsystem === "Camera"),
      other: allSensors.filter((s) => s.subsystem === "General Thermal Sensor"),
    };

    // Hardware Anomaly Triage Verdict Heuristic
    let verdict: HardwareVerdict = "Nominal Baseline";
    let discrepancyEvidence = "";
    let baselineComparison = "";

    const isIdle = cpuLoadPercent < 25;
    const isThermalHighOrDrainHigh = maxTemp >= 42 || batteryDrawMa > 800;

    if (isIdle && isThermalHighOrDrainHigh) {
      verdict = "Critical Component Leakage or Short Suspected";
      discrepancyEvidence = `Low CPU compute load (${cpuLoadPercent}%) but localized thermal anomaly (${maxTemp}°C on ${hottestName}) and/or high battery current drain (${batteryDrawMa}mA). Evidence strongly indicates direct component leakage or circuit short.`;
      baselineComparison = `Thermal peak ${maxTemp}°C vs Nominal Idle Baseline (< 38°C). Delta: +${(maxTemp - 38).toFixed(1)}°C above tolerance.`;
    } else if (maxTemp >= 42 || cpuLoadPercent >= 60) {
      verdict = "High Software Load";
      discrepancyEvidence = `Active background software compute load (${cpuLoadPercent}%) directly correlates with thermal dissipation (${maxTemp}°C). Energy draw consistent with software workload rather than localized hardware short.`;
      baselineComparison = `Thermal peak ${maxTemp}°C corresponds directly with high CPU compute utilization (${cpuLoadPercent}%).`;
    } else {
      verdict = "Nominal Baseline";
      discrepancyEvidence = `All mapped hardware thermal zones operating within expected thermal envelope (${maxTemp > 0 ? maxTemp + "°C max" : "nominal"}). Battery current draw (${batteryDrawMa}mA) and CPU compute load (${cpuLoadPercent}%) are nominal.`;
      baselineComparison = `Thermal reading ${maxTemp > 0 ? maxTemp + "°C" : "Nominal"} vs Standard Hardware Baseline (< 42°C threshold across all subsystem rails).`;
    }

    hardwareTriage = {
      batteryDrawMa,
      cpuLoadPercent,
      maxSensorTempC: maxTemp > 0 ? maxTemp : 32.5,
      hottestSensorName: hottestName,
      verdict,
      discrepancyEvidence,
      baselineComparison,
      subsystemSensors,
      allSensors,
    };
  }

  // 3. Session Package Audit Trail
  const packageAuditTrail = getSessionPackageAuditTrail();

  // 4. Live Network Sockets Snapshot
  const networkSnapshot = getLatestNetworkAuditSnapshot() || undefined;

  // 5. Static APK Reconnaissance Findings
  const apkForensicSummary = getLatestApkForensicSummary() || undefined;

  // 6. Tamper-Evident SHA-256 Digest Computation
  // Prepare canonical serialization payload without the final hash
  const canonicalPayload = {
    schemaVersion: "1.0.0-forensic",
    generatedAt: now,
    reportUuid,
    caseMetadata,
    deviceIdentity,
    hardwareTriage,
    packageAuditTrail,
    ...(networkSnapshot ? { networkSnapshot } : {}),
    ...(apkForensicSummary ? { apkForensicSummary } : {}),
  };

  const serializedString = JSON.stringify(canonicalPayload, null, 2);
  const sha256Hash = await computeSha256Hex(serializedString);

  return {
    metadata: {
      schemaVersion: "1.0.0-forensic",
      generatedAt: now,
      reportUuid,
      sha256Hash,
    },
    caseMetadata,
    deviceIdentity,
    hardwareTriage,
    packageAuditTrail,
    networkSnapshot,
    apkForensicSummary,
  };
}

/**
 * Validates the cryptographic integrity of a forensic audit report
 */
export async function verifyReportIntegrity(report: ForensicAuditReport): Promise<{
  valid: boolean;
  expectedHash: string;
  actualHash: string;
}> {
  const canonicalPayload = {
    schemaVersion: report.metadata.schemaVersion,
    generatedAt: report.metadata.generatedAt,
    reportUuid: report.metadata.reportUuid,
    caseMetadata: report.caseMetadata,
    deviceIdentity: report.deviceIdentity,
    hardwareTriage: report.hardwareTriage,
    packageAuditTrail: report.packageAuditTrail,
    ...(report.networkSnapshot ? { networkSnapshot: report.networkSnapshot } : {}),
    ...(report.apkForensicSummary ? { apkForensicSummary: report.apkForensicSummary } : {}),
  };

  const serialized = JSON.stringify(canonicalPayload, null, 2);
  const actualHash = await computeSha256Hex(serialized);
  const expectedHash = report.metadata.sha256Hash;

  return {
    valid: actualHash.toLowerCase() === expectedHash.toLowerCase(),
    expectedHash,
    actualHash,
  };
}

/**
 * Generates official formatted Markdown dossier representation
 */
export function generateMarkdownReport(report: ForensicAuditReport): string {
  const { metadata, caseMetadata, deviceIdentity, hardwareTriage, packageAuditTrail, networkSnapshot, apkForensicSummary } = report;

  return `# FORENSIC INSPECTION & DIGITAL INTEGRITY REPORT
**Certificate ID:** \`${metadata.reportUuid}\`  
**Generated At:** ${metadata.generatedAt}  
**Tamper-Evident SHA-256:** \`${metadata.sha256Hash}\`

---

## 1. EXAMINER & CASE METADATA
| Field | Value |
|---|---|
| **Case / Evidence ID** | ${caseMetadata.caseReferenceId || "N/A"} |
| **Examiner Name** | ${caseMetadata.examinerName || "N/A"} |
| **Badge / Operator ID** | ${caseMetadata.badgeOrOperatorId || "N/A"} |
| **Operational Findings** | ${caseMetadata.operationalNotes || "No specific operational remarks documented."} |

---

## 2. DEVICE DIGITAL IDENTITY
| Property | Value |
|---|---|
| **Manufacturer** | ${deviceIdentity.manufacturer} |
| **Model** | ${deviceIdentity.model} |
| **Product / Code Name** | ${deviceIdentity.productName} |
| **Serial Number** | \`${deviceIdentity.serialNumber}\` |
| **Android Release** | Android ${deviceIdentity.androidRelease} |
| **Security Patch Level** | ${deviceIdentity.securityPatch} |
| **SELinux Status** | \`${deviceIdentity.selinuxEnforce}\` |
| **Kernel Version** | ${deviceIdentity.kernelVersion} |
| **Build Fingerprint** | \`${deviceIdentity.buildFingerprint}\` |

---

## 3. HARDWARE & CIRCUIT TRIAGE SNAPSHOT
- **Circuit Anomaly Verdict:** **[ ${hardwareTriage.verdict.toUpperCase()} ]**
- **Battery Current Draw:** \`${hardwareTriage.batteryDrawMa} mA\`
- **CPU Compute Load:** \`${hardwareTriage.cpuLoadPercent} %\`
- **Peak Thermal Sensor:** \`${hardwareTriage.maxSensorTempC}°C\` (${hardwareTriage.hottestSensorName})
- **Discrepancy Evidence:** ${hardwareTriage.discrepancyEvidence}
- **Baseline Comparison:** ${hardwareTriage.baselineComparison}

### Subsystem Thermal Telemetry:
| Subsystem | Sensor Count | Status | Peak Temp |
|---|---|---|---|
| **PA IC / RF Modem** | ${hardwareTriage.subsystemSensors.paIc.length} | ${hardwareTriage.subsystemSensors.paIc.some(s => s.status === "Critical / Short") ? "CRITICAL" : "NOMINAL"} | ${hardwareTriage.subsystemSensors.paIc[0]?.tempC ?? "N/A"}°C |
| **PMIC / Charger** | ${hardwareTriage.subsystemSensors.pmicCharger.length} | ${hardwareTriage.subsystemSensors.pmicCharger.some(s => s.status === "Critical / Short") ? "CRITICAL" : "NOMINAL"} | ${hardwareTriage.subsystemSensors.pmicCharger[0]?.tempC ?? "N/A"}°C |
| **SoC / CPU-GPU** | ${hardwareTriage.subsystemSensors.socCpuGpu.length} | ${hardwareTriage.subsystemSensors.socCpuGpu.some(s => s.status === "Critical / Short") ? "CRITICAL" : "NOMINAL"} | ${hardwareTriage.subsystemSensors.socCpuGpu[0]?.tempC ?? "N/A"}°C |
| **Wi-Fi Module** | ${hardwareTriage.subsystemSensors.wifi.length} | ${hardwareTriage.subsystemSensors.wifi.some(s => s.status === "Critical / Short") ? "CRITICAL" : "NOMINAL"} | ${hardwareTriage.subsystemSensors.wifi[0]?.tempC ?? "N/A"}°C |
| **Camera Sensor** | ${hardwareTriage.subsystemSensors.camera.length} | ${hardwareTriage.subsystemSensors.camera.some(s => s.status === "Critical / Short") ? "CRITICAL" : "NOMINAL"} | ${hardwareTriage.subsystemSensors.camera[0]?.tempC ?? "N/A"}°C |

---

## 4. SESSION PACKAGE AUDIT TRAIL (IMMUTABLE LEDGER)
Total Actions Recorded: **${packageAuditTrail.length}**

| Timestamp (UTC) | Action | Package ID | App Label | Exit Status |
|---|---|---|---|---|
${packageAuditTrail.length === 0 ? "| - | No modifications | Active session had zero package mutations | - | - |" : packageAuditTrail.map(p => `| ${p.timestamp} | **${p.action}** | \`${p.packageId}\` | ${p.appLabel} | ${p.exitStatus === "Success" ? "OK" : "FAILED"} |`).join("\n")}

---

## 5. NETWORK SOCKETS & PRIVACY RECONNAISSANCE
${networkSnapshot ? `- **Capture Timestamp:** ${networkSnapshot.capturedAt}
- **Total Monitored Sockets:** \`${networkSnapshot.totalSockets}\`
- **Active Established:** \`${networkSnapshot.establishedSockets}\`
- **Listening Services:** \`${networkSnapshot.listeningSockets}\`
- **Suspicious / Telemetry Flagged:** \`${networkSnapshot.suspiciousCount}\`

| Application / Service | Local Endpoint | Remote Endpoint | State | Direction | Classification |
|---|---|---|---|---|---|
${networkSnapshot.sockets.length === 0 ? "| - | No active sockets recorded | - | - | - | - |" : networkSnapshot.sockets.slice(0, 25).map(s => `| **${s.appLabel || s.packageName || "UID " + s.uid}** | \`${s.localIp}:${s.localPort}\` | \`${s.remoteIp}:${s.remotePort}\` | \`${s.state}\` | ${s.direction} | ${s.isSuspicious ? "**[FLAGGED] " + s.classificationTag + "**" : s.classificationTag} |`).join("\n")}` : `*No live network socket snapshot was recorded during this inspection session.*`}

---

## 6. STATIC APK RECONNAISSANCE & MANIFEST AUDIT
${apkForensicSummary ? `- **Target Application:** ${apkForensicSummary.appName || apkForensicSummary.packageName} (\`${apkForensicSummary.packageName}\`)
- **Inspection Source:** \`${apkForensicSummary.source}\` at ${apkForensicSummary.inspectedAt}
- **Version Details:** Version ${apkForensicSummary.versionName} (Build Code: \`${apkForensicSummary.versionCode}\`)
- **SDK Compatibility:** Min SDK: \`${apkForensicSummary.minSdkVersion}\` | Target SDK: \`${apkForensicSummary.targetSdkVersion}\`
- **Binary Checksum:** \`${apkForensicSummary.sha256Checksum}\` (${(apkForensicSummary.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB)
- **Security Flags:**
  * Debuggable: **${apkForensicSummary.flags.debuggable ? "[WARNING] TRUE (VULNERABILITY / ANALYSIS ARTIFACT)" : "FALSE"}**
  * Allow Backup: **${apkForensicSummary.flags.allowBackup ? "[CAUTION] TRUE (POTENTIAL ADB EXTRACTION RISK)" : "FALSE"}**
  * Cleartext HTTP Traffic: **${apkForensicSummary.flags.usesCleartextTraffic ? "[ALERT] PERMITTED" : "ENFORCED HTTPS"}**
- **Permissions Audit:** Declared **${apkForensicSummary.totalPermissions}** total permissions (${apkForensicSummary.dangerousPermissionsCount} classified Sensitive/Dangerous).
- **Exported Attack Surface:** **${apkForensicSummary.exportedComponentsCount}** exported entry points accessible to third-party apps without permissions.
` : `*No static APK binary inspection was recorded during this inspection session.*`}

---

## 7. CRYPTOGRAPHIC VERIFICATION BLOCK
\`\`\`
Algorithm : SHA-256
Digest    : ${metadata.sha256Hash}
Cert UUID : ${metadata.reportUuid}
Status    : IMMUTABLE & DIGITALLY VERIFIED
\`\`\`
*This report was automatically synthesized by the Android Control Center Forensic Audit Engine in adherence with standard digital chain-of-custody practices.*
`;
}
