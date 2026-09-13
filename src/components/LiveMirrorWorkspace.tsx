import React from "react";
import { MonitorUp, Play, Square, Loader2, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MirrorState = {
  phase: "idle" | "starting" | "live" | "stopping" | "unsupported" | "error";
  detail: string;
  width?: number;
  height?: number;
  codec?: string;
};

interface LiveMirrorWorkspaceProps {
  language: "en" | "ar" | "other";
  isLive: boolean;
  state: MirrorState;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function LiveMirrorWorkspace({
  language,
  isLive,
  state,
  canvasRef,
  start,
  stop,
}: LiveMirrorWorkspaceProps) {
  const isArabic = language === "ar";
  const isRunning = state.phase === "live" || state.phase === "starting";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker text-[#59869c]">
              {isArabic ? "بث الشاشة المباشر" : "Hardware Display Mirror"}
            </span>
            <span
              className={`status-stamp ${
                state.phase === "live"
                  ? "border-[#527321] text-[#527321]"
                  : state.phase === "starting"
                  ? "border-[#b37416] text-[#b37416]"
                  : "border-[#687584] text-[#687584]"
              }`}
            >
              {state.phase}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "مرآة الشاشة عبر WebCodecs Scrcpy" : "In-Browser Scrcpy Stream"}
          </h2>
          <p className="mt-1 text-xs text-[#526273] dark:text-[#9bb2ca]">
            {state.detail}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button
              onClick={start}
              disabled={!isLive}
              className="bg-[#c8f04a] text-[#14253a] hover:bg-[#b8e23b] font-semibold text-xs h-9 px-4"
            >
              <Play size={14} className="mr-2" />
              {isArabic ? "بدء مرآة الشاشة" : "Start Live Mirror"}
            </Button>
          ) : (
            <Button
              onClick={stop}
              variant="destructive"
              className="font-semibold text-xs h-9 px-4"
            >
              <Square size={14} className="mr-2" />
              {isArabic ? "إيقاف البث" : "Stop Mirror"}
            </Button>
          )}
        </div>
      </div>

      <div className="service-card rounded-md p-4 flex flex-col items-center justify-center min-h-[440px] bg-[#0c1824] border-[#223952] relative overflow-hidden">
        {state.phase === "live" ? (
          <div className="relative max-h-[70vh] flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-h-[68vh] w-auto rounded border border-[#2d4661] shadow-2xl object-contain bg-black"
            />
            {state.width && state.height && (
              <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 mono text-[0.65rem] text-[#c8f04a]">
                {state.width}×{state.height} · {state.codec || "H.264"}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-md">
            {state.phase === "starting" ? (
              <>
                <Loader2 size={36} className="text-[#c8f04a] animate-spin mb-3" />
                <p className="font-semibold text-sm text-[#f6f2ea]">
                  {isArabic ? "جاري تهيئة خادم Scrcpy..." : "Negotiating hardware video stream..."}
                </p>
                <p className="mt-1 text-xs text-[#9bb2ca]">
                  {isArabic
                    ? "يتم إرسال scrcpy-server.jar عبر WebUSB وبدء فك تشفير H.264 محلياً."
                    : "Pushing scrcpy-server.jar to /data/local/tmp and starting WebCodecs decoder."}
                </p>
              </>
            ) : (
              <>
                <div className="p-3 rounded-full bg-[#182a3c] text-[#59869c] mb-3">
                  <MonitorUp size={32} />
                </div>
                <p className="font-semibold text-sm text-[#f6f2ea]">
                  {isArabic ? "بث الشاشة في وضع الاستعداد" : "Mirroring is idle"}
                </p>
                <p className="mt-1 text-xs text-[#9bb2ca] leading-relaxed">
                  {isLive
                    ? (isArabic
                        ? "اضغط على 'بدء مرآة الشاشة' لتشغيل البث فائق السرعة عبر كابل USB مباشرة."
                        : "Click 'Start Live Mirror' to stream the display locally at low latency.")
                    : (isArabic
                        ? "صل جهاز Android عبر كابل USB وفعل تصحيح الأخطاء أولاً."
                        : "Connect and authorize an Android device first via WebUSB.")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
