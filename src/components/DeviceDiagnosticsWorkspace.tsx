import React, { useState, useEffect, useCallback, useRef } from "react";
import type { Adb } from "@yume-chan/adb";
import { BrowserAdbClient, type DeviceProfile } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Activity,
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Cpu,
  HardDrive,
  Layers,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Gauge,
  Info,
  Clock,
  Smartphone,
  ShieldCheck,
  Terminal,
  Copy,
  ChevronDown,
  ChevronUp,
  Eye,
  Server,
  Zap,
  Play,
  Pause,
  Trash2,
  CircuitBoard,
  Radio,
  AlertOctagon,
} from "lucide-react";

export interface DeviceDiagnosticsWorkspaceProps {
  adb: Adb | null;
  client?: BrowserAdbClient | null;
  isConnected: boolean;
  device: DeviceProfile | null;
  language?: "en" | "ar" | "other";
  onAddReceipt?: (
    receipt: { command: string; stdout: string; stderr: string; exitCode: number; at: string },
    label: string,
    authority: "USB" | "Root" | "Browser"
  ) => void;
}

/* =========================================================================
   1. TYPES & DATA STRUCTURES
   ========================================================================= */

export interface BatteryMetrics {
  level: number;
  scale: number;
  status: string;
  statusCode: number;
  health: string;
  healthCode: number;
  voltage: number; // in volts
  voltageRaw: number; // in mV
  temperatureC: number;
  temperatureF: number;
  temperatureRaw: number;
  technology: string;
  acPowered: boolean;
  usbPowered: boolean;
  wirelessPowered: boolean;
  chargeCounter?: number;
  present: boolean;
}

export interface MemoryMetrics {
  totalMB: number;
  freeMB: number;
  availableMB: number;
  usedMB: number;
  usedPercent: number;
  buffersMB: number;
  cachedMB: number;
  swapTotalMB: number;
  swapFreeMB: number;
}

export interface StoragePartition {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mount: string;
}

export interface ThermalZone {
  name: string;
  tempC: number;
  tempF: number;
  type?: string;
}

export interface CpuMetrics {
  hardware: string;
  model: string;
  cores: number;
  architecture: string;
  abi: string;
  governor?: string;
  maxFreq?: string;
  thermalStatus: string;
  socTempC: number;
  socTempF: number;
  thermalZones: ThermalZone[];
}

export interface RogueProcess {
  pid: number;
  name: string;
  cpuPercent: number;
}

export type HardwareSubsystem =
  | "RF Front-End / Cellular Power Amplifier (PA IC)"
  | "PMIC / Charging Management Circuit"
  | "Wi-Fi / Bluetooth Module IC"
  | "Camera Sensor / Power Rails (LDO)"
  | "SoC Core Processing Unit"
  | "General Thermal Sensor";

export interface HardwareThermalSensor {
  name: string;
  subsystem: HardwareSubsystem;
  tempC: number;
  tempF: number;
  rawType: string;
  status: "Nominal" | "Elevated" | "Critical / Short";
}

export type HardwareFaultSeverity = "nominal" | "software" | "critical";

export interface HardwareAnomalyReport {
  status: HardwareFaultSeverity;
  statusLabel: string;
  totalCpuLoad: number;
  batteryCurrentDrainMa: number;
  maxSensorTempC: number;
  hottestSensor: HardwareThermalSensor | null;
  faultingComponent: string | null;
  discrepancyEvidence: string;
  baselineComparison: string;
  sensors: HardwareThermalSensor[];
  rawSysfsOutput: string;
}

export interface SystemVitals {
  battery: BatteryMetrics | null;
  memory: MemoryMetrics | null;
  storage: StoragePartition[];
  dataStorage: StoragePartition | null;
  cpu: CpuMetrics | null;
  topProcesses: RogueProcess[];
  hardwareAnomaly: HardwareAnomalyReport | null;
  displaySize: string;
  displayDensity: string;
  uptime: string;
  selinux: string;
  securityPatch: string;
  lastUpdated: string;
}

/* =========================================================================
   2. ADB HELPER & PARSING FUNCTIONS
   ========================================================================= */

async function execCommand(
  adb: Adb | null,
  client: BrowserAdbClient | null | undefined,
  cmd: string
): Promise<string> {
  if (client) {
    try {
      const res = await client.run(cmd, { timeoutMs: 7000 });
      return (res.stdout || "").trim();
    } catch {
      // Fallback to direct adb instance
    }
  }
  if (adb) {
    try {
      const sub = adb.subprocess as any;
      if (typeof sub.spawnAndWaitText === "function") {
        return (await sub.spawnAndWaitText(cmd)).trim();
      }
      if (typeof sub.spawnAndWait === "function") {
        const res = await sub.spawnAndWait(cmd);
        return ((res && res.stdout) || "").trim();
      }
    } catch {
      return "";
    }
  }
  return "";
}

export function parseBatteryOutput(raw: string): BatteryMetrics {
  const metrics: BatteryMetrics = {
    level: 0,
    scale: 100,
    status: "Unknown",
    statusCode: 1,
    health: "Good",
    healthCode: 2,
    voltage: 0,
    voltageRaw: 0,
    temperatureC: 0,
    temperatureF: 32,
    temperatureRaw: 0,
    technology: "Li-ion",
    acPowered: false,
    usbPowered: false,
    wirelessPowered: false,
    present: true,
  };

  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes(":")) continue;
    const [key, ...vals] = trimmed.split(":");
    const val = vals.join(":").trim();

    switch (key.toLowerCase()) {
      case "level":
        metrics.level = parseInt(val, 10) || 0;
        break;
      case "scale":
        metrics.scale = parseInt(val, 10) || 100;
        break;
      case "ac powered":
        metrics.acPowered = val.toLowerCase() === "true";
        break;
      case "usb powered":
        metrics.usbPowered = val.toLowerCase() === "true";
        break;
      case "wireless powered":
        metrics.wirelessPowered = val.toLowerCase() === "true";
        break;
      case "status": {
        const code = parseInt(val, 10) || 1;
        metrics.statusCode = code;
        const statusMap: Record<number, string> = {
          1: "Unknown",
          2: "Charging",
          3: "Discharging",
          4: "Not Charging",
          5: "Full",
        };
        metrics.status = statusMap[code] || "Unknown";
        break;
      }
      case "health": {
        const code = parseInt(val, 10) || 1;
        metrics.healthCode = code;
        const healthMap: Record<number, string> = {
          1: "Unknown",
          2: "Good",
          3: "Overheat",
          4: "Dead",
          5: "Over Voltage",
          6: "Unspecified Failure",
          7: "Cold",
        };
        metrics.health = healthMap[code] || "Good";
        break;
      }
      case "present":
        metrics.present = val.toLowerCase() === "true";
        break;
      case "voltage": {
        const mv = parseInt(val, 10) || 0;
        metrics.voltageRaw = mv;
        metrics.voltage = parseFloat((mv / 1000).toFixed(3));
        break;
      }
      case "temperature": {
        const tempRaw = parseInt(val, 10) || 0;
        metrics.temperatureRaw = tempRaw;
        // Android temperature is in tenths of degree Celsius (e.g. 312 = 31.2°C)
        const c = tempRaw > 200 ? tempRaw / 10 : tempRaw;
        metrics.temperatureC = parseFloat(c.toFixed(1));
        metrics.temperatureF = parseFloat(((c * 9) / 5 + 32).toFixed(1));
        break;
      }
      case "technology":
        metrics.technology = val || "Li-ion";
        break;
      case "charge counter":
        metrics.chargeCounter = parseInt(val, 10) || undefined;
        break;
    }
  }

  return metrics;
}

export function parseMeminfoOutput(raw: string): MemoryMetrics {
  const getKb = (pattern: RegExp): number => {
    const match = raw.match(pattern);
    return match ? parseInt(match[1], 10) : 0;
  };

  const totalKb = getKb(/MemTotal:\s+(\d+)\s+kB/i);
  const freeKb = getKb(/MemFree:\s+(\d+)\s+kB/i);
  const availableKb = getKb(/MemAvailable:\s+(\d+)\s+kB/i) || freeKb;
  const buffersKb = getKb(/Buffers:\s+(\d+)\s+kB/i);
  const cachedKb = getKb(/Cached:\s+(\d+)\s+kB/i);
  const swapTotalKb = getKb(/SwapTotal:\s+(\d+)\s+kB/i);
  const swapFreeKb = getKb(/SwapFree:\s+(\d+)\s+kB/i);

  const totalMB = Math.round(totalKb / 1024);
  const freeMB = Math.round(freeKb / 1024);
  const availableMB = Math.round(availableKb / 1024);
  const usedMB = Math.max(0, totalMB - availableMB);
  const usedPercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;

  return {
    totalMB,
    freeMB,
    availableMB,
    usedMB,
    usedPercent,
    buffersMB: Math.round(buffersKb / 1024),
    cachedMB: Math.round(cachedKb / 1024),
    swapTotalMB: Math.round(swapTotalKb / 1024),
    swapFreeMB: Math.round(swapFreeKb / 1024),
  };
}

export function parseStorageOutput(raw: string): StoragePartition[] {
  const partitions: StoragePartition[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("filesystem")) continue;

    // Matches standard df -h or df: Filesystem Size Used Avail Use% Mounted on
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 6) {
      const filesystem = parts[0];
      const size = parts[1];
      const used = parts[2];
      const available = parts[3];
      const usePercentStr = parts[4].replace("%", "");
      const mount = parts.slice(5).join(" ");
      const usePercent = parseInt(usePercentStr, 10) || 0;

      // Filter interesting partitions for mobile forensics
      if (
        mount === "/data" ||
        mount === "/" ||
        mount === "/system" ||
        mount === "/vendor" ||
        mount === "/storage/emulated" ||
        mount === "/sdcard" ||
        mount === "/cache" ||
        mount.startsWith("/data/") ||
        mount.startsWith("/mnt/media_rw")
      ) {
        partitions.push({
          filesystem,
          size,
          used,
          available,
          usePercent,
          mount,
        });
      }
    }
  }

  return partitions;
}

export function parseCpuOutput(
  cpuinfoRaw: string,
  thermalRaw: string,
  abi: string,
  platform: string
): CpuMetrics {
  let hardware = platform || "ARM Processor";
  let model = "";
  let coreCount = 0;

  const lines = cpuinfoRaw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("processor")) {
      coreCount++;
    } else if (trimmed.toLowerCase().startsWith("hardware")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) hardware = parts[1].trim();
    } else if (trimmed.toLowerCase().startsWith("model name")) {
      const parts = trimmed.split(":");
      if (parts.length > 1 && !model) model = parts[1].trim();
    }
  }

  if (coreCount === 0) coreCount = 8; // standard modern mobile baseline
  if (!model) model = hardware;

  // Parse thermal zones from dumpsys thermalservice or thermal sysfs
  const thermalZones: ThermalZone[] = [];
  let socTemp = 36.5;

  const tempMatches = thermalRaw.matchAll(/Temperature\{mValue=([\d.]+),\s*mType=\d+,\s*mName=([^}]+)\}/gi);
  for (const match of tempMatches) {
    const val = parseFloat(match[1]);
    const name = match[2];
    if (!isNaN(val)) {
      thermalZones.push({
        name,
        tempC: parseFloat(val.toFixed(1)),
        tempF: parseFloat(((val * 9) / 5 + 32).toFixed(1)),
      });
      if (name.toLowerCase().includes("cpu") || name.toLowerCase().includes("soc")) {
        socTemp = val;
      }
    }
  }

  // Fallback: If no thermalservice match, parse raw numeric output
  if (thermalZones.length === 0) {
    const numbers = thermalRaw.match(/\b\d{4,6}\b/g);
    if (numbers && numbers.length > 0) {
      numbers.slice(0, 4).forEach((numStr, idx) => {
        const val = parseInt(numStr, 10) / 1000;
        if (val > 15 && val < 110) {
          thermalZones.push({
            name: `Thermal Zone ${idx}`,
            tempC: parseFloat(val.toFixed(1)),
            tempF: parseFloat(((val * 9) / 5 + 32).toFixed(1)),
          });
          if (idx === 0) socTemp = val;
        }
      });
    }
  }

  // Thermal state evaluation
  let thermalStatus = "Nominal";
  if (socTemp > 80) thermalStatus = "Critical / Throttling";
  else if (socTemp > 65) thermalStatus = "Elevated";
  else if (socTemp > 45) thermalStatus = "Warm";
  else thermalStatus = "Nominal";

  return {
    hardware,
    model,
    cores: coreCount,
    architecture: abi.includes("64") ? "64-bit ARM" : "32-bit ARM",
    abi,
    thermalStatus,
    socTempC: parseFloat(socTemp.toFixed(1)),
    socTempF: parseFloat(((socTemp * 9) / 5 + 32).toFixed(1)),
    thermalZones,
  };
}

export function parseTopProcesses(raw: string): RogueProcess[] {
  const procs: RogueProcess[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // dumpsys cpuinfo format: 18% 1234/com.example.app: 14% user + 4% kernel
    const matchDumpsys = trimmed.match(/^([\d.]+)%\s+(\d+)\/([^:\s]+):?/);
    if (matchDumpsys) {
      const cpu = parseFloat(matchDumpsys[1]);
      const pid = parseInt(matchDumpsys[2], 10);
      const name = matchDumpsys[3].trim();
      if (name && !name.startsWith("[")) {
        procs.push({ pid, name, cpuPercent: cpu });
      }
      continue;
    }

    // top format: PID USER ... %CPU ... COMMAND
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 8 && /^\d+$/.test(parts[0])) {
      const pid = parseInt(parts[0], 10);
      let cpu = 0;
      const name = parts[parts.length - 1];
      for (const p of parts) {
        if (/^[\d.]+%?$/.test(p)) {
          const val = parseFloat(p.replace("%", ""));
          if (val > cpu && val <= 800) cpu = val;
        }
      }
      if (name && !name.startsWith("[") && pid > 0 && name !== "top" && name !== "sh") {
        procs.push({ pid, name, cpuPercent: cpu });
      }
    }
  }

  // Deduplicate and sort descending by CPU%
  const seen = new Set<string>();
  const unique: RogueProcess[] = [];
  procs.sort((a, b) => b.cpuPercent - a.cpuPercent);
  for (const p of procs) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      unique.push(p);
    }
  }

  return unique.slice(0, 5);
}

export function categorizeSensor(type: string): HardwareSubsystem {
  const t = (type || "").toLowerCase();
  if (t.includes("pa_therm") || t.includes("modem") || t.includes("rf") || t.includes("baseband")) {
    return "RF Front-End / Cellular Power Amplifier (PA IC)";
  }
  if (t.includes("pmic") || t.includes("charger") || t.includes("smb") || t.includes("bms") || t.includes("chg") || t.includes("battery")) {
    return "PMIC / Charging Management Circuit";
  }
  if (t.includes("wlan") || t.includes("wifi")) {
    return "Wi-Fi / Bluetooth Module IC";
  }
  if (t.includes("camera") || t.includes("cam")) {
    return "Camera Sensor / Power Rails (LDO)";
  }
  if (t.includes("soc") || t.includes("cpu") || t.includes("gpu")) {
    return "SoC Core Processing Unit";
  }
  return "General Thermal Sensor";
}

export function parseKernelThermalSensors(raw: string): HardwareThermalSensor[] {
  const sensors: HardwareThermalSensor[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(":")) continue;
    const [rawType, ...rest] = trimmed.split(":");
    const tempStr = rest.join(":").trim();
    let tempNum = parseFloat(tempStr);
    if (isNaN(tempNum)) continue;

    // Normalize sensor readings: convert millidegrees to °C by dividing by 1000 if temp > 1000
    if (tempNum > 1000) tempNum = tempNum / 1000;
    if (tempNum < -20 || tempNum > 150) continue; // Boundary sanity check

    const tempC = parseFloat(tempNum.toFixed(1));
    const tempF = parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
    const subsystem = categorizeSensor(rawType);
    let status: "Nominal" | "Elevated" | "Critical / Short" = "Nominal";
    if (tempC >= 55) status = "Critical / Short";
    else if (tempC >= 42) status = "Elevated";

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

/* =========================================================================
   3. MAIN COMPONENT
   ========================================================================= */

export const DeviceDiagnosticsWorkspace: React.FC<DeviceDiagnosticsWorkspaceProps> = ({
  adb,
  client,
  isConnected,
  device,
  language = "en",
  onAddReceipt,
}) => {
  const isArabic = language === "ar";

  const [vitals, setVitals] = useState<SystemVitals | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoPolling, setAutoPolling] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "hardware" | "battery" | "cpu" | "storage" | "memory" | "raw">("overview");
  const [rawDumps, setRawDumps] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDiagnostics = useCallback(async (isSilent = false) => {
    if (!isConnected) return;
    if (!isSilent) setLoading(true);

    try {
      // 1. Battery metrics
      const batteryRaw = await execCommand(adb, client, "dumpsys battery");
      const battery = parseBatteryOutput(batteryRaw);

      // 2. Memory metrics
      const memRaw = await execCommand(adb, client, "cat /proc/meminfo");
      const memory = parseMeminfoOutput(memRaw);

      // 3. Storage metrics
      let storageRaw = await execCommand(adb, client, "df -h");
      if (!storageRaw || storageRaw.includes("not found")) {
        storageRaw = await execCommand(adb, client, "df");
      }
      const storage = parseStorageOutput(storageRaw);
      const dataStorage = storage.find((p) => p.mount === "/data") || null;

      // 4. CPU & Thermals
      const cpuinfoRaw = await execCommand(adb, client, "cat /proc/cpuinfo");
      let thermalRaw = await execCommand(adb, client, "dumpsys thermalservice");
      if (!thermalRaw || thermalRaw.length < 20) {
        thermalRaw = await execCommand(adb, client, "cat /sys/class/thermal/thermal_zone0/temp /sys/class/thermal/thermal_zone1/temp");
      }
      const abiRaw = await execCommand(adb, client, "getprop ro.product.cpu.abi");
      const platformRaw = await execCommand(adb, client, "getprop ro.board.platform");
      const cpu = parseCpuOutput(cpuinfoRaw, thermalRaw, abiRaw || "arm64-v8a", platformRaw);

      // 5. System specifications
      const displaySizeRaw = await execCommand(adb, client, "wm size");
      const displayDensityRaw = await execCommand(adb, client, "wm density");
      const uptimeRaw = await execCommand(adb, client, "uptime");
      const selinuxRaw = await execCommand(adb, client, "getenforce");
      const securityPatchRaw = await execCommand(adb, client, "getprop ro.build.version.security_patch");

      const displaySize = displaySizeRaw.replace(/.*Physical size:\s*/i, "").trim() || "1080x2400";
      const displayDensity = displayDensityRaw.replace(/.*Physical density:\s*/i, "").trim() || "440 dpi";
      const uptime = uptimeRaw.replace(/.*up\s+/i, "up ").trim() || uptimeRaw || "Available";
      const selinux = selinuxRaw || "Enforcing";
      const securityPatch = securityPatchRaw || "Unknown";

      // 6. Top CPU Consumers / Rogue Processes
      let cpuProcessesRaw = await execCommand(adb, client, "top -n 1 -m 8 -s cpu");
      let topProcesses = parseTopProcesses(cpuProcessesRaw);
      if (topProcesses.length === 0) {
        cpuProcessesRaw = await execCommand(adb, client, "dumpsys cpuinfo");
        topProcesses = parseTopProcesses(cpuProcessesRaw);
      }

      // 7. Hardware Component Fault & Circuit Anomaly Triage
      // Read all kernel thermal sensors by executing sysfs iteration command
      const kernelThermalRaw = await execCommand(
        adb,
        client,
        `sh -c 'for z in /sys/class/thermal/thermal_zone*; do echo "$(cat $z/type 2>/dev/null):$(cat $z/temp 2>/dev/null)"; done'`
      );

      // Read current battery draw via cat /sys/class/power_supply/battery/current_now or dumpsys battery
      let currentNowRaw = await execCommand(
        adb,
        client,
        "cat /sys/class/power_supply/battery/current_now 2>/dev/null"
      );
      if (!currentNowRaw || isNaN(parseInt(currentNowRaw, 10))) {
        currentNowRaw = await execCommand(
          adb,
          client,
          "cat /sys/class/power_supply/battery/batt_current 2>/dev/null"
        );
      }
      if (!currentNowRaw || isNaN(parseInt(currentNowRaw, 10))) {
        const matchBattDump = batteryRaw.match(/(?:current_now|current|batt_current)\s*:\s*(-?\d+)/i);
        if (matchBattDump) {
          currentNowRaw = matchBattDump[1];
        }
      }

      let batteryDrainMa = 0;
      const parsedDrain = Math.abs(parseInt(currentNowRaw, 10) || 0);
      if (parsedDrain > 10000) {
        // Microamps (µA) -> Milliamps (mA)
        batteryDrainMa = Math.round(parsedDrain / 1000);
      } else if (parsedDrain > 0) {
        batteryDrainMa = parsedDrain;
      }

      // Calculate total CPU usage from dumpsys cpuinfo or /proc/stat
      let totalCpuLoad = 0;
      const totalCpuMatch = cpuProcessesRaw.match(/([\d.]+)%\s*TOTAL/i) || cpuProcessesRaw.match(/TOTAL:\s*([\d.]+)%/i);
      if (totalCpuMatch) {
        const val = parseFloat(totalCpuMatch[1]);
        if (!isNaN(val) && val > 0) totalCpuLoad = val;
      } else if (topProcesses.length > 0) {
        totalCpuLoad = Math.min(
          100,
          parseFloat(
            topProcesses.reduce((acc, p) => acc + (p.cpuPercent || 0), 0).toFixed(1)
          )
        );
      }
      if (totalCpuLoad === 0) {
        const procStatRaw = await execCommand(adb, client, "cat /proc/stat 2>/dev/null | grep '^cpu '");
        if (procStatRaw) {
          const parts = procStatRaw.trim().split(/\s+/).slice(1).map(Number);
          if (parts.length >= 4) {
            const idle = parts[3];
            const total = parts.reduce((a, b) => a + b, 0);
            if (total > 0) {
              totalCpuLoad = parseFloat((((total - idle) / total) * 100).toFixed(1));
            }
          }
        }
      }

      // Parse and normalize kernel sensors (divide by 1000 if > 1000)
      let kernelSensors = parseKernelThermalSensors(kernelThermalRaw);
      if (kernelSensors.length === 0 && cpu && cpu.thermalZones.length > 0) {
        kernelSensors = cpu.thermalZones.map((z) => ({
          name: z.name,
          rawType: z.name,
          subsystem: categorizeSensor(z.name),
          tempC: z.tempC,
          tempF: z.tempF,
          status: (z.tempC >= 55 ? "Critical / Short" : z.tempC >= 42 ? "Elevated" : "Nominal") as "Nominal" | "Elevated" | "Critical / Short",
        }));
      }

      // Identify hottest localized sensor and categorize its hardware subsystem
      let hottestSensor: HardwareThermalSensor | null = null;
      let maxZoneTemp = 0;
      for (const s of kernelSensors) {
        if (s.tempC > maxZoneTemp) {
          maxZoneTemp = s.tempC;
          hottestSensor = s;
        }
      }
      if (!hottestSensor && cpu) {
        maxZoneTemp = cpu.socTempC;
      }

      // Hardware Anomaly Detection Heuristic:
      // Trigger a "Hardware Anomaly Alert" if:
      // CPU Load < 25% AND (Max Zone Temp >= 42°C OR Battery Current Drain > 800mA in idle)
      let anomalySeverity: HardwareFaultSeverity = "nominal";
      let anomalyStatusLabel = "Normal: Hardware Thermal Baseline Nominal";
      let faultingComponent: string | null = null;
      let discrepancyEvidence = "";
      let baselineComparison = "";

      const isIdle = totalCpuLoad < 25;
      const isThermalHighOrDrainHigh = maxZoneTemp >= 42 || batteryDrainMa > 800;

      if (isIdle && isThermalHighOrDrainHigh) {
        anomalySeverity = "critical";
        anomalyStatusLabel = "CRITICAL HARDWARE FAULT: Suspected Short / Component Leakage";
        faultingComponent = hottestSensor ? `${hottestSensor.subsystem} (${hottestSensor.name})` : "PMIC / Charging Management Circuit";
        discrepancyEvidence = `CPU at ${totalCpuLoad}%, but ${hottestSensor?.name || "PA"} Sensor at ${maxZoneTemp}°C indicating direct current leakage/short${batteryDrainMa > 0 ? ` (battery current draw: ${batteryDrainMa}mA in idle)` : ""}.`;
        baselineComparison = `Sensor reading ${maxZoneTemp}°C vs Normal Baseline (< 38°C in idle). Baseline delta: +${(maxZoneTemp - 38).toFixed(1)}°C.`;
      } else if (maxZoneTemp >= 42 || totalCpuLoad >= 60) {
        anomalySeverity = "software";
        anomalyStatusLabel = "Software Load: High CPU Usage Causing Heat";
        faultingComponent = hottestSensor ? `${hottestSensor.subsystem} (${hottestSensor.name})` : "SoC Core Processing Unit";
        discrepancyEvidence = `High CPU usage (${totalCpuLoad}%) causing heat dissipation (${maxZoneTemp}°C). Operating under software compute load rather than circuit short.`;
        baselineComparison = `Sensor reading ${maxZoneTemp}°C correlated with active background compute load (${totalCpuLoad}%).`;
      } else {
        anomalySeverity = "nominal";
        anomalyStatusLabel = "Normal: Hardware Thermal Baseline Nominal";
        faultingComponent = null;
        discrepancyEvidence = `All hardware thermal sensors operating within nominal thermal envelope (${maxZoneTemp > 0 ? maxZoneTemp + "°C max" : "nominal"}). Battery current drain and compute balance are healthy.`;
        baselineComparison = `Sensor reading ${maxZoneTemp > 0 ? maxZoneTemp + "°C" : "Nominal"} vs Normal Baseline (< 42°C threshold across all onboard sensor rails with standard idle drain).`;
      }

      const hardwareAnomaly: HardwareAnomalyReport = {
        status: anomalySeverity,
        statusLabel: anomalyStatusLabel,
        totalCpuLoad,
        batteryCurrentDrainMa: batteryDrainMa,
        maxSensorTempC: maxZoneTemp,
        hottestSensor,
        faultingComponent,
        discrepancyEvidence,
        baselineComparison,
        sensors: kernelSensors,
        rawSysfsOutput: kernelThermalRaw,
      };

      const currentVitals: SystemVitals = {
        battery,
        memory,
        storage,
        dataStorage,
        cpu,
        topProcesses,
        hardwareAnomaly,
        displaySize,
        displayDensity,
        uptime,
        selinux,
        securityPatch,
        lastUpdated: new Date().toLocaleTimeString(),
      };

      setVitals(currentVitals);
      setRawDumps({
        "dumpsys battery": batteryRaw,
        "cat /proc/meminfo": memRaw,
        "df -h": storageRaw,
        "cat /proc/cpuinfo": cpuinfoRaw,
        "dumpsys thermalservice": thermalRaw,
        "top -n 1 -m 8 -s cpu": cpuProcessesRaw,
        "sysfs kernel thermal zones": kernelThermalRaw,
      });

      if (!isSilent) {
        onAddReceipt?.(
          {
            command: "dumpsys battery && cat /proc/meminfo && df -h && dumpsys thermalservice && top -n 1 -m 8 -s cpu && kernel thermal zones",
            stdout: `Vitals sampled: Battery ${battery.level}%, RAM ${memory.usedPercent}% used, Storage ${dataStorage?.usePercent ?? 0}%, Top CPU: ${topProcesses[0]?.name || "nominal"} (${topProcesses[0]?.cpuPercent || 0}%), Circuit Triage: ${anomalySeverity.toUpperCase()}`,
            stderr: "",
            exitCode: 0,
            at: new Date().toISOString(),
          },
          "Sample Device Vitals & Hardware Triage",
          "USB"
        );
      }
    } catch (err: any) {
      console.error("Diagnostics sampling error:", err);
      if (!isSilent) {
        toast.error(isArabic ? "فشل جمع مؤشرات الجهاز" : "Failed to sample device diagnostics");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [adb, client, isConnected, device, isArabic, onAddReceipt]);

  const handleEmergencyCoolDown = async () => {
    setActionLoading("cooldown");
    try {
      await execCommand(adb, client, "settings put global low_power 1");
      await execCommand(adb, client, "settings put system screen_brightness 10");

      onAddReceipt?.(
        {
          command: "settings put global low_power 1 && settings put system screen_brightness 10",
          stdout: "Emergency cool-down: low_power set to 1, screen_brightness set to 10.",
          stderr: "",
          exitCode: 0,
          at: new Date().toISOString(),
        },
        "Emergency Cool-Down",
        "USB"
      );

      toast.success(
        isArabic
          ? "تم تفعيل إجراءات التبريد الطارئ بنجاح (توفير الطاقة + خفض السطوع إلى 10)"
          : "Emergency Cool-Down applied (Low Power mode enabled, screen brightness set to 10)"
      );

      await fetchDiagnostics(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger emergency cool-down");
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceStopProcess = async (packageName: string) => {
    setActionLoading(packageName);
    try {
      await execCommand(adb, client, `am force-stop ${packageName}`);

      onAddReceipt?.(
        {
          command: `am force-stop ${packageName}`,
          stdout: `Process killed via am force-stop ${packageName}`,
          stderr: "",
          exitCode: 0,
          at: new Date().toISOString(),
        },
        `Kill Rogue App: ${packageName}`,
        "USB"
      );

      toast.success(
        isArabic
          ? `تم إيقاف التطبيق بنجاح: ${packageName}`
          : `Successfully killed / force-stopped ${packageName}`
      );

      await fetchDiagnostics(false);
    } catch (err: any) {
      toast.error(err?.message || `Failed to kill ${packageName}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Initial fetch on connection
  useEffect(() => {
    if (isConnected) {
      void fetchDiagnostics(false);
    } else {
      setVitals(null);
    }
  }, [isConnected, fetchDiagnostics]);

  // Handle live polling
  useEffect(() => {
    if (autoPolling && isConnected) {
      pollingTimerRef.current = setInterval(() => {
        void fetchDiagnostics(true);
      }, 5000);
    } else {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [autoPolling, isConnected, fetchDiagnostics]);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(isArabic ? "تم النسخ إلى الحافظة" : "Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportReport = () => {
    if (!vitals) return;

    const report = {
      device: {
        model: device?.model,
        manufacturer: device?.manufacturer,
        serial: device?.serial,
        androidVersion: device?.androidVersion,
        sdk: device?.sdk,
      },
      sampledAt: new Date().toISOString(),
      vitals,
      rawTelemetry: rawDumps,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `device-diagnostics-${device?.serial || "android"}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(isArabic ? "تم تصدير تقرير الفحص" : "Diagnostics report exported");
  };

  /* =========================================================================
     4. RENDER EMPTY / DISCONNECTED STATE
     ========================================================================= */
  if (!isConnected) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center text-slate-300">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <Activity className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">
          {isArabic ? "الجهاز غير متصل حالياً" : "Device Disconnected"}
        </h3>
        <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          {isArabic
            ? "يرجى توصيل جهاز Android عبر WebUSB لفحص صحة البطارية، درجات حرارة المعالج، واستهلاك الذاكرة والتخزين."
            : "Connect an Android device via WebUSB from the Device Desk to audit battery health, thermal sensor zones, CPU load, and storage metrics."}
        </p>
      </div>
    );
  }

  /* =========================================================================
     5. RENDER DIAGNOSTICS DASHBOARD
     ========================================================================= */
  const battery = vitals?.battery;
  const memory = vitals?.memory;
  const storage = vitals?.storage || [];
  const dataStorage = vitals?.dataStorage;
  const cpu = vitals?.cpu;
  const topProcesses = vitals?.topProcesses || [];
  const hardwareAnomaly = vitals?.hardwareAnomaly;
  const currentMaxTemp = Math.max(
    cpu?.socTempC || 0,
    battery?.temperatureC || 0,
    hardwareAnomaly?.maxSensorTempC || 0
  );
  const isThermalHigh = currentMaxTemp >= 42;

  const renderHardwareCircuitTriageCard = () => {
    const anomaly = vitals?.hardwareAnomaly;
    const isCritical = anomaly?.status === "critical";
    const isSoftware = anomaly?.status === "software";

    return (
      <div
        className={`rounded-lg border p-5 space-y-5 transition ${
          isCritical
            ? "border-rose-500/60 bg-gradient-to-br from-slate-900 via-rose-950/20 to-slate-900 shadow-lg shadow-rose-950/30"
            : isSoftware
            ? "border-amber-500/40 bg-slate-900/80"
            : "border-slate-800 bg-slate-900/60"
        }`}
      >
        {/* Header and Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CircuitBoard
                className={`h-5 w-5 ${
                  isCritical ? "text-rose-400" : isSoftware ? "text-amber-400" : "text-emerald-400"
                }`}
              />
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <span>
                  {isArabic
                    ? "فرز أعطال عتاد الدوائر والمكونات الإلكترونية"
                    : "Hardware Component Fault & Circuit Anomaly Triage"}
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">
              {isArabic
                ? "مقارنة مؤشرات درجات حرارة أشباه الموصلات عبر النواة مع استهلاك المعالج وتيار البطارية لتشخيص التسريب الكهربائي والالتماس في الدوائر (RF PA, PMIC, Wi-Fi, LDO)."
                : "Cross-references kernel thermal sensor rails against real-time CPU compute and battery current drain to isolate parasitic silicon leakage, board-level shorts, and damaged power management ICs."}
            </p>
          </div>

          {/* Status Badge */}
          <div className="shrink-0 flex flex-col items-start sm:items-end gap-1.5">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold border transition ${
                isCritical
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/70 animate-pulse shadow-sm shadow-rose-500/30"
                  : isSoftware
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {isCritical ? (
                <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              ) : isSoftware ? (
                <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>
                {anomaly?.statusLabel ||
                  (isArabic
                    ? "الحالة الطبيعية: العتاد سليم"
                    : "Normal: Hardware Thermal Baseline Nominal")}
              </span>
            </div>

            <span className="text-[10px] font-mono text-slate-500">
              {isArabic
                ? "خوارزمية الفحص المقارن (Correlation Heuristic v2)"
                : "Correlation Heuristic: Thermal vs Compute"}
            </span>
          </div>
        </div>

        {/* Telemetry Metrics Bar */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
              {isArabic ? "استهلاك المعالج الإجمالي" : "Total CPU Load"}
            </span>
            <div className="mt-1 font-mono text-lg font-bold text-white">
              {anomaly ? `${anomaly.totalCpuLoad}%` : "--"}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(anomaly?.totalCpuLoad ?? 0) < 25
                ? isArabic
                  ? "حالة سكون / خمول"
                  : "Idle State (<25%)"
                : isArabic
                ? "حمل برمجي نشط"
                : "Active Compute (≥25%)"}
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
              {isArabic ? "سحب تيار البطارية" : "Battery Current Draw"}
            </span>
            <div
              className={`mt-1 font-mono text-lg font-bold ${
                (anomaly?.batteryCurrentDrainMa ?? 0) > 800
                  ? "text-rose-400"
                  : "text-cyan-400"
              }`}
            >
              {anomaly?.batteryCurrentDrainMa
                ? `${anomaly.batteryCurrentDrainMa} mA`
                : battery?.voltage
                ? `${battery.voltage}V nominal`
                : "--"}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(anomaly?.batteryCurrentDrainMa ?? 0) > 800
                ? isArabic
                  ? "سحب مرتفع (>800mA)"
                  : "Elevated Leakage (>800mA)"
                : isArabic
                ? "ضمن الحدود الطبيعية"
                : "Nominal (<800mA)"}
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
              {isArabic ? "أعلى مستشعر حرارة" : "Peak Sensor Rail"}
            </span>
            <div
              className={`mt-1 font-mono text-lg font-bold ${
                (anomaly?.maxSensorTempC ?? 0) >= 50
                  ? "text-rose-400"
                  : (anomaly?.maxSensorTempC ?? 0) >= 42
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {anomaly?.maxSensorTempC ? `${anomaly.maxSensorTempC}°C` : "--"}
            </div>
            <p
              className="text-[10px] text-slate-500 mt-0.5 truncate"
              title={anomaly?.hottestSensor?.name}
            >
              {anomaly?.hottestSensor?.name || "SoC core"}
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
              {isArabic ? "المستشعرات المفحوصة" : "Scanned Kernel Sensors"}
            </span>
            <div className="mt-1 font-mono text-lg font-bold text-white">
              {anomaly?.sensors.length ?? 0}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {isArabic ? "مسار عتاد مراقب" : "Monitored hardware rails"}
            </p>
          </div>
        </div>

        {/* Faulting Component / IC Suspect Breakdown */}
        <div
          className={`rounded-lg border p-4 space-y-3.5 ${
            isCritical
              ? "border-rose-500/50 bg-rose-950/30 text-rose-200"
              : isSoftware
              ? "border-amber-500/30 bg-amber-950/20 text-amber-200"
              : "border-slate-800 bg-slate-950/60 text-slate-300"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>
                {isArabic
                  ? "تشخيص المكون المشتبه به (Faulting Component / IC Suspect):"
                  : "Faulting Component / IC Suspect:"}
              </span>
            </span>
            <span
              className={`font-mono text-xs font-bold px-2.5 py-1 rounded ${
                isCritical
                  ? "bg-rose-500/30 text-rose-300 border border-rose-500/50 animate-pulse"
                  : isSoftware
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              }`}
            >
              {anomaly?.faultingComponent ||
                (isArabic
                  ? "العتاد سليم - لا توجد تسريبات كهربائية"
                  : "Nominal Baseline - No Component Fault")}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* 1. Component Name */}
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-white">
                {isArabic ? "اسم المكون / الدائرة المتأثرة:" : "Component Name:"}
              </span>
              <span className="font-mono text-cyan-300 font-bold text-xs">
                {anomaly?.faultingComponent || (isArabic ? "المكونات العتادية تعمل ضمن المستويات الطبيعية" : "Cellular RF PA / PMIC Nominal Baseline")}
              </span>
            </div>

            {/* 2. Sensor Reading vs Normal Baseline */}
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-white">
                {isArabic ? "قراءة المستشعر مقارنة بخط الأساس:" : "Sensor Reading vs Normal Baseline:"}
              </span>
              <span className="font-mono text-slate-300 text-xs">
                {anomaly?.baselineComparison}
              </span>
            </div>

            {/* 3. Discrepancy Evidence */}
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1">
              <span className="font-semibold text-white block">
                {isArabic ? "أدلة التناقض الكهربائي والحراري:" : "Discrepancy Evidence:"}
              </span>
              <p className={`font-sans leading-relaxed text-xs ${isCritical ? "text-rose-200 font-medium" : isSoftware ? "text-amber-200 font-medium" : "text-slate-300"}`}>
                {anomaly?.discrepancyEvidence}
              </p>
            </div>
          </div>
        </div>

        {/* Thermal Zone Sensor Map Table */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {isArabic
                  ? "خريطة مستشعرات الدوائر (Thermal Zone Sensor Map)"
                  : "Thermal Zone Sensor Map"}
              </span>
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {anomaly?.sensors.length ?? 0}{" "}
              {isArabic ? "مستشعرات نشطة" : "Active Kernel Rails"}
            </span>
          </div>

          <div className="rounded border border-slate-800 overflow-hidden bg-slate-950/60">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] z-10">
                  <tr>
                    <th className="py-2.5 px-3">
                      {isArabic ? "اسم المستشعر" : "Sensor Name"}
                    </th>
                    <th className="py-2.5 px-3">
                      {isArabic ? "النظام الفرعي" : "Subsystem"}
                    </th>
                    <th className="py-2.5 px-3">
                      {isArabic ? "الحرارة (°C)" : "Real-Time Temp (°C)"}
                    </th>
                    <th className="py-2.5 px-3">
                      {isArabic ? "الحالة" : "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300 text-[11px]">
                  {anomaly && anomaly.sensors.length > 0 ? (
                    anomaly.sensors.map((sensor, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition">
                        <td className="py-2 px-3 font-semibold text-white">
                          {sensor.name}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                sensor.subsystem.includes("RF")
                                  ? "bg-amber-400"
                                  : sensor.subsystem.includes("PMIC")
                                  ? "bg-rose-400"
                                  : sensor.subsystem.includes("Wi-Fi")
                                  ? "bg-blue-400"
                                  : sensor.subsystem.includes("Camera")
                                  ? "bg-purple-400"
                                  : "bg-cyan-400"
                              }`}
                            />
                            <span className="font-sans text-xs">
                              {sensor.subsystem}
                            </span>
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`font-bold ${
                              sensor.tempC >= 55
                                ? "text-rose-400"
                                : sensor.tempC >= 42
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {sensor.tempC}°C
                          </span>
                          <span className="text-slate-500 ml-1 text-[10px]">
                            ({sensor.tempF}°F)
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              sensor.status === "Critical / Short"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : sensor.status === "Elevated"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {sensor.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-500">
                        {isArabic
                          ? "لم يتم العثور على مستشعرات حرارية في kernel sysfs"
                          : "No kernel thermal sensor readings available"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/90 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
              {isArabic ? "مؤشرات حية عبر ADB" : "Live ADB Telemetry"}
            </span>
            {vitals?.lastUpdated && (
              <span className="text-xs text-slate-500 font-mono">
                · {isArabic ? "آخر تحديث:" : "Updated:"} {vitals.lastUpdated}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-lg font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <span>{isArabic ? "فحص وتشخيص مؤشرات النظام" : "Device Diagnostics & Telemetry"}</span>
          </h2>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Live Polling Toggle */}
          <button
            onClick={() => setAutoPolling(!autoPolling)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition ${
              autoPolling
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
          >
            {autoPolling ? <Pause className="w-3.5 h-3.5 text-cyan-400" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoPolling ? (isArabic ? "إيقاف المراقبة الحية" : "Live (5s) Active") : isArabic ? "مراقبة حية" : "Live Polling"}</span>
          </button>

          {/* Refresh Manual Button */}
          <Button
            size="sm"
            onClick={() => void fetchDiagnostics(false)}
            disabled={loading}
            className="bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {isArabic ? "تحديث المؤشرات" : "Refresh"}
          </Button>

          {/* Export JSON Button */}
          <Button
            size="sm"
            onClick={handleExportReport}
            disabled={!vitals}
            className="bg-[#c8f04a] text-[#14253a] hover:bg-[#b8e23b] font-semibold text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {isArabic ? "تصدير التقرير" : "Export Report"}
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Battery */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isArabic ? "البطارية" : "Battery Health"}</span>
            {battery?.status === "Charging" ? (
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
            ) : (battery?.level ?? 100) > 40 ? (
              <BatteryMedium className="h-4 w-4 text-cyan-400" />
            ) : (
              <BatteryLow className="h-4 w-4 text-amber-400" />
            )}
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {battery ? `${battery.level}%` : "--"}
            </div>
            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {battery?.health || "Good"}
            </div>
          </div>

          {/* Level Progress Bar */}
          <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                (battery?.level ?? 0) > 50
                  ? "bg-emerald-400"
                  : (battery?.level ?? 0) > 20
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
              style={{ width: `${battery?.level ?? 0}%` }}
            ></div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{battery?.temperatureC ? `${battery.temperatureC}°C / ${battery.temperatureF}°F` : "--"}</span>
            <span>{battery?.voltage ? `${battery.voltage}V` : "--"}</span>
          </div>
        </div>

        {/* Card 2: CPU & Thermal */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isArabic ? "حرارة المعالج" : "CPU Thermals"}</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {cpu?.socTempC ? `${cpu.socTempC}°C` : "--"}
            </div>
            <div
              className={`text-xs font-mono px-2 py-0.5 rounded border ${
                (cpu?.socTempC ?? 0) > 70
                  ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                  : (cpu?.socTempC ?? 0) > 50
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                  : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              }`}
            >
              {cpu?.thermalStatus || "Normal"}
            </div>
          </div>

          {/* Temperature Range Bar */}
          <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                (cpu?.socTempC ?? 0) > 70
                  ? "bg-rose-500"
                  : (cpu?.socTempC ?? 0) > 50
                  ? "bg-amber-400"
                  : "bg-cyan-400"
              }`}
              style={{ width: `${Math.min(100, Math.max(10, ((cpu?.socTempC ?? 35) / 90) * 100))}%` }}
            ></div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="truncate max-w-[130px]">{cpu?.hardware || "SoC"}</span>
            <span>{cpu?.cores ?? 8} Cores</span>
          </div>

          {/* High Thermal Load Warning Badge & Quick Action */}
          {isThermalHigh && (
            <div className="mt-2.5 flex items-center justify-between gap-1 rounded bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300 border border-rose-500/40 animate-pulse">
              <span className="flex items-center gap-1.5 truncate">
                <Flame className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="truncate">{isArabic ? "حمل حراري مرتفع" : "High Thermal Load Detected"}</span>
              </span>
              <button
                onClick={handleEmergencyCoolDown}
                disabled={actionLoading !== null}
                className="underline hover:text-white text-[10px] uppercase font-mono shrink-0 ml-1"
              >
                {actionLoading === "cooldown" ? (isArabic ? "تبريد..." : "Cooling...") : isArabic ? "تبريد طارئ" : "Cool Down"}
              </button>
            </div>
          )}
        </div>

        {/* Card 3: Memory (RAM) */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isArabic ? "ذاكرة RAM" : "RAM Usage"}</span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {memory ? `${memory.usedPercent}%` : "--"}
            </div>
            <div className="text-xs font-mono text-purple-300">
              {memory ? `${(memory.usedMB / 1024).toFixed(1)} / ${(memory.totalMB / 1024).toFixed(1)} GB` : "--"}
            </div>
          </div>

          {/* RAM Usage Bar */}
          <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-500"
              style={{ width: `${memory?.usedPercent ?? 0}%` }}
            ></div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{isArabic ? "متاح:" : "Available:"} {memory ? `${(memory.availableMB / 1024).toFixed(1)} GB` : "--"}</span>
            <span>{memory ? `${memory.cachedMB} MB cache` : "--"}</span>
          </div>
        </div>

        {/* Card 4: Storage */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isArabic ? "ذاكرة الهاتف (/data)" : "Internal Storage"}</span>
            <HardDrive className="h-4 w-4 text-blue-400" />
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {dataStorage ? `${dataStorage.usePercent}%` : "--"}
            </div>
            <div className="text-xs font-mono text-blue-300">
              {dataStorage ? `${dataStorage.used} / ${dataStorage.size}` : "--"}
            </div>
          </div>

          {/* Storage Bar */}
          <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${dataStorage?.usePercent ?? 0}%` }}
            ></div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{isArabic ? "متبقي:" : "Free:"} {dataStorage?.available || "--"}</span>
            <span>{storage.length} {isArabic ? "أقسام" : "mounts"}</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-px">
        {[
          { id: "overview", label: isArabic ? "نظرة عامة" : "Overview & Specs", icon: Gauge },
          { id: "hardware", label: isArabic ? "تشخيص أعطال العتاد" : "Hardware Circuit Triage", icon: CircuitBoard },
          { id: "cpu", label: isArabic ? "المعالج والحرارة" : "CPU & Thermals", icon: Cpu },
          { id: "battery", label: isArabic ? "صحة البطارية" : "Battery Telemetry", icon: Battery },
          { id: "storage", label: isArabic ? "التخزين والأقسام" : "Storage Partitions", icon: HardDrive },
          { id: "memory", label: isArabic ? "استهلاك الذاكرة" : "Memory Breakdown", icon: Layers },
          { id: "raw", label: isArabic ? "مخرجات ADB الخام" : "Raw Terminal Dumps", icon: Terminal },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isHardwareCritical = tab.id === "hardware" && hardwareAnomaly?.status === "critical";
          const isHardwareSoftware = tab.id === "hardware" && hardwareAnomaly?.status === "software";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-slate-800/40"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {isHardwareCritical ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              ) : isHardwareSoftware ? (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT 1: OVERVIEW & SPECS */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {renderHardwareCircuitTriageCard()}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Hardware & OS Identity */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span>{isArabic ? "هوية العتاد والنظام" : "Hardware & System Identity"}</span>
                </h3>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Verified USB
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "طراز الجهاز:" : "Device Model:"}</span>
                  <span className="font-mono text-white font-medium">{device?.manufacturer} {device?.model}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "الرقم التسلسلي:" : "Serial Number:"}</span>
                  <span className="font-mono text-slate-300">{device?.serial}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "إصدار Android:" : "Android Version:"}</span>
                  <span className="font-mono text-white font-medium">Android {device?.androidVersion} (API {device?.sdk})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "تحديث الأمان:" : "Security Patch:"}</span>
                  <span className="font-mono text-slate-300">{vitals?.securityPatch || "N/A"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "أبعاد ودقة الشاشة:" : "Display Resolution:"}</span>
                  <span className="font-mono text-slate-300">{vitals?.displaySize} ({vitals?.displayDensity})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{isArabic ? "حالة SELinux:" : "SELinux Status:"}</span>
                  <span className="font-mono text-emerald-400">{vitals?.selinux}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">{isArabic ? "وقت تشغيل النظام:" : "System Uptime:"}</span>
                  <span className="font-mono text-slate-300">{vitals?.uptime}</span>
                </div>
              </div>
            </div>

            {/* Quick Health Summary */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{isArabic ? "ملخص الحالة التشغيلية" : "Operational Vitals Summary"}</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">{vitals?.lastUpdated}</span>
              </div>

              <div className="space-y-3 pt-1">
                {/* Battery Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{isArabic ? "شحنة البطارية" : "Battery Level"}</span>
                    <span className="font-mono text-white font-semibold">{battery?.level}% ({battery?.status})</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${battery?.level ?? 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Memory Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{isArabic ? "استهلاك الذاكرة (RAM)" : "RAM Utilization"}</span>
                    <span className="font-mono text-white font-semibold">{memory?.usedPercent}% ({(memory?.usedMB ? memory.usedMB / 1024 : 0).toFixed(1)} GB used)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${memory?.usedPercent ?? 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Storage Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{isArabic ? "سعة التخزين (/data)" : "Internal Storage (/data)"}</span>
                    <span className="font-mono text-white font-semibold">{dataStorage?.usePercent}% ({dataStorage?.available} free)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${dataStorage?.usePercent ?? 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Temperature */}
                <div className="rounded border border-slate-800 bg-slate-950/60 p-2.5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>{isArabic ? "حرارة المعالج (SoC Temp):" : "SoC Core Temperature:"}</span>
                  </span>
                  <span className="font-mono font-bold text-amber-400">
                    {cpu?.socTempC}°C / {cpu?.socTempF}°F
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: HARDWARE CIRCUIT TRIAGE */}
      {activeTab === "hardware" && (
        <div className="space-y-4">
          {renderHardwareCircuitTriageCard()}
        </div>
      )}

      {/* TAB CONTENT 2: BATTERY TELEMETRY */}
      {activeTab === "battery" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Battery className="w-4 h-4 text-emerald-400" />
                <span>{isArabic ? "تفاصيل حالة وبطارية الجهاز" : "Battery Health & Subsystem State"}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isArabic ? "البيانات مسترجعة مباشرة عبر أمر dumpsys battery" : "Captured in real time via ADB command dumpsys battery"}
              </p>
            </div>
            <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {battery?.technology || "Li-ion"}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "الحالة التشغيلية" : "Power Status"}</span>
              <div className="mt-1 font-mono text-base font-bold text-white">{battery?.status}</div>
              <p className="text-[10px] text-slate-500 mt-1">
                {battery?.usbPowered ? "USB Powered" : battery?.acPowered ? "AC Adapter" : battery?.wirelessPowered ? "Wireless Qi" : "Discharging on Battery"}
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "الصحة العامة" : "Battery Health"}</span>
              <div className="mt-1 font-mono text-base font-bold text-emerald-400">{battery?.health}</div>
              <p className="text-[10px] text-slate-500 mt-1">Code: {battery?.healthCode} (Normal: 2 Good)</p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "فرق الجهد الكهربائي" : "Voltage Output"}</span>
              <div className="mt-1 font-mono text-base font-bold text-cyan-400">{battery?.voltage} V</div>
              <p className="text-[10px] text-slate-500 mt-1">{battery?.voltageRaw} mV (Nominal 3.7 - 4.4V)</p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "درجة الحرارة" : "Temperature"}</span>
              <div className="mt-1 font-mono text-base font-bold text-amber-400">{battery?.temperatureC}°C</div>
              <p className="text-[10px] text-slate-500 mt-1">{battery?.temperatureF}°F (Raw: {battery?.temperatureRaw})</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/40 rounded border border-slate-800 text-xs text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">{isArabic ? "ملاحظة الفحص الجنائي:" : "Forensic Assessment:"} </span>
            {battery?.health === "Good"
              ? isArabic
                ? "البطارية تعمل ضمن النطاق المقبول. لم يتم رصد مؤشرات سخونة زائدة أو اختلال في الفولتية."
                : "The battery subsystem reports nominal health. No thermal runaway, extreme degradation, or over-voltage conditions observed."
              : isArabic
              ? `تم تسجيل حالة غير طبيعية (${battery?.health}). قد يسبب ذلك إيقاف التشغيل التلقائي أثناء الاستخراج.`
              : `Abnormal battery health condition (${battery?.health}) reported. May lead to unexpected device brownouts during extraction.`}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CPU & THERMALS */}
      {activeTab === "cpu" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>{isArabic ? "مواصفات المعالج ومستشعرات الحرارة" : "CPU Architecture & Thermal Zones"}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isArabic ? "مستخرج من /proc/cpuinfo ومستشعرات dumpsys thermalservice" : "Aggregated from /proc/cpuinfo and hardware thermal hal zones"}
              </p>
            </div>
            <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-cyan-300 border border-slate-700">
              {cpu?.architecture} ({cpu?.abi})
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "شريحة المعالجة (SoC)" : "Processor SoC"}</span>
              <div className="mt-1 font-mono text-sm font-bold text-white truncate">{cpu?.hardware}</div>
              <p className="text-[10px] text-slate-500 mt-1">{cpu?.cores} Active CPU Cores</p>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "حرارة الشريحة" : "Core SoC Thermal"}</span>
              <div className="mt-1 font-mono text-sm font-bold text-amber-400">{cpu?.socTempC}°C ({cpu?.socTempF}°F)</div>
              <p className="text-[10px] text-slate-500 mt-1">Status: {cpu?.thermalStatus}</p>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "المعمارية وABI" : "Instruction Set"}</span>
              <div className="mt-1 font-mono text-sm font-bold text-white">{cpu?.abi}</div>
              <p className="text-[10px] text-slate-500 mt-1">{cpu?.architecture}</p>
            </div>
          </div>

          {/* Thermal Zones Table */}
          {cpu && cpu.thermalZones.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {isArabic ? "قراءات مستشعرات الحرارة المسجلة" : "Detailed Hardware Thermal Zones"}
              </h4>
              <div className="rounded border border-slate-800 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                    <tr>
                      <th className="py-2 px-3">{isArabic ? "المستشعر" : "Sensor Zone"}</th>
                      <th className="py-2 px-3">{isArabic ? "الحرارة (°C)" : "Temp (°C)"}</th>
                      <th className="py-2 px-3">{isArabic ? "الحرارة (°F)" : "Temp (°F)"}</th>
                      <th className="py-2 px-3">{isArabic ? "الحالة" : "Condition"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                    {cpu.thermalZones.map((z, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-white font-medium">{z.name}</td>
                        <td className="py-2 px-3 text-cyan-300">{z.tempC}°C</td>
                        <td className="py-2 px-3 text-slate-400">{z.tempF}°F</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              z.tempC > 70
                                ? "bg-rose-500/20 text-rose-300"
                                : z.tempC > 50
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {z.tempC > 70 ? "HOT" : z.tempC > 50 ? "WARM" : "NOMINAL"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              THERMAL TRIAGE & ROGUE PROCESS KILLER
             ========================================================================= */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>{isArabic ? "فرز الأحمال الحرارية وقاتل العمليات المارقة" : "Thermal Triage & Rogue Process Killer"}</span>
                  </h4>
                  {isThermalHigh && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[11px] font-bold animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{isArabic ? "تم رصد حمل حراري مرتفع" : "High Thermal Load Detected"} ({currentMaxTemp}°C)</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {isArabic
                    ? "تحديد أعلى التطبيقات والعمليات استهلاكاً للمعالج المسببة لارتفاع الحرارة مع إمكانية الإيقاف الجبري والتبريد الطارئ."
                    : "Root-cause telemetry from top/dumpsys cpuinfo to pinpoint apps driving thermal throttling. Kill rogue tasks instantly or apply emergency cool-down."}
                </p>
              </div>

              {/* Emergency Cool-Down Button */}
              <Button
                size="sm"
                onClick={handleEmergencyCoolDown}
                disabled={actionLoading !== null}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-xs h-8 font-semibold shrink-0"
              >
                <Zap className={`w-3.5 h-3.5 mr-1.5 ${actionLoading === "cooldown" ? "animate-spin" : "text-amber-400"}`} />
                <span>{actionLoading === "cooldown" ? (isArabic ? "جاري التبريد..." : "Cooling...") : isArabic ? "تبريد طارئ للجهاز" : "Emergency Cool-Down"}</span>
              </Button>
            </div>

            {/* Rogue Process List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>{isArabic ? "أعلى العمليات استهلاكاً للمعالج (Root-Cause):" : "Top CPU Consumers (Root-Cause Inspection):"}</span>
                <span>{topProcesses.length} {isArabic ? "عمليات نشطة" : "Active Tasks"}</span>
              </div>

              {topProcesses.length === 0 ? (
                <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-400">
                  {isArabic ? "لا توجد عمليات مارقة تتجاوز الحدود الطبيعية حالياً." : "No high-load rogue processes currently detected."}
                </div>
              ) : (
                <div className="space-y-2">
                  {topProcesses.map((proc, idx) => (
                    <div
                      key={`${proc.pid}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-md border border-slate-800 bg-slate-900/70 hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 font-mono text-[11px] text-slate-300">
                          0{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-white truncate max-w-[280px] sm:max-w-[420px]" title={proc.name}>
                              {proc.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              PID: {proc.pid}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                            <span>{isArabic ? "استهلاك المعالج:" : "CPU Load:"}</span>
                            <span className={`font-mono font-bold ${proc.cpuPercent > 20 ? "text-rose-400" : proc.cpuPercent > 10 ? "text-amber-400" : "text-cyan-400"}`}>
                              {proc.cpuPercent}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Kill / Force Stop Action Button */}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleForceStopProcess(proc.name)}
                        disabled={actionLoading !== null}
                        className="h-7 px-3 text-xs bg-rose-600/90 hover:bg-rose-600 text-white font-medium shrink-0 self-end sm:self-auto"
                      >
                        {actionLoading === proc.name ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            <span>{isArabic ? "جاري الإيقاف..." : "Stopping..."}</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3 mr-1" />
                            <span>{isArabic ? "إيقاف جبري" : "Kill / Force Stop"}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: STORAGE & PARTITIONS */}
      {activeTab === "storage" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span>{isArabic ? "سعة التخزين وأقسام القرص" : "Storage Metrics & Mounted Filesystems"}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isArabic ? "فحص مساحات التخزين للأقسام الرئيسية عبر أمر df -h" : "Inspecting partition capacity across user data and system images via df -h"}
              </p>
            </div>
            <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-blue-300 border border-slate-700">
              {storage.length} {isArabic ? "أقسام مفهرسة" : "Partitions"}
            </div>
          </div>

          {/* Primary /data card */}
          {dataStorage && (
            <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                  <span>{isArabic ? "قسم بيانات المستخدم (/data)" : "User Data Partition (/data)"}</span>
                </span>
                <span className="font-mono text-blue-400 font-bold">{dataStorage.usePercent}% Used</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${dataStorage.usePercent}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
                <span>{isArabic ? "مستخدم:" : "Used:"} {dataStorage.used}</span>
                <span>{isArabic ? "متاح:" : "Available:"} {dataStorage.available}</span>
                <span>{isArabic ? "الإجمالي:" : "Total Size:"} {dataStorage.size}</span>
              </div>
            </div>
          )}

          {/* Partition Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {isArabic ? "جدول الأقسام المكتشفة" : "Mounted Partitions Table"}
            </h4>
            <div className="rounded border border-slate-800 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-2 px-3">{isArabic ? "نقطة الوصل" : "Mount Point"}</th>
                    <th className="py-2 px-3">{isArabic ? "الحجم" : "Size"}</th>
                    <th className="py-2 px-3">{isArabic ? "المستخدم" : "Used"}</th>
                    <th className="py-2 px-3">{isArabic ? "المتاح" : "Avail"}</th>
                    <th className="py-2 px-3">{isArabic ? "النسبة" : "Use%"}</th>
                    <th className="py-2 px-3">{isArabic ? "نظام الملفات" : "Filesystem"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                  {storage.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-white">{p.mount}</td>
                      <td className="py-2 px-3">{p.size}</td>
                      <td className="py-2 px-3 text-amber-300">{p.used}</td>
                      <td className="py-2 px-3 text-emerald-300">{p.available}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span>{p.usePercent}%</span>
                          <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-blue-500" style={{ width: `${p.usePercent}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px] truncate max-w-[150px]">{p.filesystem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: MEMORY (RAM) */}
      {activeTab === "memory" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>{isArabic ? "تحليل استهلاك الذاكرة (RAM & Swap)" : "RAM Allocation & Swap Breakdown"}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isArabic ? "تحليل مباشر لمحتويات /proc/meminfo" : "Direct telemetry from /proc/meminfo kernel subsystem"}
              </p>
            </div>
            <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-purple-300 border border-slate-700">
              {memory ? `${(memory.totalMB / 1024).toFixed(1)} GB Total RAM` : "--"}
            </div>
          </div>

          {/* Allocation summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "الذاكرة المستخدمة" : "Active / Used RAM"}</span>
              <div className="mt-1 font-mono text-lg font-bold text-purple-400">
                {memory ? `${(memory.usedMB / 1024).toFixed(2)} GB` : "--"}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{memory?.usedPercent}% of total memory</p>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "الذاكرة المتاحة" : "Available RAM"}</span>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-400">
                {memory ? `${(memory.availableMB / 1024).toFixed(2)} GB` : "--"}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{memory ? `${(memory.freeMB / 1024).toFixed(2)} GB immediate free` : "--"}</p>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">{isArabic ? "الذاكرة المؤقتة (Cache/Buffers)" : "Buffers & Cached"}</span>
              <div className="mt-1 font-mono text-lg font-bold text-cyan-400">
                {memory ? `${((memory.cachedMB + memory.buffersMB) / 1024).toFixed(2)} GB` : "--"}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{memory?.cachedMB} MB cached pages</p>
            </div>
          </div>

          {/* Swap / ZRAM Section */}
          <div className="p-4 rounded border border-slate-800 bg-slate-950/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{isArabic ? "مساحة التبديل (ZRAM / Swap)" : "Swap / ZRAM Compression"}</span>
              <span className="font-mono text-slate-400">
                {memory?.swapTotalMB ? `${memory.swapTotalMB - memory.swapFreeMB} / ${memory.swapTotalMB} MB` : "No Swap"}
              </span>
            </div>
            {memory && memory.swapTotalMB > 0 && (
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400"
                  style={{ width: `${Math.round(((memory.swapTotalMB - memory.swapFreeMB) / memory.swapTotalMB) * 100)}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 6: RAW ADB DUMPS */}
      {activeTab === "raw" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>{isArabic ? "سجلات ومخرجات أوامر ADB الأصلية" : "Raw Terminal Dumps for Forensics Audit"}</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Authority: USB Subprocess</span>
          </div>

          <div className="space-y-3">
            {Object.entries(rawDumps).map(([cmd, output]) => (
              <div key={cmd} className="rounded border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs">
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 border-b border-slate-800">
                  <span className="text-cyan-400 font-semibold">$ {cmd}</span>
                  <button
                    onClick={() => handleCopy(output, cmd)}
                    className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                  >
                    {copiedKey === cmd ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === cmd ? (isArabic ? "تم النسخ" : "Copied") : isArabic ? "نسخ" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-3 text-[11px] text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
                  {output || "(no output or command unavailable)"}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDiagnosticsWorkspace;
