/**
 * Android Control Center - High-Assurance WebUSB ADB Transport Layer
 * Adheres strictly to @yume-chan/adb production specifications:
 * - Proper WebUSB interface acquisition & release without locking errors
 * - IndexedDB RSA credential persistence via @yume-chan/adb-credential-web
 * - Complete stream chunk buffering via Utf8DecodeStream until done: true
 * - Robust subprocess invocation with timeout & error handling
 * - Automatic physical USB disconnect detection and recovery
 */
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import {
  AdbDaemonWebUsbConnection,
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from "@yume-chan/adb-scrcpy";
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import {
  ReadableStream as AdbReadableStream,
  TextDecoderStream,
  WritableStream,
} from "@yume-chan/stream-extra";

export type DeviceProfile = {
  serial: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdk: string;
};

export type CommandResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  at: string;
};

export type DeviceFile = {
  name: string;
  size: number;
  modified: number;
  isDirectory: boolean;
};

export type MirrorSession = {
  stop: () => Promise<void>;
  width: number;
  height: number;
  codec: string;
};

export type LogcatLevel = "V" | "D" | "I" | "W" | "E" | "F";

export type LogcatEntry = {
  id: string;
  timestamp: string;
  pid: string;
  tid: string;
  level: LogcatLevel;
  tag: string;
  message: string;
  raw: string;
};

export type LogcatStreamSession = {
  stop: () => Promise<void>;
};

export type PackageItem = {
  id: string;
  status: "enabled" | "disabled";
  isSystem: boolean;
  isThirdParty: boolean;
  apkPath?: string;
};

export type PackageListResult = {
  result: CommandResult;
  packages: string[];
  disabledPackages: string[];
  systemPackages: string[];
  thirdPartyPackages: string[];
  packageStatuses: Array<{
    id: string;
    status: "disabled" | "enabled";
    isSystem?: boolean;
    apkPath?: string;
  }>;
  packageMap: Map<string, string>;
};

/**
 * Custom UTF-8 decoding stream transformer based on the W3C TextDecoderStream.
 * Handles partial multibyte UTF-8 boundaries seamlessly across chunk intervals.
 */
export class Utf8DecodeStream extends TextDecoderStream {
  constructor() {
    super("utf-8", { fatal: false, ignoreBOM: true });
  }
}

/**
 * Asynchronously read all stream chunks until done: true is received.
 * Guarantees zero dropped bytes or truncated strings across high-volume ADB streams.
 */
export async function readStreamComplete(
  stream: AdbReadableStream<Uint8Array>,
  timeoutMs = 35000
): Promise<string> {
  const decodeStream = new Utf8DecodeStream();
  const textStream = stream.pipeThrough(decodeStream);
  const reader = textStream.getReader();
  let accumulated = "";

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        reader.cancel().catch(() => undefined);
      } catch {
        // ignore cancellation error
      }
      reject(new Error(`Stream reader timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const readLoop = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          accumulated += value;
        }
      }
      return accumulated;
    } finally {
      if (timer) clearTimeout(timer);
      try {
        reader.releaseLock();
      } catch {
        // ignore lock release error
      }
    }
  })();

  return Promise.race([readLoop, timeoutPromise]);
}

const packageIdRegex = /^[A-Za-z0-9._]+$/;
const SCRCPY_SERVER_URL = "/manus-storage/scrcpy-server-2.1_0e0bd7e6.bin";
const SCRCPY_SERVER_PATH = "/data/local/tmp/scrcpy-server.jar";

function safePackage(value: string) {
  if (!packageIdRegex.test(value)) throw new Error("Invalid package identifier.");
  return value;
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function readableFile(file: File) {
  const reader = file.stream().getReader();
  async function* chunks() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  return AdbReadableStream.from(chunks());
}

function readableResponse(response: Response) {
  if (!response.body) throw new Error("Scrcpy server binary could not be read from managed static storage.");
  const reader = response.body.getReader();
  async function* chunks() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  return AdbReadableStream.from(chunks());
}

/**
 * High-Assurance WebUSB ADB Client for modern Chromium environments.
 */
export class BrowserAdbClient {
  private adb: Adb | null = null;
  private currentDevice: AdbDaemonWebUsbDevice | null = null;
  private currentConnection: AdbDaemonWebUsbConnection | null = null;
  // IndexedDB credential store: generates and preserves RSA-2048 keys across reloads
  private credentialStore = new AdbWebCredentialStore("android-control-unified");
  private disconnectListeners = new Set<() => void>();
  private activeStreams = new Set<() => Promise<void> | void>();
  private boundUsbDisconnectListener: ((e: any) => void) | null = null;

  constructor() {
    this.setupUsbGlobalListener();
  }

  private setupUsbGlobalListener() {
    if (typeof navigator !== "undefined" && "usb" in navigator) {
      this.boundUsbDisconnectListener = (event: any) => {
        if (this.currentDevice?.raw && event.device === this.currentDevice.raw) {
          void this.handleDeviceDetached();
        }
      };
      (navigator as any).usb.addEventListener("disconnect", this.boundUsbDisconnectListener);
    }
  }

  static isSupported() {
    return Boolean(typeof navigator !== "undefined" && "usb" in navigator && AdbDaemonWebUsbDeviceManager.BROWSER);
  }

  /**
   * Retrieves devices that have already been granted WebUSB permissions by the browser.
   * Enables zero-prompt automatic reconnection.
   */
  static async getPairedDevices(): Promise<AdbDaemonWebUsbDevice[]> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) return [];
    try {
      return await manager.getDevices();
    } catch {
      return [];
    }
  }

  get isConnected() {
    return Boolean(this.adb);
  }

  get serial(): string | null {
    return this.currentDevice?.serial || null;
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  private notifyDisconnect() {
    for (const listener of Array.from(this.disconnectListeners)) {
      try {
        listener();
      } catch (e) {
        console.error("Disconnect listener error:", e);
      }
    }
  }

  private async handleDeviceDetached() {
    await this.disconnect(false);
    this.notifyDisconnect();
  }

  /**
   * Connect to an Android device over WebUSB.
   * If `targetDevice` is omitted, prompts the user through the standard Chromium chooser.
   */
  async connect(targetDevice?: AdbDaemonWebUsbDevice): Promise<DeviceProfile> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      throw new Error("WebUSB is unavailable in this environment. Please use Google Chrome or Microsoft Edge over HTTPS.");
    }

    // Clean up any stale connection and release interfaces first
    if (this.adb || this.currentDevice) {
      await this.disconnect(false);
    }

    let device = targetDevice;
    if (!device) {
      device = await manager.requestDevice();
      if (!device) {
        throw new Error("No Android USB device was selected.");
      }
    }

    this.currentDevice = device;

    // Connect and claim interface with automatic retry on DeviceBusy / NetworkError
    let connection: AdbDaemonWebUsbConnection;
    try {
      connection = await device.connect();
    } catch (err: any) {
      const isBusy =
        err?.name === "NetworkError" ||
        err?.message?.includes("claimInterface") ||
        err?.message?.includes("already in use") ||
        err?.constructor?.name === "DeviceBusyError";

      if (isBusy) {
        // Attempt to clean up and force release previous interface
        try {
          if (device.raw.opened) {
            for (const iface of device.raw.configuration?.interfaces || []) {
              if (iface.claimed) {
                await device.raw.releaseInterface(iface.interfaceNumber).catch(() => undefined);
              }
            }
            await device.raw.close().catch(() => undefined);
          }
        } catch {
          // ignore cleanup errors
        }

        // Wait 350ms and try one more time
        await new Promise((r) => setTimeout(r, 350));
        try {
          connection = await device.connect();
        } catch (retryErr: any) {
          throw new Error(
            "The USB device interface is locked by another program. If you have the 'adb' command running locally, run 'adb kill-server' in your terminal, or unplug and re-connect the USB cable."
          );
        }
      } else {
        throw err;
      }
    }

    this.currentConnection = connection;

    // Authenticate using persistent IndexedDB credential store
    try {
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: this.credentialStore,
      });

      this.adb = new Adb(transport);
    } catch (authErr: any) {
      // Release interface if authentication fails or is rejected on phone
      await this.disconnect(false);
      throw new Error(
        `ADB Authentication failed: ${authErr?.message || "Check your phone screen and tap 'Always allow from this computer'."}`
      );
    }

    // Read device properties
    const [manufacturer, model, androidVersion, sdk] = await Promise.all([
      this.adb.getProp("ro.product.manufacturer").catch(() => "Android"),
      this.adb.getProp("ro.product.model").catch(() => "Device"),
      this.adb.getProp("ro.build.version.release").catch(() => "Unknown"),
      this.adb.getProp("ro.build.version.sdk").catch(() => "Unknown"),
    ]);

    return {
      serial: device.serial || "authorized",
      manufacturer: manufacturer || "Android",
      model: model || "Device",
      androidVersion: androidVersion || "Unknown",
      sdk: sdk || "Unknown",
    };
  }

  /**
   * Safely disconnect and release the WebUSB interface without causing locking or busy errors.
   */
  async disconnect(notify = true): Promise<void> {
    // 1. Stop all active streams (logcat, mirror)
    for (const stopFn of Array.from(this.activeStreams)) {
      try {
        await stopFn();
      } catch {
        // ignore
      }
    }
    this.activeStreams.clear();

    // 2. Close ADB session
    if (this.adb) {
      try {
        await this.adb.close();
      } catch {
        // ignore
      }
      this.adb = null;
    }

    // 3. Release WebUSB interface cleanly
    if (this.currentDevice?.raw) {
      const raw = this.currentDevice.raw;
      try {
        if (raw.opened) {
          for (const iface of raw.configuration?.interfaces || []) {
            if (iface.claimed) {
              await raw.releaseInterface(iface.interfaceNumber).catch(() => undefined);
            }
          }
          await raw.close().catch(() => undefined);
        }
      } catch {
        // device might have already been physically disconnected
      }
    }

    this.currentDevice = null;
    this.currentConnection = null;

    if (notify) {
      this.notifyDisconnect();
    }
  }

  async getDeviceProfile(): Promise<DeviceProfile | null> {
    if (!this.adb) return null;
    const [manufacturer, model, androidVersion, sdk] = await Promise.all([
      this.adb.getProp("ro.product.manufacturer").catch(() => "Android"),
      this.adb.getProp("ro.product.model").catch(() => "Device"),
      this.adb.getProp("ro.build.version.release").catch(() => "Unknown"),
      this.adb.getProp("ro.build.version.sdk").catch(() => "Unknown"),
    ]);
    return {
      serial: this.currentDevice?.serial || (this.adb.transport as any)?.serial || "authorized",
      manufacturer,
      model,
      androidVersion,
      sdk,
    };
  }

  private requireAdb(): Adb {
    if (!this.adb) throw new Error("Connect and authorize an Android device first.");
    return this.adb;
  }

  /**
   * Run an ADB shell command with comprehensive streaming, error handling, and timeout safeguards.
   */
  async run(command: string, options?: { timeoutMs?: number }): Promise<CommandResult> {
    const adb = this.requireAdb();
    const timeout = options?.timeoutMs ?? 25000;
    const at = new Date().toISOString();

    try {
      // Preferred method: spawn subprocess with streaming stdout/stderr
      const proc = await adb.subprocess.spawn(command);

      const stdoutPromise = readStreamComplete(proc.stdout, timeout);
      const stderrPromise = proc.stderr
        ? readStreamComplete(proc.stderr, timeout).catch(() => "")
        : Promise.resolve("");

      // Exit promise with graceful fallback if daemon doesn't send exit code promptly
      const exitPromise = Promise.race([
        proc.exit,
        new Promise<number>((resolve) => setTimeout(() => resolve(0), timeout + 1500)),
      ]);

      const [stdout, stderr, exitCode] = await Promise.all([
        stdoutPromise,
        stderrPromise,
        exitPromise,
      ]);

      return {
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: typeof exitCode === "number" ? exitCode : 0,
        at,
      };
    } catch (primaryErr: any) {
      // Fallback: spawnAndWait or spawnAndWaitLegacy
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
        );

        const result = await Promise.race([
          adb.subprocess.spawnAndWait(command),
          timeoutPromise,
        ]);

        return {
          command,
          stdout: (result.stdout || "").trim(),
          stderr: (result.stderr || "").trim(),
          exitCode: result.exitCode ?? 0,
          at,
        };
      } catch (fallbackErr: any) {
        return {
          command,
          stdout: "",
          stderr: fallbackErr?.message || primaryErr?.message || "Execution error",
          exitCode: 1,
          at,
        };
      }
    }
  }

  /**
   * Comprehensive package list ingestion.
   * Reads pm list packages -f -u, pm list packages -3, pm list packages -d, and pm list packages -s
   * through Utf8DecodeStream without dropping chunks or stalling.
   */
  async listPackages(): Promise<PackageListResult> {
    // 1. Fetch full package list with APK paths
    let mainResult = await this.run("pm list packages -f -u", { timeoutMs: 35000 });
    if (!mainResult.stdout || mainResult.exitCode !== 0) {
      // Fallback to standard pm list packages -u if -f is restricted
      mainResult = await this.run("pm list packages -u", { timeoutMs: 35000 });
    }

    // 2. Fetch third-party, disabled, and system packages concurrently
    const [thirdPartyRes, disabledRes, systemRes] = await Promise.all([
      this.run("pm list packages -3", { timeoutMs: 25000 }).catch(() => ({
        command: "pm list packages -3",
        stdout: "",
        stderr: "",
        exitCode: 0,
        at: "",
      })),
      this.run("pm list packages -d", { timeoutMs: 25000 }).catch(() => ({
        command: "pm list packages -d",
        stdout: "",
        stderr: "",
        exitCode: 0,
        at: "",
      })),
      this.run("pm list packages -s", { timeoutMs: 25000 }).catch(() => ({
        command: "pm list packages -s",
        stdout: "",
        stderr: "",
        exitCode: 0,
        at: "",
      })),
    ]);

    const extractPackageIds = (text: string): Set<string> => {
      const set = new Set<string>();
      for (const line of text.split(/[\r\n]+/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("package:")) continue;
        const payload = trimmed.slice("package:".length).trim();
        // If line contains path: /path/base.apk=com.pkg
        const lastEq = payload.lastIndexOf("=");
        const pkg = lastEq !== -1 ? payload.slice(lastEq + 1).trim() : payload;
        if (pkg) set.add(pkg);
      }
      return set;
    };

    const thirdPartySet = extractPackageIds(thirdPartyRes.stdout);
    const disabledSet = extractPackageIds(disabledRes.stdout);
    const systemSet = extractPackageIds(systemRes.stdout);

    // Parse main package listing
    const packageMap = new Map<string, string>();
    const allPackagesSet = new Set<string>();

    for (const rawLine of mainResult.stdout.split(/[\r\n]+/)) {
      const line = rawLine.trim();
      if (!line.startsWith("package:")) continue;

      const payload = line.slice("package:".length).trim();
      const lastEq = payload.lastIndexOf("=");
      if (lastEq !== -1) {
        const apkPath = payload.slice(0, lastEq).trim();
        const pkgId = payload.slice(lastEq + 1).trim();
        if (pkgId) {
          allPackagesSet.add(pkgId);
          packageMap.set(pkgId, apkPath);
        }
      } else if (payload) {
        allPackagesSet.add(payload);
      }
    }

    // Ensure all packages from thirdParty, disabled, and system sets are included
    for (const id of thirdPartySet) allPackagesSet.add(id);
    for (const id of disabledSet) allPackagesSet.add(id);
    for (const id of systemSet) allPackagesSet.add(id);

    const packages = Array.from(allPackagesSet).sort();
    const disabledPackages = Array.from(disabledSet).sort();
    const thirdPartyPackages = Array.from(thirdPartySet).sort();
    const systemPackages = packages.filter((id) => !thirdPartySet.has(id));

    const packageStatuses = packages.map((id) => {
      const apkPath = packageMap.get(id);
      const isThird = thirdPartySet.has(id) || (!systemSet.has(id) && Boolean(apkPath?.startsWith("/data/")));
      const isSys = !isThird;

      return {
        id,
        status: (disabledSet.has(id) ? "disabled" : "enabled") as "disabled" | "enabled",
        isSystem: isSys,
        isThirdParty: isThird,
        apkPath,
      };
    });

    return {
      result: mainResult,
      packages,
      disabledPackages,
      systemPackages,
      thirdPartyPackages,
      packageStatuses,
      packageMap,
    };
  }

  async listDisabledPackages() {
    const result = await this.run("pm list packages -d");
    const packages = result.stdout
      .split(/[\r\n]+/)
      .map((line) => line.replace(/^package:/, "").trim())
      .filter(Boolean)
      .sort();
    return { result, packages };
  }

  async listUsers() {
    return this.run("pm list users");
  }

  async probeRoot() {
    const result = await this.run("su -c id");
    return {
      result,
      granted: result.exitCode === 0 && /uid=0/.test(result.stdout),
    };
  }

  async disablePackage(id: string) {
    return this.run(`pm disable-user --user 0 ${safePackage(id)}`);
  }

  async uninstallForUser(id: string) {
    return this.run(`pm uninstall -k --user 0 ${safePackage(id)}`);
  }

  async restorePackage(id: string) {
    const safe = safePackage(id);
    return this.run(`cmd package install-existing --user 0 ${safe} || pm enable ${safe}`);
  }

  async applyRoot(command: string) {
    return this.run(`su -c ${JSON.stringify(command)}`);
  }

  async installApk(file: File) {
    const adb = this.requireAdb();
    const filename = safeFilename(file.name || "package.apk");
    const target = `/data/local/tmp/${filename}`;
    const sync = await adb.sync();
    try {
      await sync.write({ filename: target, file: readableFile(file) });
    } finally {
      await sync.dispose();
    }
    return this.run(`pm install -r -g ${target}`);
  }

  async listFiles(path: string): Promise<DeviceFile[]> {
    const adb = this.requireAdb();
    const sync = await adb.sync();
    try {
      const entries = await sync.readdir(path);
      return entries
        .map((entry) => ({
          name: entry.name,
          size: Number(entry.size),
          modified: Number(entry.mtime),
          isDirectory: entry.type === 4,
        }))
        .sort(
          (left, right) =>
            Number(right.isDirectory) - Number(left.isDirectory) ||
            left.name.localeCompare(right.name)
        );
    } finally {
      await sync.dispose();
    }
  }

  async startMirror(canvas: HTMLCanvasElement): Promise<MirrorSession> {
    const adb = this.requireAdb();
    if (!WebCodecsVideoDecoder.isSupported) {
      throw new Error("This browser does not support WebCodecs. Please use Google Chrome or Microsoft Edge over HTTPS.");
    }

    const serverResponse = await fetch(SCRCPY_SERVER_URL, { cache: "force-cache" });
    if (!serverResponse.ok) {
      throw new Error(`The managed Scrcpy server binary is unavailable (${serverResponse.status}).`);
    }
    await AdbScrcpyClient.pushServer(adb, readableResponse(serverResponse), SCRCPY_SERVER_PATH);

    const options = new AdbScrcpyOptions2_1({
      audio: false,
      control: true,
      videoCodec: "h264",
      maxSize: 0,
      maxFps: 0,
      stayAwake: false,
      showTouches: false,
      tunnelForward: false,
    } as any);

    const client: any = await AdbScrcpyClient.start(adb, SCRCPY_SERVER_PATH, options);

    // Drain server logging output so buffer does not block
    if (client.output) {
      void client.output.pipeTo(new WritableStream<string>({ write() {} })).catch(() => undefined);
    }

    const video: any = await client.videoStream;
    if (!video) {
      await client.close();
      throw new Error("Device started Scrcpy without a video stream.");
    }

    const renderer = new BitmapVideoFrameRenderer(canvas);
    const decoder = new WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer });
    const resize = ({ width, height }: { width: number; height: number }) => {
      canvas.width = width;
      canvas.height = height;
    };
    resize({ width: video.width || 720, height: video.height || 1280 });
    const disposeSizeListener = video.sizeChanged ? video.sizeChanged(resize) : () => {};
    const pipe = video.stream.pipeTo(decoder.writable).catch(() => undefined);

    const stop = async () => {
      this.activeStreams.delete(stop);
      disposeSizeListener();
      try {
        decoder.dispose();
      } catch {}
      try {
        await client.close();
      } catch {}
      await pipe;
    };

    this.activeStreams.add(stop);

    return {
      width: video.width || 720,
      height: video.height || 1280,
      codec: String(video.metadata?.codec || "h264"),
      stop,
    };
  }

  async startLogcat(onEntry: (entry: LogcatEntry) => void): Promise<LogcatStreamSession> {
    const adb = this.requireAdb();
    let stopped = false;
    let proc: any = null;

    try {
      proc = await adb.subprocess.spawn("logcat -v threadtime");
    } catch {
      try {
        proc = await adb.subprocess.spawn(["logcat", "-v", "threadtime"]);
      } catch {
        proc = await adb.subprocess.shell("logcat -v threadtime");
      }
    }

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let pending = "";

    const parseLine = (line: string): LogcatEntry | null => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("--------- beginning of")) return null;

      // Threadtime format: "09-10 17:02:15.123  1234  5678 D TagName : Log message content"
      const threadtimeMatch = trimmed.match(
        /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+?)\s*:\s*(.*)$/
      );
      if (threadtimeMatch) {
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: threadtimeMatch[1],
          pid: threadtimeMatch[2],
          tid: threadtimeMatch[3],
          level: threadtimeMatch[4] as LogcatLevel,
          tag: threadtimeMatch[5].trim(),
          message: threadtimeMatch[6],
          raw: trimmed,
        };
      }

      // Time format: "09-10 17:02:15.123 D/TagName( 1234): Message"
      const timeMatch = trimmed.match(
        /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+([VDIWEF])\/([^(]+?)\(\s*(\d+)\):\s*(.*)$/
      );
      if (timeMatch) {
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: timeMatch[1],
          pid: timeMatch[4],
          tid: "",
          level: timeMatch[2] as LogcatLevel,
          tag: timeMatch[3].trim(),
          message: timeMatch[5],
          raw: trimmed,
        };
      }

      // Brief format: "D/TagName( 1234): Message"
      const briefMatch = trimmed.match(/^([VDIWEF])\/([^(]+?)\(\s*(\d+)\):\s*(.*)$/);
      if (briefMatch) {
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString().slice(11, 23),
          pid: briefMatch[3],
          tid: "",
          level: briefMatch[1] as LogcatLevel,
          tag: briefMatch[2].trim(),
          message: briefMatch[4],
          raw: trimmed,
        };
      }

      let inferredLevel: LogcatLevel = "I";
      if (/^[EF][\s\/:_]/i.test(trimmed) || /\b(error|exception|fatal|crash)\b/i.test(trimmed)) {
        inferredLevel = "E";
      } else if (/^[W][\s\/:_]/i.test(trimmed) || /\b(warn|warning)\b/i.test(trimmed)) {
        inferredLevel = "W";
      } else if (/^[D][\s\/:_]/i.test(trimmed) || /\b(debug)\b/i.test(trimmed)) {
        inferredLevel = "D";
      } else if (/^[V][\s\/:_]/i.test(trimmed) || /\b(verbose)\b/i.test(trimmed)) {
        inferredLevel = "V";
      }

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString().slice(11, 23),
        pid: "-",
        tid: "-",
        level: inferredLevel,
        tag: "System",
        message: trimmed,
        raw: trimmed,
      };
    };

    const runLoop = async () => {
      try {
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const line of lines) {
              const parsed = parseLine(line);
              if (parsed) onEntry(parsed);
            }
          }
        }
      } catch {
        // Stream finished or connection closed
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    };

    void runLoop();

    const stop = async () => {
      this.activeStreams.delete(stop);
      stopped = true;
      try {
        await reader.cancel();
      } catch {}
      try {
        await proc.kill();
      } catch {}
    };

    this.activeStreams.add(stop);

    return { stop };
  }

  async clearLogcat(): Promise<CommandResult> {
    return this.run("logcat -c");
  }
}
