import React, { useState, useEffect, useRef, useCallback } from "react";
import type { BrowserAdbClient } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MonitorUp,
  Play,
  Square,
  RotateCcw,
  Volume2,
  Volume1,
  Power,
  Layers,
  ChevronLeft,
  Circle,
  Square as SquareIcon,
  Smartphone,
  Maximize2,
  Loader2,
  Sliders,
  CheckCircle2,
  Radio,
  Sparkles,
} from "lucide-react";
import {
  AdbScrcpyClient,
  AdbScrcpyOptions2_1,
} from "@yume-chan/adb-scrcpy";
import {
  ScrcpyOptions2_1,
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidMotionEventAction,
} from "@yume-chan/scrcpy";
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import {
  ReadableStream as AdbReadableStream,
  WritableStream as AdbWritableStream,
} from "@yume-chan/stream-extra";

export interface MirrorWorkspaceProps {
  client: BrowserAdbClient | null;
  isConnected: boolean;
  language?: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    serial?: string;
  } | null;
}

const SCRCPY_SERVER_PATH = "/data/local/tmp/scrcpy-server.jar";

function readableResponse(response: Response) {
  if (!response.body) throw new Error("Scrcpy server binary stream is unavailable.");
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

export const MirrorWorkspace: React.FC<MirrorWorkspaceProps> = ({
  client,
  isConnected,
  language = "en",
  device,
}) => {
  const isArabic = language === "ar";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrcpyClientRef = useRef<AdbScrcpyClient | null>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const isPointerDownRef = useRef(false);

  const [phase, setPhase] = useState<"idle" | "starting" | "live" | "stopping" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 720, height: 1280 });
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [codecName, setCodecName] = useState("H.264 (AVC)");

  // Cleanly stops the Scrcpy mirror session
  const stopMirror = useCallback(async () => {
    setPhase("stopping");
    setStatusMessage(isArabic ? "جاري إغلاق نفق Scrcpy وفك التشفير..." : "Closing Scrcpy video tunnel & decoder...");

    if (decoderRef.current) {
      try {
        decoderRef.current.dispose();
      } catch {}
      decoderRef.current = null;
    }

    if (scrcpyClientRef.current) {
      try {
        await scrcpyClientRef.current.close();
      } catch {}
      scrcpyClientRef.current = null;
    }

    setPhase("idle");
    setStatusMessage(isArabic ? "بث الشاشة في وضع الاستعداد." : "Screen mirroring session stopped.");
  }, [isArabic]);

  // Starts Scrcpy mirroring pipeline
  const startMirror = useCallback(async () => {
    if (!client || !isConnected) {
      toast.error(isArabic ? "الرجاء توصيل جهاز Android أولاً" : "Connect an Android device via WebUSB first");
      return;
    }

    const rawAdb = client.getAdbInstance();
    if (!rawAdb) {
      toast.error(isArabic ? "جلسة ADB غير مهيأة" : "ADB transport unavailable");
      return;
    }

    if (!WebCodecsVideoDecoder.isSupported) {
      toast.error(
        isArabic
          ? "المتصفح لا يدعم WebCodecs. يرجى استخدام Google Chrome أو Microsoft Edge عبر HTTPS."
          : "WebCodecs VideoDecoder is unsupported in this browser. Please use Chrome/Edge."
      );
      setPhase("error");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setPhase("starting");
    setStatusMessage(isArabic ? "التحقق من خادم Scrcpy على الجهاز..." : "Verifying Scrcpy server on device...");

    try {
      // 1. Check if scrcpy-server.jar exists on device; if missing or empty, push it
      let serverExists = false;
      try {
        const checkRes = await client.run(`ls -l ${SCRCPY_SERVER_PATH}`);
        if (checkRes.exitCode === 0 && checkRes.stdout && !checkRes.stdout.includes("No such file")) {
          serverExists = true;
        }
      } catch {
        serverExists = false;
      }

      if (!serverExists) {
        setStatusMessage(isArabic ? "نقل ملف scrcpy-server.jar عبر WebUSB..." : "Pushing scrcpy-server.jar to device...");
        
        // Fetch server binary from local static storage with fallback
        let serverRes: Response | null = null;
        const candidates = [
          "/scrcpy-server.jar",
          "/manus-storage/scrcpy-server-2.1_0e0bd7e6.bin",
          "https://github.com/Genymobile/scrcpy/releases/download/v2.1/scrcpy-server-v2.1",
        ];

        for (const url of candidates) {
          try {
            const r = await fetch(url, { cache: "force-cache" });
            if (r.ok) {
              serverRes = r;
              break;
            }
          } catch {}
        }

        if (!serverRes || !serverRes.ok) {
          throw new Error("Unable to locate scrcpy-server binary on web server or fallback repository.");
        }

        await AdbScrcpyClient.pushServer(rawAdb, readableResponse(serverRes), SCRCPY_SERVER_PATH);
      }

      // 2. Initialize low-latency Scrcpy 2.1 options
      setStatusMessage(isArabic ? "بدء خادم Scrcpy ومفاوضة البث..." : "Spawning Scrcpy server with low-latency flags...");

      const options = new AdbScrcpyOptions2_1(
        new ScrcpyOptions2_1({
          maxSize: 1080,
          maxFps: 30,
          videoBitRate: 4000000,
          sendDeviceMeta: false,
          sendFrameMeta: false,
          audio: false,
          control: true,
          videoCodec: "h264",
          stayAwake: true,
          tunnelForward: false,
        })
      );

      const scrcpyClient = await AdbScrcpyClient.start(rawAdb, SCRCPY_SERVER_PATH, options);
      scrcpyClientRef.current = scrcpyClient;

      // Drain server logging output so buffer does not stall
      if (scrcpyClient.stdout) {
        void scrcpyClient.stdout.pipeTo(
          new AdbWritableStream<string>({
            write() {},
          })
        ).catch(() => undefined);
      }

      // 3. Acquire video stream
      const videoStream = await scrcpyClient.videoStream;
      if (!videoStream) {
        await scrcpyClient.close();
        throw new Error("Device started Scrcpy daemon without a video stream.");
      }

      // 4. Mount hardware WebCodecs VideoDecoder
      const renderer = new BitmapVideoFrameRenderer(canvas);
      const decoder = new WebCodecsVideoDecoder({
        codec: videoStream.metadata.codec,
        renderer,
      });
      decoderRef.current = decoder;

      const initialWidth = videoStream.metadata.width || 720;
      const initialHeight = videoStream.metadata.height || 1280;
      canvas.width = initialWidth;
      canvas.height = initialHeight;
      setDimensions({ width: initialWidth, height: initialHeight });
      setOrientation(initialHeight >= initialWidth ? "portrait" : "landscape");
      
      const codecMap: Record<number, string> = {
        1748121140: "H.264 (AVC)",
        1748121141: "H.265 (HEVC)",
        6387249: "AV1",
      };
      setCodecName(codecMap[videoStream.metadata.codec] || "H.264");

      // Listen for rotation / orientation dynamic changes
      if (typeof (videoStream as any).sizeChanged === "function") {
        (videoStream as any).sizeChanged(({ width, height }: { width: number; height: number }) => {
          canvas.width = width;
          canvas.height = height;
          setDimensions({ width, height });
          setOrientation(height >= width ? "portrait" : "landscape");
        });
      }

      // Pipe video packets to decoder
      void videoStream.stream.pipeTo(decoder.writable).catch(() => undefined);

      // Handle server unexpected exit
      void scrcpyClient.exit.then(() => {
        void stopMirror();
      });

      setPhase("live");
      setStatusMessage(isArabic ? "بث الشاشة نشط والتحكم باللمس مفعل." : "Hardware mirror live with touch input enabled.");
      toast.success(isArabic ? "تم بدء مرآة الشاشة بنجاح" : "Screen mirroring live");
    } catch (err: any) {
      console.error("Scrcpy start failed:", err);
      setPhase("error");
      setStatusMessage(err?.message || "Failed initializing Scrcpy stream");
      toast.error(
        isArabic
          ? `فشل تشغيل مرآة الشاشة: ${err?.message || "خطأ غير معروف"}`
          : `Mirror initialization failed: ${err?.message || "Unknown error"}`
      );
    }
  }, [client, isConnected, isArabic, stopMirror]);

  // Coordinate translator: Canvas relative coordinates -> Native Android device coordinates
  const getDeviceCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;

    const x = Math.max(0, Math.min(dimensions.width, Math.round((e.clientX - rect.left) * scaleX)));
    const y = Math.max(0, Math.min(dimensions.height, Math.round((e.clientY - rect.top) * scaleY)));

    return { x, y };
  };

  // Mouse-to-Touch Control Injection
  const handlePointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "live" || !scrcpyClientRef.current?.controller || !canvasRef.current) return;
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {}
    isPointerDownRef.current = true;
    const { x, y } = getDeviceCoords(e);

    try {
      await scrcpyClientRef.current.controller.injectTouch({
        action: AndroidMotionEventAction.Down,
        pointerId: 0n,
        pointerX: x,
        pointerY: y,
        screenWidth: dimensions.width,
        screenHeight: dimensions.height,
        pressure: 1,
        actionButton: 0,
        buttons: 1,
      });
    } catch (err) {
      console.debug("Touch down error:", err);
    }
  };

  const handlePointerMove = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current || phase !== "live" || !scrcpyClientRef.current?.controller) return;
    const { x, y } = getDeviceCoords(e);

    try {
      await scrcpyClientRef.current.controller.injectTouch({
        action: AndroidMotionEventAction.Move,
        pointerId: 0n,
        pointerX: x,
        pointerY: y,
        screenWidth: dimensions.width,
        screenHeight: dimensions.height,
        pressure: 1,
        actionButton: 0,
        buttons: 1,
      });
    } catch (err) {
      console.debug("Touch move error:", err);
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current || phase !== "live" || !scrcpyClientRef.current?.controller) return;
    isPointerDownRef.current = false;
    try {
      if (canvasRef.current && canvasRef.current.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const { x, y } = getDeviceCoords(e);

    try {
      await scrcpyClientRef.current.controller.injectTouch({
        action: AndroidMotionEventAction.Up,
        pointerId: 0n,
        pointerX: x,
        pointerY: y,
        screenWidth: dimensions.width,
        screenHeight: dimensions.height,
        pressure: 0,
        actionButton: 0,
        buttons: 0,
      });
    } catch (err) {
      console.debug("Touch up error:", err);
    }
  };

  // Device Hardware Buttons Toolbar: Injects standard Android keycodes
  const injectKey = async (keyCode: AndroidKeyCode, label: string) => {
    const controller = scrcpyClientRef.current?.controller;
    if (controller) {
      try {
        await controller.injectKeyCode({
          keyCode,
          action: AndroidKeyEventAction.Down,
          repeat: 0,
          metaState: 0,
        });
        await controller.injectKeyCode({
          keyCode,
          action: AndroidKeyEventAction.Up,
          repeat: 0,
          metaState: 0,
        });
        return;
      } catch (err) {
        console.warn("Direct keycode injection fallback:", err);
      }
    }

    // Secondary fallback via ADB shell input
    if (client) {
      try {
        await client.run(`input keyevent ${keyCode}`);
      } catch (err: any) {
        toast.error(err?.message || "Failed sending keyevent");
      }
    }
  };

  // Clean up when unmounting or switching tabs
  useEffect(() => {
    return () => {
      void stopMirror();
    };
  }, [stopMirror]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. Top Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#274b35]/10 dark:bg-emerald-500/20 text-[#274b35] dark:text-emerald-400 flex items-center justify-center font-bold">
              <MonitorUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "بث الشاشة التفاعلي والتحكم (Web Scrcpy)" : "Web Scrcpy Screen Mirror & Control"}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#f4ede2] dark:bg-slate-800 text-[#534335] dark:text-slate-300 border border-[#d8d1c4] dark:border-slate-700">
                  08 MIRROR
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold font-mono border ${
                    phase === "live"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                      : phase === "starting"
                        ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                        : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      phase === "live"
                        ? "bg-emerald-500 animate-pulse"
                        : phase === "starting"
                          ? "bg-amber-500 animate-spin"
                          : "bg-slate-400"
                    }`}
                  />
                  <span>
                    {phase === "live"
                      ? isArabic
                        ? "بث مباشر"
                        : "LIVE STREAM"
                      : phase === "starting"
                        ? isArabic
                          ? "جاري البدء"
                          : "CONNECTING"
                        : isArabic
                          ? "غير متصل"
                          : "IDLE"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isArabic
                  ? "فك تشفير عتادي فائق السرعة عبر WebCodecs مع إرسال أحداث اللمس ومفاتيح النظام"
                  : "Hardware-accelerated WebCodecs video decoding with interactive touch & key event forwarding"}
              </p>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2">
            {phase !== "live" ? (
              <Button
                onClick={startMirror}
                disabled={!isConnected || phase === "starting"}
                className="bg-[#274b35] hover:bg-[#1e3c29] text-white font-medium text-xs gap-1.5 shadow-xs"
              >
                {phase === "starting" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{isArabic ? "بدء بث الشاشة" : "Start Live Mirror"}</span>
              </Button>
            ) : (
              <Button
                onClick={stopMirror}
                variant="destructive"
                className="text-xs gap-1.5 shadow-xs"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{isArabic ? "إيقاف البث" : "Stop Mirror"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Telemetry info bar */}
        {phase === "live" && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>
                {isArabic ? "الدقة:" : "Resolution:"} {dimensions.width}×{dimensions.height}
              </span>
              <span>
                {isArabic ? "الترميز:" : "Codec:"} {codecName}
              </span>
              <span>
                {isArabic ? "الوضع:" : "Orientation:"} {orientation.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              30 FPS · 4.0 Mbps · Low Latency
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Mirror Stage: Phone Chassis + Floating Navigation Controls */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 min-h-[560px] p-4 bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl relative">
        {/* Device Stage with simulated bezel */}
        <div
          className={`relative rounded-3xl p-3 bg-slate-900 border-4 border-slate-800 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 ${
            orientation === "portrait" ? "max-w-[420px]" : "max-w-[800px]"
          }`}
        >
          {/* Top Speaker / Sensor notch */}
          <div className="w-20 h-3 bg-slate-800 rounded-full mb-2 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-slate-700" />
          </div>

          {/* Canvas container */}
          <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`block max-h-[70vh] w-auto object-contain cursor-crosshair touch-none select-none ${
                phase === "live" ? "" : "hidden"
              }`}
              style={{
                aspectRatio: `${dimensions.width} / ${dimensions.height}`,
              }}
            />

            {/* Placeholder state when not streaming */}
            {phase !== "live" && (
              <div className="w-[320px] h-[580px] flex flex-col items-center justify-center p-6 text-center text-slate-400">
                {phase === "starting" ? (
                  <div className="space-y-3">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-200">
                      {isArabic ? "جاري تهيئة البث المباشر..." : "Establishing WebUSB Scrcpy Pipe..."}
                    </p>
                    <p className="text-xs text-slate-400">{statusMessage}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <Smartphone className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-200">
                        {isArabic ? "شاشة أندرويد في وضع الاستعداد" : "Device Display Idle"}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        {isConnected
                          ? isArabic
                            ? "اضغط على 'بدء بث الشاشة' لعرض شاشة الجهاز والتحكم بها بالماوس مباشرة."
                            : "Click 'Start Live Mirror' to stream the display and inject touch events."
                          : isArabic
                            ? "الرجاء توصيل جهاز Android أولاً لتفعيل بث الشاشة."
                            : "Connect an Android device via WebUSB to enable interactive mirroring."}
                      </p>
                    </div>
                    {isConnected && (
                      <Button
                        onClick={startMirror}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{isArabic ? "بدء البث الآن" : "Launch Mirror"}</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom On-Screen Navigation Bar */}
          <div className="w-full flex items-center justify-around py-3 mt-1 text-slate-400">
            <button
              onClick={() => injectKey(AndroidKeyCode.AndroidBack, "Back")}
              disabled={phase !== "live"}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-30"
              title="Back (Keycode 4)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => injectKey(AndroidKeyCode.AndroidHome, "Home")}
              disabled={phase !== "live"}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-30"
              title="Home (Keycode 3)"
            >
              <Circle className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => injectKey(AndroidKeyCode.AndroidAppSwitch, "Recents")}
              disabled={phase !== "live"}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-30"
              title="App Switcher (Keycode 187)"
            >
              <SquareIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Floating Device Hardware Controls Toolbar */}
        <div className="flex lg:flex-col items-center gap-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden lg:block text-center py-1">
            Keys
          </span>

          <button
            onClick={() => injectKey(AndroidKeyCode.Power, "Power")}
            disabled={!isConnected}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-red-950/60 text-slate-300 hover:text-red-400 border border-slate-700/60 transition-all disabled:opacity-30 flex flex-col items-center gap-1"
            title="Power / Screen Off (Keycode 26)"
          >
            <Power className="w-4 h-4" />
            <span className="text-[9px] font-mono">PWR</span>
          </button>

          <button
            onClick={() => injectKey(AndroidKeyCode.VolumeUp, "Volume Up")}
            disabled={!isConnected}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all disabled:opacity-30 flex flex-col items-center gap-1"
            title="Volume Up (Keycode 24)"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-[9px] font-mono">VOL+</span>
          </button>

          <button
            onClick={() => injectKey(AndroidKeyCode.VolumeDown, "Volume Down")}
            disabled={!isConnected}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all disabled:opacity-30 flex flex-col items-center gap-1"
            title="Volume Down (Keycode 25)"
          >
            <Volume1 className="w-4 h-4" />
            <span className="text-[9px] font-mono">VOL-</span>
          </button>

          <button
            onClick={() => injectKey(AndroidKeyCode.AndroidAppSwitch, "App Switcher")}
            disabled={!isConnected}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all disabled:opacity-30 flex flex-col items-center gap-1"
            title="App Switcher (Keycode 187)"
          >
            <Layers className="w-4 h-4" />
            <span className="text-[9px] font-mono">APPS</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MirrorWorkspace;
