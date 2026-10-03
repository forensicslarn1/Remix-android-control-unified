import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { BrowserAdbClient } from "@/lib/adbClient";
import type { AdbSubprocessProtocol } from "@yume-chan/adb";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Trash2,
  OctagonAlert,
  Activity,
  BatteryCharging,
  Cpu,
  FileText,
  ShieldCheck,
  Maximize2,
} from "lucide-react";

export interface TerminalWorkspaceProps {
  client: BrowserAdbClient | null;
  isConnected: boolean;
  language?: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    serial?: string;
  } | null;
}

export const TerminalWorkspace: React.FC<TerminalWorkspaceProps> = ({
  client,
  isConnected,
  language = "en",
  device,
}) => {
  const isArabic = language === "ar";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const shellRef = useRef<AdbSubprocessProtocol | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<any> | null>(null);

  const [sessionActive, setSessionActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [termDimensions, setTermDimensions] = useState<{ cols: number; rows: number }>({ cols: 80, rows: 24 });

  // Kill active process (Ctrl+C / \x03)
  const sendBreakSignal = useCallback(async () => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.write(new Uint8Array([3])); // ASCII 3 = ETX / Ctrl+C
      toast.info(isArabic ? "تم إرسال إشارة الإيقاف (Ctrl+C)" : "Sent SIGINT break signal (Ctrl+C)");
    } catch (err: any) {
      console.error("Failed sending break signal:", err);
    }
  }, [isArabic]);

  // Execute terminal macro
  const runMacro = useCallback(async (command: string, label: string) => {
    if (!writerRef.current) {
      toast.error(isArabic ? "الطرفية غير متصلة بالجهاز" : "Terminal shell not connected");
      return;
    }
    try {
      // First interrupt any hanging prompt, then send command with newline
      await writerRef.current.write(new TextEncoder().encode(command + "\n"));
      toast.success(
        isArabic ? `تم تشغيل: ${label}` : `Executing macro: ${label}`
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed executing macro");
    }
  }, [isArabic]);

  // Clear terminal viewport
  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      toast.info(isArabic ? "تم مسح شاشة الطرفية" : "Terminal viewport cleared");
    }
  }, [isArabic]);

  // Cleanly close shell process & writers
  const closeSession = useCallback(async () => {
    if (writerRef.current) {
      try {
        await writerRef.current.close().catch(() => undefined);
      } catch {}
      writerRef.current = null;
    }

    if (shellRef.current) {
      try {
        await shellRef.current.kill();
      } catch {}
      shellRef.current = null;
    }

    setSessionActive(false);
  }, []);

  // Initialize and spawn interactive ADB shell session
  const startSession = useCallback(async () => {
    if (!client || !isConnected) {
      toast.error(isArabic ? "الرجاء توصيل جهاز Android أولاً" : "Connect an Android device via WebUSB first");
      return;
    }

    const rawAdb = client.getAdbInstance();
    if (!rawAdb) {
      toast.error(isArabic ? "جلسة ADB غير مهيأة" : "ADB instance is not available");
      return;
    }

    setConnecting(true);
    await closeSession();

    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term) {
      setConnecting(false);
      return;
    }

    term.write("\r\n\x1b[36m[ADB Terminal]\x1b[0m Spawning interactive PTY shell via WebUSB...\r\n");

    try {
      // Spawn standard interactive shell on Android device
      const process = await rawAdb.subprocess.shell();
      shellRef.current = process;

      // Fit terminal and sync PTY window geometry
      if (fitAddon) {
        fitAddon.fit();
        setTermDimensions({ cols: term.cols, rows: term.rows });
        if (typeof process.resize === "function") {
          try {
            await process.resize(term.rows, term.cols);
          } catch {}
        }
      }

      // Writer for stdin
      const writer = process.stdin.getWriter();
      writerRef.current = writer;

      // Read stdout stream
      const stdoutReader = process.stdout.getReader();
      const readStdout = async () => {
        try {
          while (true) {
            const { done, value } = await stdoutReader.read();
            if (done) break;
            if (value && terminalRef.current) {
              terminalRef.current.write(value);
            }
          }
        } catch {
          // Stream cancelled on disconnect
        } finally {
          try {
            stdoutReader.releaseLock();
          } catch {}
        }
      };
      void readStdout();

      // Read stderr stream if protocol separates stdout/stderr
      if (process.stderr) {
        const stderrReader = process.stderr.getReader();
        const readStderr = async () => {
          try {
            while (true) {
              const { done, value } = await stderrReader.read();
              if (done) break;
              if (value && terminalRef.current) {
                terminalRef.current.write(value);
              }
            }
          } catch {
            // Stream cancelled
          } finally {
            try {
              stderrReader.releaseLock();
            } catch {}
          }
        };
        void readStderr();
      }

      // Handle process exit
      void process.exit.then((code) => {
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[33m[Process exited with status ${code}]\x1b[0m\r\n`);
        }
        setSessionActive(false);
      });

      setSessionActive(true);
      term.write("\x1b[32m[Connected]\x1b[0m Direct shell link established. Ready for input.\r\n\r\n");
    } catch (err: any) {
      console.error("Shell spawn error:", err);
      term.write(`\r\n\x1b[31m[Error spawning shell]: ${err?.message || "Unknown error"}\x1b[0m\r\n`);
      toast.error(
        isArabic
          ? `فشل بدء جلسة الطرفية: ${err?.message || "خطأ غير معروف"}`
          : `Failed starting interactive shell: ${err?.message || "Unknown error"}`
      );
    } finally {
      setConnecting(false);
    }
  }, [client, isConnected, closeSession, isArabic]);

  // Mount Xterm instance on component mount
  useEffect(() => {
    if (!containerRef.current) return;

    // High-contrast, clean dark theme
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: "#0a131e",
        foreground: "#e2e8f0",
        cursor: "#c8f04a",
        selectionBackground: "rgba(56, 189, 248, 0.3)",
        black: "#1e293b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#ec4899",
        cyan: "#06b6d4",
        white: "#f8fafc",
        brightBlack: "#475569",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fde047",
        brightBlue: "#60a5fa",
        brightMagenta: "#f472b6",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial sizing
    try {
      fitAddon.fit();
      setTermDimensions({ cols: term.cols, rows: term.rows });
    } catch {}

    // Hook user keyboard input directly to ADB shell stdin
    const onDataDisposable = term.onData(async (data) => {
      if (writerRef.current) {
        try {
          await writerRef.current.write(new TextEncoder().encode(data));
        } catch (err) {
          console.error("Terminal stdin write failed:", err);
        }
      }
    });

    // Resize observer & window listener
    const handleResize = () => {
      try {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          const cols = terminalRef.current.cols;
          const rows = terminalRef.current.rows;
          setTermDimensions({ cols, rows });
          if (shellRef.current && typeof shellRef.current.resize === "function") {
            void shellRef.current.resize(rows, cols);
          }
        }
      } catch {}
    };

    window.addEventListener("resize", handleResize);

    // Initial greeting
    term.write(
      "\x1b[1;32m=== Android Control Center - Interactive Raw ADB Shell ===\x1b[0m\r\n" +
        "\x1b[90mDirect PTY terminal hooked via standard WebUSB transport layer.\x1b[0m\r\n" +
        "\x1b[90mType standard Linux commands (ls, pm, dumpsys, top, getprop, logcat).\x1b[0m\r\n\r\n"
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      onDataDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Auto-start shell when device connects, or close when disconnected
  useEffect(() => {
    if (isConnected && client) {
      void startSession();
    } else {
      void closeSession();
      if (terminalRef.current) {
        terminalRef.current.write("\r\n\x1b[33m[Disconnected]\x1b[0m Connect an Android device to start shell.\r\n");
      }
    }

    return () => {
      void closeSession();
    };
  }, [isConnected, client, startSession, closeSession]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#14253a] text-[#c8f04a] flex items-center justify-center font-bold">
              <TerminalIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "الطرفية التفاعلية المباشرة (ADB Shell)" : "Interactive Raw ADB Terminal"}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#f4ede2] dark:bg-slate-800 text-[#534335] dark:text-slate-300 border border-[#d8d1c4] dark:border-slate-700">
                  07 TERMINAL
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold font-mono border ${
                    sessionActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      sessionActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                    }`}
                  />
                  <span>{sessionActive ? (isArabic ? "جلسة نشطة" : "ACTIVE PTY") : isArabic ? "غير نشط" : "IDLE"}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isArabic
                  ? "محاكي طرفية PTY كامل بدعم ألوان ANSI وإعادة التحجيم التلقائي للأوامر المباشرة"
                  : "Full interactive PTY with ANSI escape sequence rendering & dynamic window resize"}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 px-2.5 py-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md">
              {termDimensions.cols} × {termDimensions.rows}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={startSession}
              disabled={connecting || !isConnected}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 text-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${connecting ? "animate-spin" : ""}`} />
              <span>{isArabic ? "إعادة بدء الجلسة" : "Restart Session"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={sendBreakSignal}
              disabled={!sessionActive}
              className="gap-1.5 border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-mono"
              title="Send Ctrl+C break signal"
            >
              <OctagonAlert className="w-3.5 h-3.5" />
              <span>Ctrl+C</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={clearTerminal}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isArabic ? "مسح الشاشة" : "Clear"}</span>
            </Button>
          </div>
        </div>

        {/* 2. Quick-Action Macro Bar */}
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[10px]">
            {isArabic ? "أوامر سريعة:" : "Macros:"}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => runMacro("logcat -v time", "Live Logcat")}
            disabled={!sessionActive}
            className="h-7 text-xs font-mono gap-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Activity className="w-3 h-3 text-cyan-500" />
            <span>logcat -v time</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => runMacro("top -m 10", "Process Monitor")}
            disabled={!sessionActive}
            className="h-7 text-xs font-mono gap-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Cpu className="w-3 h-3 text-emerald-500" />
            <span>top -m 10</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => runMacro("dumpsys meminfo", "Memory Info")}
            disabled={!sessionActive}
            className="h-7 text-xs font-mono gap-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <FileText className="w-3 h-3 text-purple-500" />
            <span>dumpsys meminfo</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => runMacro("dumpsys battery", "Battery Dump")}
            disabled={!sessionActive}
            className="h-7 text-xs font-mono gap-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <BatteryCharging className="w-3 h-3 text-amber-500" />
            <span>dumpsys battery</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => runMacro("getprop ro.build.fingerprint", "Build Fingerprint")}
            disabled={!sessionActive}
            className="h-7 text-xs font-mono gap-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ShieldCheck className="w-3 h-3 text-blue-500" />
            <span>getprop</span>
          </Button>
        </div>
      </div>

      {/* 3. Xterm Viewport Container */}
      <div className="rounded-xl border border-slate-800 bg-[#0a131e] shadow-xl overflow-hidden relative">
        <div className="h-8 bg-[#070e17] border-b border-slate-800/80 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            <span className="text-[11px] font-mono text-slate-400 ml-2">
              {device ? `${device.manufacturer} ${device.model} (${device.serial})` : "android-shell"}
            </span>
          </div>

          <div className="text-[10px] font-mono text-slate-500">
            {sessionActive ? "UTF-8 · WebUSB Direct Stream" : "OFFLINE"}
          </div>
        </div>

        <div
          ref={containerRef}
          className="p-3 min-h-[520px] max-h-[75vh] w-full overflow-hidden"
          style={{ height: "550px" }}
        />
      </div>
    </div>
  );
};

export default TerminalWorkspace;
