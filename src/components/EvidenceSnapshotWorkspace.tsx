import React, { useState } from "react";
import { ShieldCheck, Download, Play, CheckCircle2, AlertCircle, Loader2, FileText, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommandResult, DeviceProfile } from "@/lib/adbClient";

export interface EvidenceOperation {
  id: string;
  label: string;
  command: string;
  description?: string;
  category?: string;
}

export interface EvidenceOutcome {
  id: string;
  status: "success" | "failure" | "running" | "skipped";
  result?: CommandResult;
  completedAt?: string;
}

interface EvidenceSnapshotWorkspaceProps {
  language: "en" | "ar" | "other";
  isLive: boolean;
  device: DeviceProfile | null;
  run: (operation: EvidenceOperation) => Promise<CommandResult>;
  exportCase: (outcomes: EvidenceOutcome[], selectedOperations: EvidenceOperation[]) => void;
  openSetup: () => void;
}

const DEFAULT_OPERATIONS: EvidenceOperation[] = [
  {
    id: "build-fingerprint",
    label: "Device build fingerprint & cryptographic identity",
    command: "getprop ro.build.fingerprint",
    description: "Extracts tamper-evident OS fingerprint and verified build hash.",
    category: "Identity",
  },
  {
    id: "kernel-version",
    label: "Kernel release & Linux patch level",
    command: "uname -a",
    description: "Verifies running Linux kernel build date and architecture.",
    category: "System",
  },
  {
    id: "installed-packages",
    label: "Inventory of installed user & system packages",
    command: "pm list packages -u -f",
    description: "Full enumeration of all APKs, system privileges, and uninstalled stubs.",
    category: "Software",
  },
  {
    id: "disabled-packages",
    label: "Disabled packages ledger for User 0",
    command: "pm list packages -d",
    description: "Audits debloated, hidden, or frozen system components.",
    category: "Software",
  },
  {
    id: "battery-hardware",
    label: "Battery diagnostics & cycle telemetry",
    command: "dumpsys battery",
    description: "Records battery health, cycle count, temperature, and charging state.",
    category: "Hardware",
  },
  {
    id: "network-interfaces",
    label: "Active network adapters & link addresses",
    command: "ip addr",
    description: "Captures MAC addresses, local interfaces, and Wi-Fi link status.",
    category: "Network",
  },
  {
    id: "security-patch",
    label: "Android OS security patch date",
    command: "getprop ro.build.version.security_patch",
    description: "Official Android bulletin security patch timestamp.",
    category: "Security",
  },
];

export function EvidenceSnapshotWorkspace({
  language,
  isLive,
  device,
  run,
  exportCase,
  openSetup,
}: EvidenceSnapshotWorkspaceProps) {
  const isArabic = language === "ar";
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_OPERATIONS.map((o) => o.id));
  const [outcomes, setOutcomes] = useState<EvidenceOutcome[]>([]);
  const [running, setRunning] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(DEFAULT_OPERATIONS.map((o) => o.id));
  const deselectAll = () => setSelectedIds([]);

  const runAllSelected = async () => {
    if (!isLive || running) return;
    setRunning(true);
    const selectedOps = DEFAULT_OPERATIONS.filter((o) => selectedIds.includes(o.id));
    const currentOutcomes: EvidenceOutcome[] = [];

    for (const op of selectedOps) {
      const outcomeIndex = currentOutcomes.findIndex((o) => o.id === op.id);
      const runningOutcome: EvidenceOutcome = { id: op.id, status: "running" };
      if (outcomeIndex >= 0) {
        currentOutcomes[outcomeIndex] = runningOutcome;
      } else {
        currentOutcomes.push(runningOutcome);
      }
      setOutcomes([...currentOutcomes]);

      try {
        const result = await run(op);
        const finishedOutcome: EvidenceOutcome = {
          id: op.id,
          status: result.exitCode === 0 ? "success" : "failure",
          result,
          completedAt: new Date().toISOString(),
        };
        const idx = currentOutcomes.findIndex((o) => o.id === op.id);
        currentOutcomes[idx] = finishedOutcome;
      } catch {
        const idx = currentOutcomes.findIndex((o) => o.id === op.id);
        currentOutcomes[idx] = { id: op.id, status: "failure", completedAt: new Date().toISOString() };
      }
      setOutcomes([...currentOutcomes]);
    }
    setRunning(false);
  };

  const handleExport = () => {
    const selectedOps = DEFAULT_OPERATIONS.filter((o) => selectedIds.includes(o.id));
    exportCase(outcomes, selectedOps);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker text-[#59869c]">
              {isArabic ? "الأدلة والتوثيق" : "Digital Forensics & Audit"}
            </span>
            <span className="status-stamp text-[#527321]">
              {outcomes.length > 0 ? `${outcomes.length} captured` : "ready"}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "لقطة الأدلة وسجل الفحص الموثق" : "Evidence Snapshot & Forensics Ledger"}
          </h2>
          <p className="mt-1 text-xs text-[#526273] dark:text-[#9bb2ca]">
            {isArabic
              ? "استخراج وتشخيص بيانات الجهاز وجمعها في حزمة ZIP مشفرة بالوقت والتواريخ لمراجعة الامتثال."
              : "Execute deliberate audit commands and package verifiable snapshot reports into timestamped forensic archives."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {outcomes.length > 0 && (
            <Button
              onClick={handleExport}
              className="bg-[#c8f04a] text-[#14253a] hover:bg-[#b8e23b] font-semibold text-xs h-9 px-3.5"
            >
              <Download size={14} className="mr-1.5" />
              {isArabic ? "تصدير حزمة الأدلة ZIP" : "Export Evidence Bundle"}
            </Button>
          )}

          <Button
            onClick={runAllSelected}
            disabled={!isLive || running || selectedIds.length === 0}
            className="bg-[#14253a] text-white hover:bg-[#1f3752] dark:bg-[#c8f04a] dark:text-[#14253a] font-semibold text-xs h-9 px-4"
          >
            {running ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                {isArabic ? "جاري الجمع..." : "Collecting Snapshot..."}
              </>
            ) : (
              <>
                <Play size={14} className="mr-2" />
                {isArabic ? `تشغيل ${selectedIds.length} فحص` : `Run ${selectedIds.length} Operations`}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="service-card rounded-md p-4">
        <div className="flex items-center justify-between border-b border-[#e5dfd3] dark:border-[#223952] pb-3 mb-3">
          <span className="text-xs font-semibold text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "فحوصات التوثيق المتاحة" : "Audit Operations"} ({selectedIds.length}/{DEFAULT_OPERATIONS.length})
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[0.68rem] text-[#59869c] hover:underline"
            >
              {isArabic ? "تحديد الكل" : "Select all"}
            </button>
            <span className="text-[#d8d1c4]">·</span>
            <button
              onClick={deselectAll}
              className="text-[0.68rem] text-[#59869c] hover:underline"
            >
              {isArabic ? "إلغاء التحديد" : "Clear"}
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#e5dfd3] dark:divide-[#223952]">
          {DEFAULT_OPERATIONS.map((op) => {
            const isSelected = selectedIds.includes(op.id);
            const outcome = outcomes.find((o) => o.id === op.id);

            return (
              <div
                key={op.id}
                className="py-3 flex items-start gap-3 hover:bg-[#f8f5ee]/50 dark:hover:bg-[#182a3c]/50 transition-colors"
              >
                <button
                  onClick={() => toggleSelect(op.id)}
                  className="mt-0.5 text-[#59869c] hover:text-[#14253a]"
                  aria-label="Toggle operation"
                >
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-[#14253a] dark:text-[#f6f2ea]">
                      {op.label}
                    </p>
                    <span className="status-stamp text-[0.6rem] border-[#8e9ca8] text-[#526273]">
                      {op.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.72rem] text-[#526273] dark:text-[#9bb2ca]">
                    {op.description}
                  </p>
                  <p className="mono mt-1 text-[0.68rem] text-[#687584]">
                    $ {op.command}
                  </p>

                  {outcome && (
                    <div className="mt-2 rounded border border-[#dcd5c9] dark:border-[#263c52] bg-[#f3efe6]/40 dark:bg-[#122030] p-2">
                      <div className="flex items-center gap-2 mb-1">
                        {outcome.status === "success" ? (
                          <CheckCircle2 size={13} className="text-[#527321]" />
                        ) : outcome.status === "running" ? (
                          <Loader2 size={13} className="text-[#59869c] animate-spin" />
                        ) : (
                          <AlertCircle size={13} className="text-[#c95a4b]" />
                        )}
                        <span className="mono text-[0.65rem] font-semibold">
                          {outcome.status.toUpperCase()} {outcome.completedAt && `· ${new Date(outcome.completedAt).toLocaleTimeString()}`}
                        </span>
                      </div>
                      {outcome.result && (
                        <pre className="mono text-[0.65rem] max-h-24 overflow-y-auto whitespace-pre-wrap text-[#384858] dark:text-[#cad3dc]">
                          {outcome.result.stdout || outcome.result.stderr || "(no output)"}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
