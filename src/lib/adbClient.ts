/**
 * Field Service Ledger style: this module is the explicit device boundary.
 * It must surface the exact command, never silently alter device state, and
 * keep all session data in the browser.
 */
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from "@yume-chan/adb-scrcpy";
import { BitmapVideoFrameRenderer, WebCodecsVideoDecoder } from "@yume-chan/scrcpy-decoder-webcodecs";
import { ReadableStream as AdbReadableStream, WritableStream } from "@yume-chan/stream-extra";

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

export type DeviceFile = { name: string; size: number; modified: number; isDirectory: boolean };
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

const packageId = /^[A-Za-z0-9._]+$/;
const SCRCPY_SERVER_URL = "/manus-storage/scrcpy-server-2.1_0e0bd7e6.bin";
const SCRCPY_SERVER_PATH = "/data/local/tmp/scrcpy-server.jar";

function safePackage(value: string) {
  if (!packageId.test(value)) throw new Error("Invalid package identifier.");
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
  if (!response.body) throw new Error("The Scrcpy server binary could not be read from managed static storage.");
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

export class BrowserAdbClient {
  private adb: Adb | null = null;

  static isSupported() {
    return Boolean(AdbDaemonWebUsbDeviceManager.BROWSER);
  }

  get isConnected() {
    return Boolean(this.adb);
  }

  async connect(): Promise<DeviceProfile> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) throw new Error("WebUSB is unavailable. Open this page over HTTPS in a Chromium-based browser.");

    const device = await manager.requestDevice();
    if (!device) throw new Error("No USB device was selected.");

    const connection = await device.connect();
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: new AdbWebCredentialStore("Android Control Center"),
    });
    this.adb = new Adb(transport);

    const [manufacturer, model, androidVersion, sdk] = await Promise.all([
      this.adb.getProp("ro.product.manufacturer"),
      this.adb.getProp("ro.product.model"),
      this.adb.getProp("ro.build.version.release"),
      this.adb.getProp("ro.build.version.sdk"),
    ]);

    return { serial: device.serial, manufacturer, model, androidVersion, sdk };
  }

  async disconnect(): Promise<void> {
    if (this.adb) {
      try {
        await this.adb.close();
      } catch {
        // ignore error during disconnect
      }
      this.adb = null;
    }
  }

  async getDeviceProfile(): Promise<DeviceProfile | null> {
    if (!this.adb) return null;
    const [manufacturer, model, androidVersion, sdk] = await Promise.all([
      this.adb.getProp("ro.product.manufacturer"),
      this.adb.getProp("ro.product.model"),
      this.adb.getProp("ro.build.version.release"),
      this.adb.getProp("ro.build.version.sdk"),
    ]);
    return {
      serial: (this.adb.transport as any)?.serial || "authorized",
      manufacturer,
      model,
      androidVersion,
      sdk,
    };
  }

  private requireAdb() {
    if (!this.adb) throw new Error("Connect and authorize a device first.");
    return this.adb;
  }

  async run(command: string): Promise<CommandResult> {
    const adb = this.requireAdb();
    const subprocess = adb.subprocess as any;
    const shell = subprocess?.shellProtocol;
    if (shell && (await shell.isSupported)) {
      const result = await shell.spawnWaitText(command);
      return { command, stdout: result.stdout.trim(), stderr: result.stderr.trim(), exitCode: result.exitCode, at: new Date().toISOString() };
    }
    const stdout = await (subprocess?.noneProtocol?.spawnWaitText?.(command) ?? subprocess?.spawnAndWaitText?.(command) ?? "");
    return { command, stdout: String(stdout).trim(), stderr: "", exitCode: 0, at: new Date().toISOString() };
  }

  async listPackages() {
    const [result, disabledResult] = await Promise.all([
      this.run("pm list packages -u"),
      this.run("pm list packages -d").catch(() => ({ command: "pm list packages -d", stdout: "", stderr: "", exitCode: 0, at: new Date().toISOString() })),
    ]);

    const parseList = (text: string) =>
      text
        .split("\n")
        .map((line) => line.replace(/^package:/, "").trim())
        .filter(Boolean);

    const packages = parseList(result.stdout).sort();
    const disabledPackages = parseList(disabledResult.stdout).sort();
    const disabledSet = new Set(disabledPackages);

    return {
      result,
      packages,
      disabledPackages,
      packageStatuses: packages.map((id) => ({
        id,
        status: (disabledSet.has(id) ? "disabled" : "enabled") as "disabled" | "enabled",
      })),
    };
  }

  async listDisabledPackages() {
    const result = await this.run("pm list packages -d");
    return {
      result,
      packages: result.stdout.split("\n").map((line) => line.replace(/^package:/, "").trim()).filter(Boolean).sort(),
    };
  }

  async listUsers() { return this.run("pm list users"); }

  async probeRoot() {
    const result = await this.run("su -c id");
    return { result, granted: result.exitCode === 0 && /uid=0/.test(result.stdout) };
  }

  async disablePackage(id: string) { return this.run(`pm disable-user --user 0 ${safePackage(id)}`); }

  async uninstallForUser(id: string) { return this.run(`pm uninstall -k --user 0 ${safePackage(id)}`); }

  async restorePackage(id: string) {
    const safe = safePackage(id);
    return this.run(`cmd package install-existing --user 0 ${safe} || pm enable ${safe}`);
  }

  async applyRoot(command: string) { return this.run(`su -c ${JSON.stringify(command)}`); }

  async installApk(file: File) {
    const adb = this.requireAdb();
    const filename = safeFilename(file.name || "package.apk");
    const target = `/data/local/tmp/${filename}`;
    const sync = await adb.sync();
    try { await sync.write({ filename: target, file: readableFile(file) }); } finally { await sync.dispose(); }
    return this.run(`pm install -r -g ${target}`);
  }

  async listFiles(path: string): Promise<DeviceFile[]> {
    const adb = this.requireAdb();
    const sync = await adb.sync();
    try {
      const entries = await sync.readdir(path);
      return entries.map((entry) => ({ name: entry.name, size: Number(entry.size), modified: Number(entry.mtime), isDirectory: entry.type === 4 })).sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name));
    } finally {
      await sync.dispose();
    }
  }

  async startMirror(canvas: HTMLCanvasElement): Promise<MirrorSession> {
    const adb = this.requireAdb();
    if (!WebCodecsVideoDecoder.isSupported) throw new Error("This browser does not expose WebCodecs. Use a current Chromium browser over HTTPS.");

    const serverResponse = await fetch(SCRCPY_SERVER_URL, { cache: "force-cache" });
    if (!serverResponse.ok) throw new Error(`The managed Scrcpy server asset is unavailable (${serverResponse.status}).`);
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

    // ADB multiplexing requires server output to be continuously consumed.
    if (client.output) {
      void client.output.pipeTo(new WritableStream<string>({ write() {} })).catch(() => undefined);
    }

    const video: any = await client.videoStream;
    if (!video) {
      await client.close();
      throw new Error("The device started Scrcpy without a video stream.");
    }

    const renderer = new BitmapVideoFrameRenderer(canvas);
    const decoder = new WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer });
    const resize = ({ width, height }: { width: number; height: number }) => { canvas.width = width; canvas.height = height; };
    resize({ width: video.width || 720, height: video.height || 1280 });
    const disposeSizeListener = video.sizeChanged ? video.sizeChanged(resize) : () => {};
    const pipe = video.stream.pipeTo(decoder.writable).catch(() => undefined);

    return {
      width: video.width || 720,
      height: video.height || 1280,
      codec: String(video.metadata?.codec || "h264"),
      stop: async () => {
        disposeSizeListener();
        decoder.dispose();
        await client.close();
        await pipe;
      },
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
      const threadtimeMatch = trimmed.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+?)\s*:\s*(.*)$/);
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
      const timeMatch = trimmed.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+([VDIWEF])\/([^(]+?)\(\s*(\d+)\):\s*(.*)$/);
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
      if (/^[EF][\s\/:_]/i.test(trimmed) || /\b(error|exception|fatal|crash)\b/i.test(trimmed)) inferredLevel = "E";
      else if (/^[W][\s\/:_]/i.test(trimmed) || /\b(warn|warning)\b/i.test(trimmed)) inferredLevel = "W";
      else if (/^[D][\s\/:_]/i.test(trimmed) || /\b(debug)\b/i.test(trimmed)) inferredLevel = "D";
      else if (/^[V][\s\/:_]/i.test(trimmed) || /\b(verbose)\b/i.test(trimmed)) inferredLevel = "V";

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
        // Stream ended or connection reset
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    };

    void runLoop();

    return {
      stop: async () => {
        stopped = true;
        try {
          await reader.cancel();
        } catch {}
        try {
          await proc.kill();
        } catch {}
      },
    };
  }

  async clearLogcat(): Promise<CommandResult> {
    return this.run("logcat -c");
  }
}
