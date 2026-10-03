import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { BrowserAdbClient } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Network,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Globe,
  Lock,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Server,
  Activity,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  SlidersHorizontal,
  ChevronRight,
  Database,
  Ban,
  Check,
  Zap,
} from "lucide-react";
import {
  recordNetworkAuditSnapshot,
  lookupAppLabel,
  type NetworkSocketAuditItem,
  type NetworkSocketAuditSnapshot,
} from "@/services/forensicAuditService";

export interface NetworkPrivacyWorkspaceProps {
  client: BrowserAdbClient | null;
  isConnected: boolean;
  language?: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    serial?: string;
  } | null;
}

// TCP connection states mapping from Linux kernel /proc/net/tcp
export const TCP_STATES: Record<string, string> = {
  "01": "ESTABLISHED",
  "02": "SYN_SENT",
  "03": "SYN_RECV",
  "04": "FIN_WAIT1",
  "05": "FIN_WAIT2",
  "06": "TIME_WAIT",
  "07": "CLOSE",
  "08": "CLOSE_WAIT",
  "09": "LAST_ACK",
  "0A": "LISTEN",
  "0B": "CLOSING",
};

// Standard Android & Linux System UIDs
export const SYSTEM_UID_MAP: Record<number, { packageId: string; appLabel: string }> = {
  0: { packageId: "kernel.root", appLabel: "Linux Kernel / Root Daemon" },
  1000: { packageId: "android.system", appLabel: "Android System Server" },
  1001: { packageId: "com.android.phone", appLabel: "Telephony & Cellular RIL" },
  1002: { packageId: "com.android.bluetooth", appLabel: "Bluetooth Service" },
  1010: { packageId: "com.android.wifi", appLabel: "Wi-Fi Core Service" },
  1013: { packageId: "android.media", appLabel: "Media Server & Codecs" },
  1020: { packageId: "com.android.dhcp", appLabel: "DHCP Client Daemon" },
  1021: { packageId: "com.android.dns", appLabel: "DNS Resolver Daemon" },
  1073: { packageId: "com.android.networkstack", appLabel: "Android Network Stack" },
  2000: { packageId: "com.android.shell", appLabel: "ADB Shell Subsystem" },
  9999: { packageId: "nobody", appLabel: "Unprivileged Nobody" },
};

/**
 * Decodes little-endian 8-hex-char IPv4 string into dotted-decimal format
 * E.g. "0100007F" -> "127.0.0.1", "6401A8C0" -> "192.168.1.100"
 */
export function decodeHexIpv4(hex: string): string {
  if (!hex || hex.length !== 8) return hex || "0.0.0.0";
  const o1 = parseInt(hex.substring(6, 8), 16);
  const o2 = parseInt(hex.substring(4, 6), 16);
  const o3 = parseInt(hex.substring(2, 4), 16);
  const o4 = parseInt(hex.substring(0, 2), 16);
  if (isNaN(o1) || isNaN(o2) || isNaN(o3) || isNaN(o4)) return hex;
  return `${o1}.${o2}.${o3}.${o4}`;
}

/**
 * Decodes little-endian 32-hex-char IPv6 string into compressed standard notation
 */
export function decodeHexIpv6(hex: string): string {
  if (!hex || hex.length !== 32) return hex || "::";
  if (/^0{32}$/.test(hex)) return "::";
  if (hex === "00000000000000000000000001000000") return "::1";

  const bytes: number[] = [];
  // 4 words of 8 hex characters each
  for (let w = 0; w < 4; w++) {
    const wordHex = hex.substring(w * 8, (w + 1) * 8);
    // Bytes inside each word are in little-endian order
    bytes.push(
      parseInt(wordHex.substring(6, 8), 16),
      parseInt(wordHex.substring(4, 6), 16),
      parseInt(wordHex.substring(2, 4), 16),
      parseInt(wordHex.substring(0, 2), 16)
    );
  }

  // Check for IPv4-mapped IPv6: ::ffff:x.x.x.x
  const isIpv4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 255 &&
    bytes[11] === 255;
  if (isIpv4Mapped) {
    return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }

  // Convert 16 bytes to 8 16-bit words
  const words: number[] = [];
  for (let i = 0; i < 16; i += 2) {
    words.push((bytes[i] << 8) | bytes[i + 1]);
  }

  return words.map((w) => w.toString(16)).join(":");
}

/**
 * Parses hex port string into integer (e.g. "0050" -> 80)
 */
export function decodeHexPort(hex: string): number {
  return parseInt(hex, 16) || 0;
}

/**
 * Checks whether an IP address belongs to loopback or local subnet
 */
export function isLocalOrLoopback(ip: string): boolean {
  if (!ip) return true;
  if (ip === "0.0.0.0" || ip === "127.0.0.1" || ip === "::" || ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc00:")) return true;
  return false;
}

/**
 * Classifies socket telemetry & privacy risks
 */
export function classifySocket(
  packageName: string,
  remoteIp: string,
  remotePort: number,
  state: string
): {
  tag: "OEM Telemetry" | "Cloud Sync" | "Loopback / IPC" | "External WAN" | "Suspicious Remote Port" | "LAN / Local";
  isSuspicious: boolean;
} {
  const isLocal = isLocalOrLoopback(remoteIp);

  if (state === "LISTEN" || remoteIp === "0.0.0.0" || remoteIp === "::") {
    return { tag: "Loopback / IPC", isSuspicious: false };
  }

  if (remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp.startsWith("127.")) {
    return { tag: "Loopback / IPC", isSuspicious: false };
  }

  if (isLocal) {
    return { tag: "LAN / Local", isSuspicious: false };
  }

  const pkg = (packageName || "").toLowerCase();

  // Suspicious non-standard remote ports
  const suspiciousPorts = [6667, 31337, 4444, 5555, 2222, 1337, 8888, 9999];
  if (suspiciousPorts.includes(remotePort)) {
    return { tag: "Suspicious Remote Port", isSuspicious: true };
  }

  // OEM Telemetry patterns
  const isOemTelemetry =
    pkg.includes("telemetry") ||
    pkg.includes("analytic") ||
    pkg.includes("diagmon") ||
    pkg.includes("scloud") ||
    pkg.includes("smartswitch") ||
    pkg.includes("msa") ||
    pkg.includes("joyose") ||
    pkg.includes("hwanalytics") ||
    pkg.includes("heytap") ||
    pkg.includes("coloros") ||
    pkg.includes("crashlytics") ||
    pkg.includes("adjust") ||
    pkg.includes("appsflyer") ||
    pkg.startsWith("com.sec.android.diagmon") ||
    pkg.startsWith("com.miui.analytics") ||
    pkg.startsWith("com.xiaomi.joyose") ||
    pkg.startsWith("com.huawei.hiview") ||
    (pkg.startsWith("com.google.android.gms") && remotePort === 443 && !pkg.includes("sync"));

  if (isOemTelemetry) {
    return { tag: "OEM Telemetry", isSuspicious: true };
  }

  // Cloud Sync patterns
  const isCloudSync =
    pkg.includes("sync") ||
    pkg.includes("photos") ||
    pkg.includes("drive") ||
    pkg.includes("dropbox") ||
    pkg.includes("skydrive") ||
    pkg.includes("cloud") ||
    pkg.includes("backup") ||
    pkg.startsWith("com.whatsapp") ||
    pkg.startsWith("org.telegram");

  if (isCloudSync) {
    return { tag: "Cloud Sync", isSuspicious: false };
  }

  // Generic external connection
  const isNonStandardWanPort = remotePort !== 80 && remotePort !== 443 && remotePort !== 853 && remotePort !== 5228 && remotePort !== 5229 && remotePort !== 5230;

  return {
    tag: isNonStandardWanPort ? "Suspicious Remote Port" : "External WAN",
    isSuspicious: isNonStandardWanPort,
  };
}

export const NetworkPrivacyWorkspace: React.FC<NetworkPrivacyWorkspaceProps> = ({
  client,
  isConnected,
  language = "en",
  device,
}) => {
  const isArabic = language === "ar";

  // Polling & state
  const [pollingRate, setPollingRate] = useState<number>(3000); // 3000, 5000, 0 (manual)
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);

  // Sockets & Package UIDs
  const [sockets, setSockets] = useState<NetworkSocketAuditItem[]>([]);
  const [uidMap, setUidMap] = useState<Map<number, { packageId: string; appLabel: string }>>(new Map());
  const [uidMapLoaded, setUidMapLoaded] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | "ESTABLISHED" | "LISTEN" | "SUSPICIOUS">("ALL");

  // Privacy Hardening Status & Controls
  const [hardeningExecuting, setHardeningExecuting] = useState<string | null>(null);
  const [privateDnsProvider, setPrivateDnsProvider] = useState("dns.quad9.net");
  const [customDnsHost, setCustomDnsHost] = useState("");
  const [currentDnsMode, setCurrentDnsMode] = useState<string | null>(null);
  const [currentDnsHost, setCurrentDnsHost] = useState<string | null>(null);
  const [backgroundDataRestricted, setBackgroundDataRestricted] = useState<boolean | null>(null);
  const [masterSyncStatus, setMasterSyncStatus] = useState<string | null>(null);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch & parse package UIDs (pm list packages -U)
  const refreshUidMapping = useCallback(async () => {
    if (!client || !isConnected) return;
    try {
      const res = await client.run("pm list packages -U");
      if (res.exitCode === 0 && res.stdout) {
        const nextMap = new Map<number, { packageId: string; appLabel: string }>();
        const lines = res.stdout.split(/[\r\n]+/);
        for (const line of lines) {
          const match = line.match(/^package:([^\s]+)\s+uid:([0-9,]+)/);
          if (match) {
            const pkgId = match[1].trim();
            const uids = match[2].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
            const humanLabel = lookupAppLabel(pkgId);
            for (const uid of uids) {
              if (!nextMap.has(uid)) {
                nextMap.set(uid, { packageId: pkgId, appLabel: humanLabel });
              }
            }
          }
        }
        setUidMap(nextMap);
        setUidMapLoaded(true);
      }
    } catch (err) {
      console.warn("Could not retrieve package UIDs:", err);
    }
  }, [client, isConnected]);

  // 2. Fetch privacy settings status
  const refreshPrivacyStatus = useCallback(async () => {
    if (!client || !isConnected) return;
    try {
      const [dnsModeRes, dnsHostRes, bgRes, syncRes] = await Promise.all([
        client.run("settings get global private_dns_mode").catch(() => ({ stdout: "" })),
        client.run("settings get global private_dns_specifier").catch(() => ({ stdout: "" })),
        client.run("cmd netpolicy get restrict-background").catch(() => ({ stdout: "" })),
        client.run("content call --uri content://sync/settings --method getMasterSyncAutomatically").catch(() => ({ stdout: "" })),
      ]);

      setCurrentDnsMode(dnsModeRes.stdout?.trim() || "off");
      setCurrentDnsHost(dnsHostRes.stdout?.trim() || null);
      if (bgRes.stdout) {
        setBackgroundDataRestricted(bgRes.stdout.toLowerCase().includes("true"));
      }
      if (syncRes.stdout) {
        const syncMatch = syncRes.stdout.match(/boolean=([a-z]+)/i);
        setMasterSyncStatus(syncMatch ? syncMatch[1] : syncRes.stdout.trim());
      }
    } catch {}
  }, [client, isConnected]);

  // 3. Parse active sockets from /proc/net/tcp and /proc/net/tcp6
  const scanSockets = useCallback(async () => {
    if (!client || !isConnected) return;
    setIsScanning(true);

    try {
      const [tcp4Res, tcp6Res] = await Promise.all([
        client.run("cat /proc/net/tcp 2>/dev/null").catch(() => ({ stdout: "" })),
        client.run("cat /proc/net/tcp6 2>/dev/null").catch(() => ({ stdout: "" })),
      ]);

      const parsedSockets: NetworkSocketAuditItem[] = [];

      const parseLines = (raw: string, protocol: "tcp" | "tcp6") => {
        const lines = raw.split(/[\r\n]+/);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const tokens = line.split(/\s+/);
          if (tokens.length < 8) continue;

          // tokens[1] = local_address (HEX:PORT)
          // tokens[2] = rem_address (HEX:PORT)
          // tokens[3] = st (State Hex)
          // tokens[7] = uid
          const localParts = tokens[1].split(":");
          const remParts = tokens[2].split(":");
          const stateHex = tokens[3].toUpperCase();
          const uid = parseInt(tokens[7], 10) || 0;

          if (localParts.length < 2 || remParts.length < 2) continue;

          const localIp = protocol === "tcp" ? decodeHexIpv4(localParts[0]) : decodeHexIpv6(localParts[0]);
          const localPort = decodeHexPort(localParts[1]);
          const remoteIp = protocol === "tcp" ? decodeHexIpv4(remParts[0]) : decodeHexIpv6(remParts[0]);
          const remotePort = decodeHexPort(remParts[1]);
          const state = TCP_STATES[stateHex] || `STATE_${stateHex}`;

          // Direction determination
          let direction: "Inbound" | "Outbound" | "Listening" = "Outbound";
          if (state === "LISTEN" || remoteIp === "0.0.0.0" || remoteIp === "::") {
            direction = "Listening";
          } else if (localPort < 1024 || (localPort < 10000 && remotePort >= 32768)) {
            direction = "Inbound";
          }

          // Lookup Package Name & App Label
          let packageName: string | undefined = undefined;
          let appLabel: string | undefined = undefined;

          if (SYSTEM_UID_MAP[uid]) {
            packageName = SYSTEM_UID_MAP[uid].packageId;
            appLabel = SYSTEM_UID_MAP[uid].appLabel;
          } else if (uidMap.has(uid)) {
            const entry = uidMap.get(uid)!;
            packageName = entry.packageId;
            appLabel = entry.appLabel;
          } else if (uid >= 10000) {
            packageName = `app.uid_${uid}`;
            appLabel = `Android App (UID ${uid})`;
          } else {
            packageName = `system.uid_${uid}`;
            appLabel = `System Daemon (${uid})`;
          }

          const { tag, isSuspicious } = classifySocket(packageName || "", remoteIp, remotePort, state);

          parsedSockets.push({
            protocol,
            localIp,
            localPort,
            remoteIp,
            remotePort,
            state,
            uid,
            packageName,
            appLabel,
            direction,
            isSuspicious,
            classificationTag: tag,
          });
        }
      };

      parseLines(tcp4Res.stdout, "tcp");
      parseLines(tcp6Res.stdout, "tcp6");

      // Sort: Suspicious / ESTABLISHED WAN sockets first, then listening
      parsedSockets.sort((a, b) => {
        if (a.isSuspicious && !b.isSuspicious) return -1;
        if (!a.isSuspicious && b.isSuspicious) return 1;
        if (a.state === "ESTABLISHED" && b.state !== "ESTABLISHED") return -1;
        if (a.state !== "ESTABLISHED" && b.state === "ESTABLISHED") return 1;
        return 0;
      });

      setSockets(parsedSockets);
      const nowIso = new Date().toISOString();
      setLastScannedAt(nowIso);

      // Auto-record snapshot in Forensic Audit Engine for immediate availability
      const established = parsedSockets.filter((s) => s.state === "ESTABLISHED").length;
      const listening = parsedSockets.filter((s) => s.state === "LISTEN").length;
      const suspicious = parsedSockets.filter((s) => s.isSuspicious).length;

      const snapshot: NetworkSocketAuditSnapshot = {
        capturedAt: nowIso,
        totalSockets: parsedSockets.length,
        listeningSockets: listening,
        establishedSockets: established,
        suspiciousCount: suspicious,
        sockets: parsedSockets,
      };

      recordNetworkAuditSnapshot(snapshot);
    } catch (err: any) {
      console.error("Socket inspection error:", err);
    } finally {
      setIsScanning(false);
    }
  }, [client, isConnected, uidMap]);

  // Initial load
  useEffect(() => {
    if (isConnected && client) {
      void refreshUidMapping();
      void refreshPrivacyStatus();
    }
  }, [isConnected, client, refreshUidMapping, refreshPrivacyStatus]);

  // Once UID mapping is loaded or changed, perform initial socket scan
  useEffect(() => {
    if (isConnected && client) {
      void scanSockets();
    }
  }, [isConnected, client, uidMapLoaded, scanSockets]);

  // Polling interval manager with clean unmount handling
  useEffect(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (pollingRate > 0 && isConnected && client) {
      pollingTimerRef.current = setInterval(() => {
        void scanSockets();
      }, pollingRate);
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [pollingRate, isConnected, client, scanSockets]);

  // Manual snapshot button to push to forensic engine
  const handlePushForensicSnapshot = () => {
    if (sockets.length === 0) {
      toast.error(isArabic ? "لا توجد اتصالات مسجلة لحفظها" : "No active sockets to record in forensic ledger");
      return;
    }
    const established = sockets.filter((s) => s.state === "ESTABLISHED").length;
    const listening = sockets.filter((s) => s.state === "LISTEN").length;
    const suspicious = sockets.filter((s) => s.isSuspicious).length;

    const snapshot: NetworkSocketAuditSnapshot = {
      capturedAt: new Date().toISOString(),
      totalSockets: sockets.length,
      listeningSockets: listening,
      establishedSockets: established,
      suspiciousCount: suspicious,
      sockets: [...sockets],
    };

    recordNetworkAuditSnapshot(snapshot);
    toast.success(
      isArabic
        ? `تم تضمين لقطة الشبكة (${sockets.length} مقبس) في التقرير الجنائي المشفر`
        : `Network snapshot (${sockets.length} sockets) verified & anchored in forensic audit dossier`
    );
  };

  // Instant App Isolation
  const isolateApp = async (pkg: string, appName: string) => {
    if (!client || !isConnected) return;
    try {
      const res = await client.run(`cmd appops set ${pkg} RUN_IN_BACKGROUND ignore`);
      if (res.exitCode === 0) {
        toast.success(
          isArabic
            ? `تم عزل التطبيق ${appName}: حظر العمل في الخلفية واستنزاف البيانات`
            : `Isolated ${appName} (${pkg}): Revoked background execution & network operations`
        );
      } else {
        toast.error(res.stderr || "Could not isolate app via appops");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed executing isolation command");
    }
  };

  // Master Privacy Control: 1. Kill Master Sync
  const executeKillMasterSync = async () => {
    if (!client || !isConnected) return;
    setHardeningExecuting("sync");
    try {
      const cmd = "content call --uri content://sync/settings --method setMasterSyncAutomatically --extra boolean:false";
      const res = await client.run(cmd);
      if (res.exitCode === 0) {
        toast.success(
          isArabic
            ? "تم إيقاف المزامنة التلقائية السحابية لجميع الحسابات بنجاح"
            : "Master cloud sync killed. All automatic account synchronization stopped."
        );
        void refreshPrivacyStatus();
      } else {
        toast.error(res.stderr || "Failed disabling master sync");
      }
    } catch (err: any) {
      toast.error(err?.message || "Command error");
    } finally {
      setHardeningExecuting(null);
    }
  };

  // Master Privacy Control: 2. Enforce Private Encrypted DNS
  const executeEnforcePrivateDns = async (providerHost: string) => {
    if (!client || !isConnected) return;
    setHardeningExecuting("dns");
    try {
      const targetHost = providerHost === "custom" ? customDnsHost.trim() : providerHost;
      if (!targetHost) {
        toast.error(isArabic ? "يرجى تحديد عنوان خادم DNS" : "Please specify a DNS hostname");
        setHardeningExecuting(null);
        return;
      }

      await client.run("settings put global private_dns_mode hostname");
      const res = await client.run(`settings put global private_dns_specifier ${targetHost}`);
      if (res.exitCode === 0) {
        toast.success(
          isArabic
            ? `تم فرض تشفير DNS المشفر (DoT) بنجاح عبر: ${targetHost}`
            : `Private encrypted DNS-over-TLS enforced: ${targetHost}`
        );
        void refreshPrivacyStatus();
      } else {
        toast.error(res.stderr || "Failed applying DNS settings");
      }
    } catch (err: any) {
      toast.error(err?.message || "Command error");
    } finally {
      setHardeningExecuting(null);
    }
  };

  // Reset Private DNS to Opportunistic / Automatic
  const executeResetPrivateDns = async () => {
    if (!client || !isConnected) return;
    setHardeningExecuting("dns");
    try {
      await client.run("settings put global private_dns_mode opportunistic");
      await client.run("settings put global private_dns_specifier ''");
      toast.success(isArabic ? "تم إعادة تعيين DNS إلى الوضع التلقائي" : "Private DNS reset to opportunistic automatic mode");
      void refreshPrivacyStatus();
    } catch (err: any) {
      toast.error(err?.message || "Command error");
    } finally {
      setHardeningExecuting(null);
    }
  };

  // Master Privacy Control: 3. Restrict Background Data (Global)
  const executeToggleBackgroundData = async (enable: boolean) => {
    if (!client || !isConnected) return;
    setHardeningExecuting("data");
    try {
      const cmd = `cmd netpolicy set restrict-background ${enable}`;
      const res = await client.run(cmd);
      if (res.exitCode === 0) {
        toast.success(
          enable
            ? isArabic
              ? "تم تقييد بيانات الخلفية عالمياً: حظر الاتصال في وضع الاستعداد"
              : "Global background data restriction enforced across non-whitelisted apps"
            : isArabic
              ? "تم إيقاف تقييد بيانات الخلفية"
              : "Global background data restriction disabled"
        );
        void refreshPrivacyStatus();
      } else {
        toast.error(res.stderr || "Failed toggling netpolicy");
      }
    } catch (err: any) {
      toast.error(err?.message || "Command error");
    } finally {
      setHardeningExecuting(null);
    }
  };

  // Master Privacy Control: 4. Kill OEM Usage Telemetry
  const executeKillOemTelemetry = async () => {
    if (!client || !isConnected) return;
    setHardeningExecuting("telemetry");
    try {
      await client.run("settings put global usage_stats_enabled 0");
      await client.run("settings put secure send_action_app_error 0");
      const res = await client.run("settings put system accelerometer_rotation 0");
      if (res.exitCode === 0) {
        toast.success(
          isArabic
            ? "تم حظر إحصائيات الاستخدام وتقارير أخطاء OEM ومستشعرات التتبع بنجاح"
            : "OEM usage stats, crash telemetry, and exfiltration triggers disabled"
        );
      } else {
        toast.error("Some settings returned an error");
      }
    } catch (err: any) {
      toast.error(err?.message || "Command error");
    } finally {
      setHardeningExecuting(null);
    }
  };

  // Filtered sockets calculation
  const filteredSockets = useMemo(() => {
    let list = sockets;

    if (stateFilter === "ESTABLISHED") {
      list = list.filter((s) => s.state === "ESTABLISHED");
    } else if (stateFilter === "LISTEN") {
      list = list.filter((s) => s.state === "LISTEN");
    } else if (stateFilter === "SUSPICIOUS") {
      list = list.filter((s) => s.isSuspicious || s.classificationTag === "OEM Telemetry");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.appLabel && s.appLabel.toLowerCase().includes(q)) ||
          (s.packageName && s.packageName.toLowerCase().includes(q)) ||
          s.localIp.includes(q) ||
          s.remoteIp.includes(q) ||
          String(s.remotePort).includes(q) ||
          String(s.localPort).includes(q) ||
          s.state.toLowerCase().includes(q) ||
          s.classificationTag.toLowerCase().includes(q)
      );
    }

    return list;
  }, [sockets, stateFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = sockets.length;
    const established = sockets.filter((s) => s.state === "ESTABLISHED").length;
    const listening = sockets.filter((s) => s.state === "LISTEN").length;
    const suspicious = sockets.filter((s) => s.isSuspicious).length;
    const telemetry = sockets.filter((s) => s.classificationTag === "OEM Telemetry").length;
    const cloudSync = sockets.filter((s) => s.classificationTag === "Cloud Sync").length;
    return { total, established, listening, suspicious, telemetry, cloudSync };
  }, [sockets]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#14253a] text-[#c8f04a] flex items-center justify-center font-bold">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "مفتش اتصالات الشبكة وتحصين الخصوصية" : "Live Network Sockets & Privacy Hardening"}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#f4ede2] dark:bg-slate-800 text-[#534335] dark:text-slate-300 border border-[#d8d1c4] dark:border-slate-700">
                  06 NETWORK
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                    isConnected
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
                  />
                  <span>{isConnected ? (isArabic ? "مباشر" : "LIVE C2 RECON") : isArabic ? "غير متصل" : "DISCONNECTED"}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isArabic
                  ? "تحليل مقابس الشبكة في الوقت الفعلي وفك شفرات IP وترميزات OEM مع تحصين ضد تسريب البيانات"
                  : "Kernel TCP socket inspection, Little-Endian IP decoder, OEM telemetry triage & exfiltration controls"}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Polling Selector */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-xs">
              <span className="text-[10px] text-slate-500 px-1 font-mono uppercase">
                {isArabic ? "المزامنة:" : "Poll:"}
              </span>
              <button
                onClick={() => setPollingRate(3000)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  pollingRate === 3000
                    ? "bg-[#14253a] text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                3s
              </button>
              <button
                onClick={() => setPollingRate(5000)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  pollingRate === 5000
                    ? "bg-[#14253a] text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                5s
              </button>
              <button
                onClick={() => setPollingRate(0)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  pollingRate === 0
                    ? "bg-[#14253a] text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {isArabic ? "يدوي" : "Off"}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={scanSockets}
              disabled={isScanning || !isConnected}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-cyan-500" : ""}`} />
              <span>{isArabic ? "تحديث الآن" : "Scan Now"}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handlePushForensicSnapshot}
              disabled={sockets.length === 0}
              className="bg-[#274b35] hover:bg-[#1e3c29] text-white text-xs gap-1.5 shadow-xs"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>{isArabic ? "تثبيت بالتقرير الجنائي" : "Snapshot to Forensic"}</span>
            </Button>
          </div>
        </div>

        {/* Vital Metrics Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 font-mono text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/80">
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              {isArabic ? "إجمالي المقابس" : "Total Sockets"}
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.total}</span>
            <span className="text-[10px] text-slate-400 block font-sans">/proc/net/tcp</span>
          </div>

          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase block font-sans">
              {isArabic ? "اتصالات نشطة" : "Established"}
            </span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.established}</span>
            <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 block font-sans">
              Active TCP pipes
            </span>
          </div>

          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/50">
            <span className="text-[10px] text-blue-700 dark:text-blue-400 uppercase block font-sans">
              {isArabic ? "منافذ تستمع" : "Listening Ports"}
            </span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.listening}</span>
            <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 block font-sans">Open daemons</span>
          </div>

          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/50">
            <span className="text-[10px] text-amber-700 dark:text-amber-400 uppercase block font-sans">
              {isArabic ? "تتبع المصنّع" : "OEM Telemetry"}
            </span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.telemetry}</span>
            <span className="text-[10px] text-amber-600/70 dark:text-amber-400/70 block font-sans">Manufacturer metrics</span>
          </div>

          <div className="p-3 bg-sky-50/60 dark:bg-sky-950/30 rounded-lg border border-sky-200 dark:border-sky-900/50">
            <span className="text-[10px] text-sky-700 dark:text-sky-400 uppercase block font-sans">
              {isArabic ? "مزامنة سحابية" : "Cloud Sync"}
            </span>
            <span className="text-lg font-bold text-sky-600 dark:text-sky-400">{stats.cloudSync}</span>
            <span className="text-[10px] text-sky-600/70 dark:text-sky-400/70 block font-sans">Background sync</span>
          </div>

          <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-900/50">
            <span className="text-[10px] text-rose-700 dark:text-rose-400 uppercase block font-sans">
              {isArabic ? "نقاط مشبوهة" : "Flagged Suspicious"}
            </span>
            <span className="text-lg font-bold text-rose-600 dark:text-rose-400">{stats.suspicious}</span>
            <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70 block font-sans">Non-standard WAN</span>
          </div>
        </div>
      </div>

      {/* 2. Master Privacy & Anti-Exfiltration Controls Panel */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isArabic ? "تحصين الخصوصية ومكافحة تسريب البيانات" : "Master Privacy Lockdown & Anti-Exfiltration"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isArabic
                  ? "أوامر فورية لإيقاف التزامن السحابي، وتشفير DNS، وتقييد حزم البيانات، وتعطيل القياس عن بعد"
                  : "Hardware & OS-level exfiltration barriers to immediately shut down unauthorized background communication"}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={refreshPrivacyStatus}
            className="text-xs text-slate-500 hover:text-slate-800 gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isArabic ? "فحص الحالة" : "Check State"}</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Kill Master Sync */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  1. Master Cloud Sync
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    masterSyncStatus === "false"
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {masterSyncStatus === "false" ? "KILLED" : "ACTIVE"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {isArabic
                  ? "إيقاف المزامنة التلقائية لجميع حسابات Google وSamsung والتطبيقات السحابية فورياً."
                  : "Stops automatic background account sync across Google, Samsung, and messaging services."}
              </p>
            </div>

            <Button
              onClick={executeKillMasterSync}
              disabled={hardeningExecuting === "sync" || !isConnected}
              size="sm"
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{isArabic ? "إيقاف المزامنة السحابية" : "Kill Master Sync"}</span>
            </Button>
          </div>

          {/* Card 2: Enforce Private Encrypted DNS */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  2. Encrypted DNS (DoT)
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    currentDnsMode === "hostname"
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {currentDnsMode === "hostname" ? "ENFORCED" : "DEFAULT"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                {isArabic
                  ? "تشفير استعلامات DNS عبر TLS لحجب تتبع مزودي الإنترنت وحظر نطاقات الإعلانات."
                  : "Enforces DNS-over-TLS to prevent ISP snooping and block telemetry domains."}
              </p>

              {/* Provider Selection */}
              <div className="space-y-1.5 mb-3">
                <select
                  value={privateDnsProvider}
                  onChange={(e) => setPrivateDnsProvider(e.target.value)}
                  className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                >
                  <option value="dns.quad9.net">Quad9 (Malware Block · DoT)</option>
                  <option value="dns.adguard-dns.com">AdGuard (Ads & Trackers Block)</option>
                  <option value="dns.mullvad.net">Mullvad (Strict Privacy)</option>
                  <option value="1dot1dot1dot1.cloudflare-dns.com">Cloudflare (1.1.1.1)</option>
                  <option value="custom">Custom Hostname</option>
                </select>

                {privateDnsProvider === "custom" && (
                  <input
                    type="text"
                    placeholder="e.g. p2.freedns.controld.com"
                    value={customDnsHost}
                    onChange={(e) => setCustomDnsHost(e.target.value)}
                    className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-1.5">
              <Button
                onClick={() => executeEnforcePrivateDns(privateDnsProvider)}
                disabled={hardeningExecuting === "dns" || !isConnected}
                size="sm"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
              >
                <Lock className="w-3 h-3" />
                <span>{isArabic ? "فرض التشفير" : "Apply DoT"}</span>
              </Button>
              <Button
                onClick={executeResetPrivateDns}
                disabled={hardeningExecuting === "dns" || !isConnected}
                variant="outline"
                size="sm"
                className="text-xs"
                title="Reset to default"
              >
                {isArabic ? "إلغاء" : "Reset"}
              </Button>
            </div>
          </div>

          {/* Card 3: Restrict Background Data */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  3. Restrict Background Data
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    backgroundDataRestricted
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {backgroundDataRestricted ? "RESTRICTED" : "OPEN"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {isArabic
                  ? "قطع الوصول للشبكة عن كافة التطبيقات غير المفتوحة على الشاشة لمنع نقل البيانات خلسة."
                  : "Applies netpolicy restrict-background to freeze socket traffic for idle background apps."}
              </p>
            </div>

            <Button
              onClick={() => executeToggleBackgroundData(!backgroundDataRestricted)}
              disabled={hardeningExecuting === "data" || !isConnected}
              size="sm"
              variant={backgroundDataRestricted ? "outline" : "default"}
              className={`w-full text-xs gap-1.5 ${
                backgroundDataRestricted
                  ? "border-amber-400 text-amber-700 dark:text-amber-300"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>
                {backgroundDataRestricted
                  ? isArabic
                    ? "إلغاء التقييد"
                    : "Lift Restriction"
                  : isArabic
                    ? "تقييد البيانات بالخلفية"
                    : "Restrict Background Data"}
              </span>
            </Button>
          </div>

          {/* Card 4: Kill OEM Usage Telemetry */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  4. Kill OEM Telemetry
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400">
                  ANTI-C2
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {isArabic
                  ? "تعطيل حزم إحصائيات الاستخدام، وتقارير الأعطال التلقائية، ومراقبة المستشعرات الخلفية."
                  : "Disables usage_stats_enabled, crash reporting, and orientation sensor exfiltration channels."}
              </p>
            </div>

            <Button
              onClick={executeKillOemTelemetry}
              disabled={hardeningExecuting === "telemetry" || !isConnected}
              size="sm"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isArabic ? "تعطيل التتبع والمقاييس" : "Disable OEM Telemetry"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Live Socket Inspector & C2 Reconnaissance Table */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        {/* Table Filters & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mr-2">
              {isArabic ? "سجل الاتصالات المباشرة" : "Active Socket Ledger"}
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setStateFilter("ALL")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  stateFilter === "ALL"
                    ? "bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isArabic ? "الكل" : "All Sockets"} ({sockets.length})
              </button>
              <button
                onClick={() => setStateFilter("ESTABLISHED")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  stateFilter === "ESTABLISHED"
                    ? "bg-white dark:bg-slate-700 font-bold text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isArabic ? "نشطة" : "Established"} ({stats.established})
              </button>
              <button
                onClick={() => setStateFilter("LISTEN")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  stateFilter === "LISTEN"
                    ? "bg-white dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isArabic ? "استماع" : "Listening"} ({stats.listening})
              </button>
              <button
                onClick={() => setStateFilter("SUSPICIOUS")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  stateFilter === "SUSPICIOUS"
                    ? "bg-white dark:bg-slate-700 font-bold text-rose-600 dark:text-rose-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isArabic ? "مشبوهة وتتبع" : "Suspicious / Telemetry"} ({stats.suspicious + stats.telemetry})
              </button>
            </div>
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={isArabic ? "ابحث عن حزمة أو IP أو منفذ..." : "Search app, package, IP, or port..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90 backdrop-blur-xs text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider z-10">
                <tr>
                  <th className="p-3">{isArabic ? "التطبيق / الحزمة" : "Application / Package"}</th>
                  <th className="p-3">{isArabic ? "المصدر المحلي" : "Local Endpoint"}</th>
                  <th className="p-3">{isArabic ? "الوجهة البعيدة" : "Remote Endpoint"}</th>
                  <th className="p-3">{isArabic ? "الحالة" : "State"}</th>
                  <th className="p-3">{isArabic ? "الاتجاه" : "Direction"}</th>
                  <th className="p-3">{isArabic ? "التصنيف الأمني" : "Triage Tag"}</th>
                  <th className="p-3 text-right">{isArabic ? "إجراء العزل" : "Isolate"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-xs">
                {filteredSockets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                      {isScanning ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
                          <span>{isArabic ? "جاري قراءة مقابس النواة..." : "Parsing active kernel sockets..."}</span>
                        </div>
                      ) : isConnected ? (
                        <div>
                          <p className="font-semibold text-slate-600 dark:text-slate-300">
                            {isArabic ? "لا توجد اتصالات تطابق معايير البحث." : "No sockets match the active criteria."}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {isArabic
                              ? "قد يكون الجهاز في وضع السكون أو تم تقييد حركة البيانات بنجاح."
                              : "The device might be idle or background network activity is restricted."}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold text-slate-600 dark:text-slate-300">
                            {isArabic ? "الرجاء توصيل جهاز Android لبدء الفحص." : "Connect an Android device to inspect sockets."}
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredSockets.map((sock, idx) => (
                    <tr
                      key={`${sock.protocol}-${sock.localIp}:${sock.localPort}-${sock.remoteIp}:${sock.remotePort}-${idx}`}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        sock.isSuspicious
                          ? "bg-rose-50/40 dark:bg-rose-950/20"
                          : sock.classificationTag === "OEM Telemetry"
                            ? "bg-amber-50/40 dark:bg-amber-950/20"
                            : idx % 2 === 0
                              ? "bg-slate-50/20 dark:bg-slate-900/40"
                              : ""
                      }`}
                    >
                      {/* App & Package */}
                      <td className="p-3 font-sans">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{sock.appLabel || sock.packageName}</span>
                          {sock.isSuspicious && (
                            <span title="Suspicious Remote Connection">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 inline shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {sock.packageName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          UID: {sock.uid} · {sock.protocol.toUpperCase()}
                        </div>
                      </td>

                      {/* Local Endpoint */}
                      <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        <div>{sock.localIp}</div>
                        <div className="text-slate-400 font-semibold">:{sock.localPort}</div>
                      </td>

                      {/* Remote Endpoint */}
                      <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        <div className={sock.isSuspicious ? "text-rose-600 dark:text-rose-400 font-bold" : ""}>
                          {sock.remoteIp}
                        </div>
                        <div className="text-slate-400 font-semibold">:{sock.remotePort}</div>
                      </td>

                      {/* State */}
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            sock.state === "ESTABLISHED"
                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                              : sock.state === "LISTEN"
                                ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {sock.state}
                        </span>
                      </td>

                      {/* Direction */}
                      <td className="p-3 font-sans text-xs">
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          {sock.direction === "Inbound" ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500" />
                          ) : sock.direction === "Outbound" ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Radio className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{sock.direction}</span>
                        </span>
                      </td>

                      {/* Threat Triage Tag */}
                      <td className="p-3 font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            sock.isSuspicious
                              ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                              : sock.classificationTag === "OEM Telemetry"
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                : sock.classificationTag === "Cloud Sync"
                                  ? "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800"
                                  : sock.classificationTag === "Loopback / IPC"
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                    : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {sock.classificationTag}
                        </span>
                      </td>

                      {/* Isolate Action */}
                      <td className="p-3 text-right">
                        {sock.packageName && sock.uid >= 10000 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => isolateApp(sock.packageName!, sock.appLabel || sock.packageName!)}
                            className="h-7 px-2 text-[10px] font-sans border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                            title="Block background execution & revoke network appops"
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            <span>{isArabic ? "عزل" : "Isolate"}</span>
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-sans">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer timestamp & info */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-3">
          <div>
            {lastScannedAt ? (
              <span>
                {isArabic ? "آخر فحص:" : "Last scan:"} {new Date(lastScannedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <div>
            {isArabic
              ? "يتم التحليل بدون صلاحيات Root عبر واجهة procfs القياسية لنواة Linux."
              : "Procfs socket inspection running unprivileged via WebUSB ADB stream."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkPrivacyWorkspace;
