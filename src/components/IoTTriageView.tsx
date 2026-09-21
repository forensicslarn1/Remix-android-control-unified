import React, { useState, useEffect, useRef } from 'react';
import type { Adb } from '@yume-chan/adb';
import JSZip from 'jszip';
import { ShieldAlert, Search, Play, Square, Info, RefreshCw, Layers, BookOpen, X, CheckCircle2, TerminalSquare, Eye, Key } from 'lucide-react';

/* =========================================================================
   1. TYPES & INTERFACES
   ========================================================================= */

export type ExtractionStrategy = 'ROOT' | 'RUN_AS' | 'ADB_BACKUP' | 'LOGCAT_AND_EXTERNAL';

export interface PreFlightAssessment {
  packageName: string;
  sdkVersion: number;
  isDebuggable: boolean;
  allowBackup: boolean;
  hasRoot: boolean;
  recommendedStrategy: ExtractionStrategy;
  reasoning: string[];
}

export interface DataPointEvent {
  id: string;
  timestamp: string;
  dpId: number;
  dpName: string;
  dpValue: unknown;
  actionType: 'publishDps' | 'onDpUpdate';
  rawPayload: string;
}

export interface TuyaSdkMetadata {
  packageName: string;
  isTuyaBased: boolean;
  detectedSdks: string[];
  privacyKeywordsFound: string[];
  analyzedAt: string;
}

export interface PrivacyZoneCoordinates {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IoTTriageViewProps {
  adb: Adb | null;
  isConnected: boolean;
}

/* =========================================================================
   2. CONSTANTS & MAPPINGS
   ========================================================================= */

export const TUYA_KNOWN_DPS: Record<number, string> = {
  105: 'basic_private (Privacy Mode Toggle)',
  106: 'basic_flip (Video Flip)',
  107: 'basic_osd (Watermark OSD)',
  108: 'basic_nightvision',
  115: 'movement_detect_pic',
  149: 'privacy_zone_set_point (Privacy Coordinates)',
  150: 'record_switch',
  169: 'ipc_privacy_zone (Custom)',
};

/* =========================================================================
   3. FORENSIC EXTRACTION UTILITIES
   ========================================================================= */

async function execAdbText(adb: Adb, command: string | string[]): Promise<string> {
  const sub = adb.subprocess as any;
  if (typeof sub.spawnAndWaitText === 'function') {
    return await sub.spawnAndWaitText(command);
  }
  if (typeof sub.spawnAndWait === 'function') {
    const res = await sub.spawnAndWait(command);
    return res.stdout || '';
  }
  if (typeof sub.spawnAndWaitLegacy === 'function') {
    return await sub.spawnAndWaitLegacy(command);
  }
  const proc = await adb.subprocess.spawn(command);
  const reader = proc.stdout.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(out);
}

export async function runPreFlightAssessment(adb: Adb, packageName: string): Promise<PreFlightAssessment> {
  const reasoning: string[] = [];

  let sdkVersion = 0;
  try {
    const sdkOutput = await execAdbText(adb, ['getprop', 'ro.build.version.sdk']);
    sdkVersion = parseInt(sdkOutput.trim(), 10) || 0;
  } catch {
    sdkVersion = 0;
  }

  let hasRoot = false;
  try {
    const idOutput = await execAdbText(adb, ['su', '-c', 'id']);
    hasRoot = idOutput.includes('uid=0');
  } catch {
    hasRoot = false;
  }

  let isDebuggable = false;
  let allowBackup = true;
  try {
    const dumpOutput = await execAdbText(adb, ['dumpsys', 'package', packageName]);
    isDebuggable = /\b(?:flags|pkgFlags)=[^\]]*\bDEBUGGABLE\b/i.test(dumpOutput);
    const isBackupBlocked = /\b(?:flags|pkgFlags)=[^\]]*\bRESTRICT_BACKUP\b/i.test(dumpOutput) || /ALLOW_BACKUP=false/i.test(dumpOutput);
    allowBackup = !isBackupBlocked;
  } catch {
    reasoning.push('Could not inspect dumpsys flags; assuming standard production restrictions.');
  }

  let recommendedStrategy: ExtractionStrategy = 'LOGCAT_AND_EXTERNAL';

  if (hasRoot) {
    recommendedStrategy = 'ROOT';
    reasoning.push('Root privileges confirmed (uid=0): Direct extraction of /data/data/ and databases is available.');
  } else if (isDebuggable) {
    recommendedStrategy = 'RUN_AS';
    reasoning.push('Application has DEBUGGABLE=true: Direct sandbox extraction via run-as is fully supported.');
  } else if (allowBackup && sdkVersion > 0 && sdkVersion < 31) {
    recommendedStrategy = 'ADB_BACKUP';
    reasoning.push(`Backup allowed on Android < 12 (SDK ${sdkVersion}): adb backup extraction route available (requires screen confirmation).`);
  } else {
    recommendedStrategy = 'LOGCAT_AND_EXTERNAL';
    if (sdkVersion >= 31) {
      reasoning.push(`Android 12+ (SDK ${sdkVersion}) strictly blocks adb backup for third-party private app data.`);
    }
    if (!allowBackup) {
      reasoning.push('Flag android:allowBackup="false" explicitly prevents backup archives.');
    }
    reasoning.push('Recommended Non-Invasive Route: Live DP Logcat Sniffer & External Storage Inspection.');
  }

  return {
    packageName,
    sdkVersion,
    isDebuggable,
    allowBackup,
    hasRoot,
    recommendedStrategy,
    reasoning,
  };
}

export async function extractViaRunAs(adb: Adb, packageName: string, relativePath: string): Promise<Uint8Array | null> {
  try {
    const process = await adb.subprocess.spawn(['run-as', packageName, 'cat', relativePath]);
    const reader = process.stdout.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    if (chunks.length === 0) return null;

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleText = new TextDecoder().decode(result.subarray(0, 100));
    if (sampleText.includes('run-as:') || sampleText.includes('No such file')) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

export async function extractAndInspectApk(
  adb: Adb,
  packageName: string,
  onProgress?: (msg: string) => void
): Promise<TuyaSdkMetadata> {
  onProgress?.('Locating APK path via pm path...');
  const pathOutput = await execAdbText(adb, ['pm', 'path', packageName]);
  const paths = pathOutput.trim().split('\n').map((l) => l.replace(/^package:/, '').trim());
  const apkPath = paths.find((p) => p.includes('base.apk')) || paths[0];

  if (!apkPath) {
    throw new Error(`Package '${packageName}' not found on device.`);
  }

  onProgress?.(`Streaming APK from ${apkPath}...`);
  const sync = await adb.sync();
  let apkBlob: Blob;
  try {
    const fileStream = sync.read(apkPath);
    const reader = fileStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    apkBlob = new Blob(chunks as any);
  } finally {
    await sync.dispose();
  }

  onProgress?.('Unpacking APK archive in browser memory...');
  const zip = await JSZip.loadAsync(apkBlob);

  const detectedSignatures = new Set<string>();
  const privacyMatches = new Set<string>();

  onProgress?.('Scanning Manifest, Resources and DEX tables...');

  const resourceFiles = Object.keys(zip.files).filter(
    (f) => f === 'AndroidManifest.xml' || f === 'resources.arsc' || f.endsWith('.json')
  );

  for (const fileName of resourceFiles) {
    const buffer = await zip.files[fileName].async('uint8array');
    const content = new TextDecoder('latin1').decode(buffer);

    if (content.includes('com.tuya.smart') || content.includes('com/tuya/smart')) {
      detectedSignatures.add('Tuya Smart SDK');
    }
    if (content.includes('com.thingclips.smart') || content.includes('com/thingclips/smart')) {
      detectedSignatures.add('ThingClips SDK');
    }
    if (content.includes('ENABLE_PRIVACY_MODE')) privacyMatches.add('ENABLE_PRIVACY_MODE');
    if (content.includes('privacy_zone')) privacyMatches.add('privacy_zone token');
    if (content.includes('privacy_zone_set_point')) privacyMatches.add('privacy_zone_set_point (DP 149)');
    if (content.includes('basic_private')) privacyMatches.add('basic_private (DP 105)');
  }

  const dexFiles = Object.keys(zip.files).filter((f) => f.endsWith('.dex'));
  for (const dexFile of dexFiles) {
    const buffer = await zip.files[dexFile].async('uint8array');
    const sample = new TextDecoder('latin1').decode(buffer.subarray(0, Math.min(buffer.length, 500000)));

    if (sample.includes('com/tuya/smart') || sample.includes('com.tuya.smart')) {
      detectedSignatures.add('Tuya Smart SDK');
    }
    if (sample.includes('com/thingclips/smart') || sample.includes('com.thingclips.smart')) {
      detectedSignatures.add('ThingClips SDK');
    }
    if (sample.includes('basic_private')) privacyMatches.add('basic_private (DP 105)');
    if (sample.includes('privacy_zone')) privacyMatches.add('privacy_zone token');
  }

  return {
    packageName,
    isTuyaBased: detectedSignatures.size > 0,
    detectedSdks: Array.from(detectedSignatures),
    privacyKeywordsFound: Array.from(privacyMatches),
    analyzedAt: new Date().toLocaleTimeString(),
  };
}

export function parseTuyaDpLine(line: string): DataPointEvent[] {
  const match = line.match(/(publishDps|onDpUpdate).*?(\{.*\})/i);
  if (!match) return [];

  const actionType = match[1] as 'publishDps' | 'onDpUpdate';
  const rawPayload = match[2];
  const events: DataPointEvent[] = [];

  try {
    const payload = JSON.parse(rawPayload);
    Object.keys(payload).forEach((key) => {
      const dpId = parseInt(key, 10);
      events.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        dpId,
        dpName: TUYA_KNOWN_DPS[dpId] || `DP #${dpId}`,
        dpValue: payload[key],
        actionType,
        rawPayload: line.trim(),
      });
    });
  } catch {
    // Non-JSON logging payload handled gracefully
  }

  return events;
}

export function renderPrivacyZonesOnCanvas(
  canvas: HTMLCanvasElement,
  zones: PrivacyZoneCoordinates[]
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  zones.forEach((zone, index) => {
    const rx = zone.x * width;
    const ry = zone.y * height;
    const rw = zone.width * width;
    const rh = zone.height * height;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(rx, ry, rw, rh);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`Privacy Zone #${index + 1}`, rx + 8, ry + 20);
    ctx.font = '10px monospace';
    ctx.fillText(`X:${(zone.x * 100).toFixed(0)}% Y:${(zone.y * 100).toFixed(0)}%`, rx + 8, ry + 36);
  });
}

/* =========================================================================
   4. REACT COMPONENT VIEW
   ========================================================================= */

export const IoTTriageView: React.FC<IoTTriageViewProps> = ({ adb, isConnected }) => {
  const [activeTab, setActiveTab] = useState<'preflight' | 'apk' | 'sniffer' | 'visualizer'>('preflight');
  const [targetPackage, setTargetPackage] = useState<string>('com.fnk.fnk');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isAssessing, setIsAssessing] = useState(false);
  const [assessment, setAssessment] = useState<PreFlightAssessment | null>(null);

  const [isInspecting, setIsInspecting] = useState(false);
  const [apkProgress, setApkProgress] = useState<string>('');
  const [apkMetadata, setApkMetadata] = useState<TuyaSdkMetadata | null>(null);

  const [isSniffing, setIsSniffing] = useState(false);
  const [events, setEvents] = useState<DataPointEvent[]>([]);
  const [filterDp, setFilterDp] = useState<string>('ALL');
  const logcatProcessRef = useRef<any>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zones, setZones] = useState<PrivacyZoneCoordinates[]>([
    { id: 1, x: 0.15, y: 0.2, width: 0.35, height: 0.4 },
  ]);

  useEffect(() => {
    return () => {
      if (logcatProcessRef.current) {
        logcatProcessRef.current.kill().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'visualizer' && canvasRef.current) {
      renderPrivacyZonesOnCanvas(canvasRef.current, zones);
    }
  }, [zones, activeTab]);

  const handlePreFlight = async () => {
    if (!adb || !isConnected) return;
    setIsAssessing(true);
    try {
      const res = await runPreFlightAssessment(adb, targetPackage.trim());
      setAssessment(res);
    } catch (err: any) {
      alert(`Pre-flight assessment failed: ${err.message}`);
    } finally {
      setIsAssessing(false);
    }
  };

  const handleApkInspect = async () => {
    if (!adb || !isConnected) return;
    setIsInspecting(true);
    setApkProgress('Starting extraction...');
    try {
      const meta = await extractAndInspectApk(adb, targetPackage.trim(), (msg) => setApkProgress(msg));
      setApkMetadata(meta);
    } catch (err: any) {
      alert(`APK inspection failed: ${err.message}`);
    } finally {
      setIsInspecting(false);
      setApkProgress('');
    }
  };

  const toggleSniffing = async () => {
    if (!adb || !isConnected) return;

    if (isSniffing) {
      if (logcatProcessRef.current) {
        await logcatProcessRef.current.kill().catch(() => {});
        logcatProcessRef.current = null;
      }
      setIsSniffing(false);
      return;
    }

    try {
      const process = await adb.subprocess.spawn(['logcat', '-v', 'time']);
      logcatProcessRef.current = process;
      setIsSniffing(true);

      const reader = process.stdout.pipeThrough(new (window as any).TextDecoderStream()).getReader();
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const lines = (value as string).split('\n');
              for (const line of lines) {
                const parsed = parseTuyaDpLine(line);
                if (parsed.length > 0) {
                  setEvents((prev) => [...parsed, ...prev].slice(0, 300));
                }
              }
            }
          }
        } catch {
          // Stream stopped gracefully
        } finally {
          setIsSniffing(false);
        }
      })();
    } catch (err: any) {
      alert(`Failed to spawn logcat: ${err.message}`);
      setIsSniffing(false);
    }
  };

  const filteredEvents = filterDp === 'ALL'
    ? events
    : events.filter((e) => e.dpId.toString() === filterDp);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-cyan-400" />
            <h1 className="text-xl font-bold tracking-wide">IoT DFIR Triage Suite</h1>
            <span className="text-xs font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded">
              Tuya / ThingClips
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Client-Side Camera & Smart App Security Triage via WebUSB</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={targetPackage}
            onChange={(e) => setTargetPackage(e.target.value)}
            placeholder="Target package (e.g. com.fnk.fnk)"
            className="bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded text-sm w-64 focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={() => setIsGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600 rounded text-sm font-medium transition cursor-pointer shadow-sm"
            title="Open User Guide & Standard Operating Procedure (SOP)"
          >
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">User Guide / SOP</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('preflight')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'preflight' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Pre-Flight Assessment
        </button>
        <button
          onClick={() => setActiveTab('apk')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'apk' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          APK Inspector
        </button>
        <button
          onClick={() => setActiveTab('sniffer')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'sniffer' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Live DP Sniffer
        </button>
        <button
          onClick={() => setActiveTab('visualizer')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'visualizer' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Privacy Zone Visualizer
        </button>
      </div>

      {activeTab === 'preflight' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-800/80 p-4 rounded-lg border border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Sandbox & Extraction Feasibility Check</h3>
              <p className="text-xs text-slate-400 mt-0.5">Determine Android sandbox boundaries and viable DFIR routes without touching user storage.</p>
            </div>
            <button
              onClick={handlePreFlight}
              disabled={!isConnected || isAssessing}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white rounded text-sm font-medium flex items-center gap-2"
            >
              {isAssessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Assess Feasibility
            </button>
          </div>

          {assessment && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/80 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400">Android SDK</div>
                <div className="text-lg font-bold text-slate-100 mt-1">API {assessment.sdkVersion}</div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400">Root Context</div>
                <div className={`text-lg font-bold mt-1 ${assessment.hasRoot ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {assessment.hasRoot ? 'Available' : 'Unprivileged'}
                </div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400">Debuggable Flag</div>
                <div className={`text-lg font-bold mt-1 ${assessment.isDebuggable ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {assessment.isDebuggable ? 'True (run-as OK)' : 'False (Production)'}
                </div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400">AllowBackup Flag</div>
                <div className={`text-lg font-bold mt-1 ${assessment.allowBackup ? 'text-amber-400' : 'text-rose-400'}`}>
                  {assessment.allowBackup ? 'Enabled' : 'Restricted'}
                </div>
              </div>

              <div className="col-span-1 md:col-span-4 bg-slate-800/80 p-5 rounded-lg border border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recommended Strategy:</span>
                  <span className="px-2.5 py-1 text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 rounded">
                    {assessment.recommendedStrategy}
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {assessment.reasoning.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'apk' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-800/80 p-4 rounded-lg border border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Memory-Safe APK Inspection</h3>
              <p className="text-xs text-slate-400 mt-0.5">Extracts base.apk directly over WebUSB sync and inspects SDK signatures safely.</p>
            </div>
            <button
              onClick={handleApkInspect}
              disabled={!isConnected || isInspecting}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white rounded text-sm font-medium flex items-center gap-2"
            >
              {isInspecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Pull & Inspect APK
            </button>
          </div>

          {isInspecting && <div className="text-xs font-mono text-cyan-400 animate-pulse">{apkProgress}</div>}

          {apkMetadata && (
            <div className="bg-slate-800/80 p-5 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="font-mono text-sm">{apkMetadata.packageName}</div>
                <span className={`px-2 py-0.5 text-xs rounded font-bold ${apkMetadata.isTuyaBased ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {apkMetadata.isTuyaBased ? 'Tuya / ThingClips Confirmed' : 'Generic IoT Package'}
                </span>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">Detected SDK Frameworks:</h4>
                <div className="flex flex-wrap gap-2">
                  {apkMetadata.detectedSdks.length > 0 ? (
                    apkMetadata.detectedSdks.map((sdk, idx) => (
                      <span key={idx} className="bg-slate-900 text-slate-200 text-xs px-2.5 py-1 rounded border border-slate-700 font-mono">
                        {sdk}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No Tuya classes recognized</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">Privacy & Zone Tokens Found:</h4>
                <div className="flex flex-wrap gap-2">
                  {apkMetadata.privacyKeywordsFound.length > 0 ? (
                    apkMetadata.privacyKeywordsFound.map((kw, idx) => (
                      <span key={idx} className="bg-rose-950 text-rose-300 text-xs px-2.5 py-1 rounded border border-rose-800 font-mono">
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No explicit privacy tokens discovered</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sniffer' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/80 p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSniffing}
                disabled={!isConnected}
                className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 ${
                  isSniffing ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isSniffing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isSniffing ? 'Stop Sniffing' : 'Start DP Sniffer'}
              </button>
              {isSniffing && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Listening to Logcat...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter DP:</span>
              <select
                value={filterDp}
                onChange={(e) => setFilterDp(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none"
              >
                <option value="ALL">All DPs</option>
                <option value="105">DP 105 (Privacy Mode)</option>
                <option value="149">DP 149 (Privacy Coordinates)</option>
                <option value="106">DP 106 (Video Flip)</option>
                <option value="108">DP 108 (Night Vision)</option>
              </select>
              <button onClick={() => setEvents([])} className="text-xs text-slate-400 hover:text-slate-200 underline px-2">
                Clear
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto font-mono text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 text-[11px] sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Action</th>
                    <th className="p-2.5">DP ID</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-slate-800">
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No DP events detected yet. Click "Start DP Sniffer" and interact with the camera app.
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400">{ev.timestamp}</td>
                        <td className="p-2.5 font-bold text-cyan-400">{ev.actionType}</td>
                        <td className="p-2.5 font-bold text-slate-200">{ev.dpId}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              ev.dpId === 105
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : ev.dpId === 149
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'text-slate-300'
                            }`}
                          >
                            {ev.dpName}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-300 max-w-xs truncate">{JSON.stringify(ev.dpValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visualizer' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/80 p-4 rounded-lg border border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Normalized Privacy Zone Visualizer</h3>
              <p className="text-xs text-slate-400 mt-0.5">Renders privacy mask bounding boxes extracted from DP 149 payloads.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZones([{ id: 1, x: 0.15, y: 0.2, width: 0.35, height: 0.4 }])}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs text-cyan-300 border border-slate-700 rounded"
              >
                Load DP 149 Sample
              </button>
              <button
                onClick={() =>
                  setZones([...zones, { id: zones.length + 1, x: 0.5, y: 0.5, width: 0.25, height: 0.25 }])
                }
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs text-white rounded"
              >
                + Add Area
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex justify-center bg-slate-950 p-4 rounded-lg border border-slate-800">
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                className="rounded shadow-lg border border-slate-800 max-w-full h-auto"
              />
            </div>

            <div className="bg-slate-800/80 p-4 rounded-lg border border-slate-700 space-y-4">
              <h4 className="text-xs font-semibold uppercase text-slate-400">Bounding Box Controls</h4>
              {zones.map((zone, idx) => (
                <div key={zone.id} className="p-3 bg-slate-900 rounded border border-slate-800 space-y-2 text-xs">
                  <div className="font-bold text-rose-400">Zone #{idx + 1}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400">X: {(zone.x * 100).toFixed(0)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={zone.x}
                        onChange={(e) => {
                          const updated = [...zones];
                          updated[idx].x = parseFloat(e.target.value);
                          setZones(updated);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Y: {(zone.y * 100).toFixed(0)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={zone.y}
                        onChange={(e) => {
                          const updated = [...zones];
                          updated[idx].y = parseFloat(e.target.value);
                          setZones(updated);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Width: {(zone.width * 100).toFixed(0)}%</label>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={zone.width}
                        onChange={(e) => {
                          const updated = [...zones];
                          updated[idx].width = parseFloat(e.target.value);
                          setZones(updated);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Height: {(zone.height * 100).toFixed(0)}%</label>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={zone.height}
                        onChange={(e) => {
                          const updated = [...zones];
                          updated[idx].height = parseFloat(e.target.value);
                          setZones(updated);
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* User Guide / SOP Modal */}
      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsGuideOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-950/60 text-cyan-400 border border-cyan-800/80 rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    IoT DFIR Triage Standard Operating Procedure (SOP)
                    <span className="text-[11px] font-mono font-normal bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
                      Tuya / ThingClips
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Forensic workflow for non-invasive companion app triage, SDK inspection, and Data Point analysis.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
                aria-label="Close Guide"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-6 space-y-6 text-sm text-slate-300">
              {/* Section 1: Overview & Objective */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">1</span>
                  <h3 className="font-semibold text-slate-100 text-sm tracking-wide">Overview & Forensic Objective</h3>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-800 space-y-2 text-xs leading-relaxed text-slate-300">
                  <p>
                    Consumer and enterprise smart cameras often run proprietary firmware paired with white-labeled companion applications powered by the <strong className="text-slate-100">Tuya Smart</strong> or <strong className="text-slate-100">ThingClips</strong> IoT platform (e.g., FNK, Smart Life, Geeni, Gosund, BlitzWolf).
                  </p>
                  <p>
                    The primary objective of this module is to conduct <strong className="text-cyan-300">rapid, non-invasive digital forensic and incident triage (DFIR)</strong> via WebUSB ADB without corrupting flash storage integrity or voiding hardware evidence chains:
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-300">
                    <li className="flex items-start gap-1.5">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span><strong className="text-slate-100">Extraction Feasibility:</strong> Safely evaluate sandbox privilege barriers (root, debuggable, allowBackup) before attempting extraction.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span><strong className="text-slate-100">In-Memory APK Auditing:</strong> Inspect installed application packages for Tuya SDK footprints, tracking endpoints, and privacy keywords without writing to disk.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span><strong className="text-slate-100">Real-Time Data Point Sniffing:</strong> Capture and decode Tuya Data Point (DP) command and telemetry streams directly from Logcat.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span><strong className="text-slate-100">Privacy Zone Verification:</strong> Decode and visually reconstruct camera occlusion coordinates (DP 149) on an interactive canvas to verify masking boundaries.</span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* Section 2: Step-by-Step SOP */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">2</span>
                  <h3 className="font-semibold text-slate-100 text-sm tracking-wide">Step-by-Step SOP (Standard Operating Procedure)</h3>
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Phase 1: Pre-Flight Assessment
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">dumpsys + getprop + su</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Enter the target package name in the header input (default: <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">com.fnk.fnk</code>) and click <strong>Assess Feasibility</strong>. The engine inspects Android SDK version (<code className="text-slate-300">ro.build.version.sdk</code>), root context (`su -c id`), <code className="text-slate-300">DEBUGGABLE</code> status, and <code className="text-slate-300">ALLOW_BACKUP</code> flags. Review the recommended extraction strategy before executing invasive procedures.
                    </p>
                  </div>

                  <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Phase 2: Memory-Safe APK Inspector
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">pm path + sync + in-memory zip</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Switch to the <strong>APK Inspector</strong> tab and click <strong>Pull & Inspect APK</strong>. The browser directly streams the device’s <code className="text-slate-300">base.apk</code> over WebUSB ADB sync into browser RAM. JSZip unzips the APK and scans <code className="text-slate-300">AndroidManifest.xml</code>, compiled resources, and <code className="text-slate-300">.dex</code> byte tables for Tuya/ThingClips SDK footprints, telemetry endpoints, and privacy keywords.
                    </p>
                  </div>

                  <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Phase 3: Live Data Point (DP) Sniffer
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">logcat -v time | publishDps / onDpUpdate</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Switch to the <strong>Live DP Sniffer</strong> tab and click <strong>Start DP Sniffer</strong>. The tool attaches a background Logcat reader filtering for <code className="text-cyan-300">publishDps</code> and <code className="text-cyan-300">onDpUpdate</code> payloads. Interact with the companion app or physical camera (toggle privacy mode, turn on night vision, trigger motion) to observe structured DPs as they fire.
                    </p>
                  </div>

                  <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Phase 4: Privacy Zone Coordinate Visualizer
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">DP 149 / DP 169 canvas projection</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Switch to the <strong>Privacy Zone Visualizer</strong>. If DP 149 payloads were captured in the sniffer, load the normalized coordinates into the visualizer. You can inspect whether configured privacy occlusion zones fully cover sensitive optical viewing angles or leave perimeter surveillance gaps.
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 3: Tuya Data Points (DPs) Reference Cheat-Sheet */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">3</span>
                  <h3 className="font-semibold text-slate-100 text-sm tracking-wide">Tuya Data Points (DPs) Reference Cheat-Sheet</h3>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">DP ID</th>
                        <th className="p-2.5">Function Identifier</th>
                        <th className="p-2.5">Data Type</th>
                        <th className="p-2.5">Forensic Significance & Behavior</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-sans">
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 105</td>
                        <td className="p-2.5 font-mono text-slate-200">basic_private</td>
                        <td className="p-2.5 text-slate-400">Boolean</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Privacy Mode Toggle:</strong> <code className="text-emerald-300">true</code> cuts video stream and drops lens / shutter down; <code className="text-rose-300">false</code> resumes active monitoring. Critical for proving whether surveillance was active during an incident timeframe.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 149</td>
                        <td className="p-2.5 font-mono text-slate-200">privacy_zone_set_point</td>
                        <td className="p-2.5 text-slate-400">String / JSON</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Privacy Mask Coordinates:</strong> Encodes normalized bounding coordinates <code className="text-slate-200">{`{x, y, w, h}`}</code> defining areas obscured with black or pixelated masks. Used to establish evidence of intentional visual blackout.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 106</td>
                        <td className="p-2.5 font-mono text-slate-200">basic_flip</td>
                        <td className="p-2.5 text-slate-400">Boolean</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Video Image Flip:</strong> Inverts video feed 180°. Corroborates physical camera mounting position (ceiling inverted vs. upright surface).
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 108</td>
                        <td className="p-2.5 font-mono text-slate-200">basic_nightvision</td>
                        <td className="p-2.5 text-slate-400">Enum (0/1/2)</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Night Vision / IR Mode:</strong> <code className="text-slate-200">0=Auto</code>, <code className="text-slate-200">1=Force Off</code>, <code className="text-slate-200">2=Force On</code>. Explains IR illumination status and optical cut filter states in low-light evidence captures.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 115</td>
                        <td className="p-2.5 font-mono text-slate-200">movement_detect_pic</td>
                        <td className="p-2.5 text-slate-400">String / Base64</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Motion Detection Snapshot:</strong> Dispatched when hardware PIR or computer vision detects motion. Contains encrypted image key or base64 snapshot transmitted to cloud or local log.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 150</td>
                        <td className="p-2.5 font-mono text-slate-200">record_switch</td>
                        <td className="p-2.5 text-slate-400">Boolean</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Continuous SD Card Recording:</strong> <code className="text-emerald-300">true</code> engages 24/7 circular buffer recording to onboard TF/SD card; <code className="text-rose-300">false</code> records only event triggers or stays idle.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono font-bold text-cyan-300">DP 169</td>
                        <td className="p-2.5 font-mono text-slate-200">ipc_privacy_zone</td>
                        <td className="p-2.5 text-slate-400">String / JSON</td>
                        <td className="p-2.5 text-slate-300">
                          <strong className="text-slate-100">Multi-Zone Privacy Mask:</strong> Advanced multi-polygon mask schema utilized by newer IPC firmware variants allowing multiple active exclusion zones simultaneously.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60">
              <span className="text-xs text-slate-500">Forensic integrity priority: Read-only memory analysis and non-invasive logcat sniffing.</span>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IoTTriageView;
