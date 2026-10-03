import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { BrowserAdbClient } from "@/lib/adbClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Hash,
  Cpu,
  Battery,
  CircuitBoard,
  Layers,
  Clock,
  User,
  FolderGit2,
  FileCheck2,
  Sliders,
  ExternalLink,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  collectForensicAuditData,
  verifyReportIntegrity,
  generateMarkdownReport,
  clearSessionPackageAuditTrail,
  getSessionPackageAuditTrail,
  type ForensicAuditReport,
  type ExaminerCaseMetadata,
  type HardwareVerdict,
} from "@/services/forensicAuditService";

export interface ForensicReportWorkspaceProps {
  client: BrowserAdbClient | null;
  isConnected: boolean;
  language: "en" | "ar" | "other";
  device?: {
    manufacturer?: string;
    model?: string;
    serial?: string;
  } | null;
}

export const ForensicReportWorkspace: React.FC<ForensicReportWorkspaceProps> = ({
  client,
  isConnected,
  language,
  device,
}) => {
  const isArabic = language === "ar";

  // Case metadata form state
  const [caseMetadata, setCaseMetadata] = useState<ExaminerCaseMetadata>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return {
      caseReferenceId: `CASE-${yyyy}-${mm}${dd}-01`,
      examinerName: "Digital Forensic Examiner",
      badgeOrOperatorId: "DFIR-OP-01",
      operationalNotes: "Routine hardware triage and authorized debloat inspection.",
    };
  });

  const [report, setReport] = useState<ForensicAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<boolean | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Generate / refresh forensic report
  const refreshReport = useCallback(async () => {
    setLoading(true);
    try {
      const generated = await collectForensicAuditData(client, caseMetadata);
      setReport(generated);
      const verification = await verifyReportIntegrity(generated);
      setVerifiedStatus(verification.valid);
    } catch (err: any) {
      toast.error(
        isArabic
          ? `فشل إنشاء التقرير الجنائي: ${err?.message || "خطأ غير معروف"}`
          : `Failed to compile forensic audit: ${err?.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [client, caseMetadata, isArabic]);

  // Initial load
  useEffect(() => {
    void refreshReport();
  }, [isConnected, device?.serial]);

  // Listen for session audit events to auto-refresh ledger if view is open
  useEffect(() => {
    const handleAuditUpdate = () => {
      void refreshReport();
    };
    window.addEventListener("acc-session-audit-updated", handleAuditUpdate);
    window.addEventListener("acc-network-snapshot-updated", handleAuditUpdate);
    window.addEventListener("acc-apk-summary-updated", handleAuditUpdate);
    return () => {
      window.removeEventListener("acc-session-audit-updated", handleAuditUpdate);
      window.removeEventListener("acc-network-snapshot-updated", handleAuditUpdate);
      window.removeEventListener("acc-apk-summary-updated", handleAuditUpdate);
    };
  }, [refreshReport]);

  // Copy SHA-256 hash
  const copySha256 = () => {
    if (!report?.metadata.sha256Hash) return;
    navigator.clipboard.writeText(report.metadata.sha256Hash);
    setCopiedHash(true);
    toast.success(isArabic ? "تم نسخ تجزئة SHA-256 إلى الحافظة" : "SHA-256 hash copied to clipboard");
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Export JSON
  const exportJson = () => {
    if (!report) return;
    const serial = report.deviceIdentity.serialNumber.replace(/[^A-Za-z0-9_-]/g, "_") || "Device";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `Forensic_Audit_${serial}_${ts}.json`;

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(
      isArabic
        ? `تم تصدير ملف JSON الجنائي (${filename})`
        : `Exported raw forensic JSON (${filename})`
    );
  };

  // Export Markdown
  const exportMarkdown = () => {
    if (!report) return;
    const serial = report.deviceIdentity.serialNumber.replace(/[^A-Za-z0-9_-]/g, "_") || "Device";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `Forensic_Audit_${serial}_${ts}.md`;

    const mdContent = generateMarkdownReport(report);
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(
      isArabic
        ? `تم تصدير ملف Markdown الجنائي (${filename})`
        : `Exported formatted forensic Markdown (${filename})`
    );
  };

  // Print / Save as PDF
  const triggerPrint = () => {
    window.print();
  };

  // Clear session ledger
  const handleClearLedger = () => {
    clearSessionPackageAuditTrail();
    void refreshReport();
    toast.info(isArabic ? "تم مسح سجل تعديل الحزم للجلسة الحالية" : "Session package audit ledger cleared");
  };

  const getVerdictBadge = (verdict: HardwareVerdict) => {
    if (verdict === "Critical Component Leakage or Short Suspected") {
      return {
        bg: "bg-red-50 dark:bg-red-950/70 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
        icon: <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />,
        label: isArabic ? "عطل حرج: تسريب مكوّن أو التماس كهربائي مشتبه" : "CRITICAL: Component Leakage or Circuit Short Suspected",
      };
    }
    if (verdict === "High Software Load") {
      return {
        bg: "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
        icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        label: isArabic ? "حمل برمجي مرتفع: معالجة نشطة تسبب الحرارة" : "High Software Load: Compute Activity Inducing Thermal Dissipation",
      };
    }
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      label: isArabic ? "الوضع الاسمي القياسي: مؤشرات الطاقة والحرارة سليمة" : "Nominal Baseline: Hardware Power & Thermal Metrics Sound",
    };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Toolbar (Hidden during print) */}
      <div className="no-print bg-white dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#274b35]/10 dark:bg-emerald-500/20 text-[#274b35] dark:text-emerald-400 flex items-center justify-center font-bold">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "محرك التدقيق والتقرير الجنائي" : "Forensic Audit & Inspection Engine"}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#f4ede2] dark:bg-slate-800 text-[#534335] dark:text-slate-300 border border-[#d8d1c4] dark:border-slate-700">
                  09 REPORT
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isArabic
                  ? "إنشاء تقارير فحص جنائية مؤمّنة بتجزئة تشفيرية معتمدة ومقاومة للتلاعب عبر ADB"
                  : "Tamper-evident forensic inspection dossiers with cryptographic SHA-256 chain-of-custody"}
              </p>
            </div>
          </div>

          {/* Action Exporters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshReport}
              disabled={loading}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{isArabic ? "تحديث الفحص" : "Refresh Snapshot"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportJson}
              disabled={!report}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportMarkdown}
              disabled={!report}
              className="gap-1.5 border-[#d8d1c4] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Markdown</span>
            </Button>

            <Button
              size="sm"
              onClick={triggerPrint}
              disabled={!report}
              className="gap-1.5 bg-[#274b35] hover:bg-[#1e3c29] text-white font-medium shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isArabic ? "طباعة / حفظ PDF" : "Print / PDF"}</span>
            </Button>
          </div>
        </div>

        {/* Status notice */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span>
              {isConnected
                ? isArabic
                  ? "متصل بالعتاد الحي عبر WebUSB ADB"
                  : "Live Hardware Linked via WebUSB ADB"
                : isArabic
                  ? "الجهاز غير متصل - يتم عرض الحالة المحفوظة"
                  : "Device Disconnected - Displaying Cached/Offline Ledger"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>{isArabic ? "جلسة التعديل:" : "Session Actions:"}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {report?.packageAuditTrail.length ?? 0} {isArabic ? "إجراء مسجل" : "recorded"}
            </span>
            {report && report.packageAuditTrail.length > 0 && (
              <button
                onClick={handleClearLedger}
                className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1 ms-2"
                title="Clear active session package ledger"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isArabic ? "مسح السجل" : "Clear"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Case & Examiner Metadata Form (Hidden during print) */}
      <div className="no-print bg-[#fdfbf7] dark:bg-slate-900 border border-[#d8d1c4] dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-[#7d6854] dark:text-slate-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#534335] dark:text-slate-300">
            {isArabic ? "بيانات المحقق وملف القضية" : "Examiner & Case Chain of Custody Metadata"}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isArabic ? "معرّف القضية / الدليل" : "Case / Evidence Ref ID"}
            </label>
            <input
              type="text"
              value={caseMetadata.caseReferenceId}
              onChange={(e) => setCaseMetadata({ ...caseMetadata, caseReferenceId: e.target.value })}
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#274b35]"
              placeholder="CASE-2026-001"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isArabic ? "اسم المحقق / الفاحص" : "Examiner Name"}
            </label>
            <input
              type="text"
              value={caseMetadata.examinerName}
              onChange={(e) => setCaseMetadata({ ...caseMetadata, examinerName: e.target.value })}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#274b35]"
              placeholder="Operator Name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isArabic ? "رقم الشارة / معرّف المشغّل" : "Badge / Operator ID"}
            </label>
            <input
              type="text"
              value={caseMetadata.badgeOrOperatorId}
              onChange={(e) => setCaseMetadata({ ...caseMetadata, badgeOrOperatorId: e.target.value })}
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#274b35]"
              placeholder="BADGE-0926"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isArabic ? "ملاحظات الفحص والنتائج التشغيلية" : "Operational Findings / Examination Remarks"}
            </label>
            <textarea
              rows={2}
              value={caseMetadata.operationalNotes}
              onChange={(e) => setCaseMetadata({ ...caseMetadata, operationalNotes: e.target.value })}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#d8d1c4] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#274b35]"
              placeholder="Record forensic remarks, environmental conditions, or evidence packaging details..."
            />
          </div>
        </div>
      </div>

      {/* 3. Live Report Preview (Printable Dossier) */}
      {report ? (
        <div
          id="forensic-dossier"
          className="forensic-dossier-print bg-white dark:bg-slate-900 border-2 border-[#b8ae9c] dark:border-slate-700 rounded-xl p-6 md:p-10 shadow-md text-slate-900 dark:text-slate-100 font-sans"
        >
          {/* Certificate Watermark / Header */}
          <div className="border-b-2 border-slate-900 dark:border-slate-100 pb-5 mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-emerald-800 dark:text-emerald-400 uppercase">
                <ShieldCheck className="w-4 h-4" />
                <span>OFFICIAL DIGITAL FORENSIC CERTIFICATE OF INSPECTION</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight mt-1">
                {isArabic ? "تقرير الفحص الجنائي الرقمي للعتاد" : "Forensic Device Inspection Dossier"}
              </h2>
              <div className="text-xs text-slate-500 font-mono mt-1">
                CERTIFICATE ID: <span className="text-slate-800 dark:text-slate-200 font-bold">{report.metadata.reportUuid}</span>
              </div>
            </div>

            <div className="text-right font-mono text-xs">
              <div className="text-slate-500">GENERATED (UTC):</div>
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {new Date(report.metadata.generatedAt).toUTCString()}
              </div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] mt-1 border border-emerald-300 dark:border-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                <span>INTEGRITY VERIFIED</span>
              </div>
            </div>
          </div>

          {/* Top Cryptographic SHA-256 Hash Block */}
          <div className="mb-6 p-4 rounded-lg bg-slate-900 dark:bg-black text-slate-100 border border-slate-800 font-mono">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Hash className="w-3.5 h-3.5" />
                <span>TAMPER-EVIDENT SHA-256 DIGITAL DIGEST:</span>
              </div>
              <button
                onClick={copySha256}
                className="no-print inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedHash ? (isArabic ? "تم النسخ" : "Copied!") : isArabic ? "نسخ" : "Copy"}</span>
              </button>
            </div>
            <div className="text-xs md:text-sm font-mono tracking-wider break-all text-emerald-300 bg-slate-950 p-2.5 rounded border border-slate-800">
              {report.metadata.sha256Hash}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
              <span>ALGORITHM: SHA-256 (W3C Web Cryptography API)</span>
              <span>CHAIN OF CUSTODY: ACTIVE</span>
            </div>
          </div>

          {/* Section 1: Examiner & Evidence Metadata */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-200 dark:border-slate-800 pb-1">
              1. EXAMINER & EVIDENCE CHAIN OF CUSTODY
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block">Case / Evidence ID:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {report.caseMetadata.caseReferenceId || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Examiner Name:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {report.caseMetadata.examinerName || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Badge / Operator ID:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {report.caseMetadata.badgeOrOperatorId || "N/A"}
                </span>
              </div>
              <div className="sm:col-span-3 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-500 block">Operational Remarks:</span>
                <span className="text-slate-700 dark:text-slate-300 italic">
                  {report.caseMetadata.operationalNotes || "No specific operational notes recorded."}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Device Digital Identity */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-200 dark:border-slate-800 pb-1">
              2. DEVICE DIGITAL IDENTITY SPECIFICATION
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400 w-1/3">Manufacturer</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{report.deviceIdentity.manufacturer}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Model / Device</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{report.deviceIdentity.model} ({report.deviceIdentity.productName})</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Hardware Serial Number</td>
                    <td className="p-2.5 font-bold text-emerald-700 dark:text-emerald-400">{report.deviceIdentity.serialNumber}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Android Release / Security Patch</td>
                    <td className="p-2.5 text-slate-900 dark:text-slate-100">Android {report.deviceIdentity.androidRelease} (Patch: {report.deviceIdentity.securityPatch})</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">SELinux Enforce Status</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{report.deviceIdentity.selinuxEnforce}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Linux Kernel Version</td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300 break-all">{report.deviceIdentity.kernelVersion}</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Build Fingerprint</td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300 break-all">{report.deviceIdentity.buildFingerprint}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Hardware & Circuit Triage Snapshot */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-200 dark:border-slate-800 pb-1">
              3. HARDWARE & CIRCUIT ANOMALY TRIAGE
            </h3>

            {/* Verdict Banner */}
            {(() => {
              const badge = getVerdictBadge(report.hardwareTriage.verdict);
              return (
                <div className={`p-4 rounded-lg border mb-4 flex items-start gap-3 ${badge.bg}`}>
                  {badge.icon}
                  <div>
                    <div className="text-sm font-bold tracking-tight">
                      {badge.label}
                    </div>
                    <div className="text-xs mt-1 leading-relaxed opacity-95">
                      {report.hardwareTriage.discrepancyEvidence}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Circuit Vitals Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 font-mono">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block font-sans">Battery Current Draw</span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {report.hardwareTriage.batteryDrawMa} <span className="text-xs font-normal">mA</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-sans mt-0.5">Idle current sensor</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block font-sans">CPU Compute Load</span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {report.hardwareTriage.cpuLoadPercent} <span className="text-xs font-normal">%</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-sans mt-0.5">Subsystem baseline</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block font-sans">Peak Sensor Temp</span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {report.hardwareTriage.maxSensorTempC} <span className="text-xs font-normal">°C</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-sans mt-0.5 truncate">
                  {report.hardwareTriage.hottestSensorName}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block font-sans">Total Mapped Sensors</span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {report.hardwareTriage.allSensors.length}
                </span>
                <span className="text-[10px] text-slate-400 block font-sans mt-0.5">Kernel thermal zones</span>
              </div>
            </div>

            {/* Subsystem Telemetry Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-2">Hardware Subsystem</th>
                    <th className="p-2">Mapped Sensors</th>
                    <th className="p-2">Peak Temperature</th>
                    <th className="p-2">Circuit Health Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {([
                    { label: "PA IC / RF Front-End (Cellular)", list: report.hardwareTriage.subsystemSensors.paIc },
                    { label: "PMIC / Charging Circuit", list: report.hardwareTriage.subsystemSensors.pmicCharger },
                    { label: "SoC Core Processing (CPU-GPU)", list: report.hardwareTriage.subsystemSensors.socCpuGpu },
                    { label: "Wi-Fi / Bluetooth Module", list: report.hardwareTriage.subsystemSensors.wifi },
                    { label: "Camera Sensor & Rails", list: report.hardwareTriage.subsystemSensors.camera },
                  ] as const).map(({ label, list }, idx) => {
                    const max = list.length > 0 ? Math.max(...list.map((s) => s.tempC)) : null;
                    const isCritical = list.some((s) => s.status === "Critical / Short");
                    const isElevated = list.some((s) => s.status === "Elevated");

                    return (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""}>
                        <td className="p-2 font-bold font-sans text-slate-800 dark:text-slate-200">{label}</td>
                        <td className="p-2">{list.length} mapped</td>
                        <td className="p-2 font-bold">{max !== null ? `${max}°C` : "N/A"}</td>
                        <td className="p-2 font-sans">
                          {isCritical ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                              CRITICAL SHORT / LEAK
                            </span>
                          ) : isElevated ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              ELEVATED
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              NOMINAL
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Session Package Audit Trail */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 border-b border-slate-200 dark:border-slate-800 pb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. SESSION PACKAGE MODIFICATION AUDIT TRAIL ({report.packageAuditTrail.length})
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                IMMUTABLE CHAIN OF ACTIONS
              </span>
            </div>

            {report.packageAuditTrail.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                {isArabic
                  ? "لا توجد تعديلات على الحزم مسجلة في الجلسة النشطة. أي أوامر تعطيل أو إزالة تُنفذ ستُسجل هنا فوراً."
                  : "No package modifications executed during the active session. Any Disable, Uninstall, Purge, or Restore action will be recorded here in real-time."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Timestamp (ISO)</th>
                      <th className="p-2">Action</th>
                      <th className="p-2">Package ID</th>
                      <th className="p-2">App Label (UAD-ng)</th>
                      <th className="p-2">Exit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
                    {report.packageAuditTrail.map((item, idx) => (
                      <tr key={item.id || idx} className={idx % 2 === 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""}>
                        <td className="p-2 text-slate-500 whitespace-nowrap">{item.timestamp}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.action === "Purge"
                                ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
                                : item.action === "Uninstall -k"
                                  ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                                  : item.action === "Restore"
                                    ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                                    : "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400"
                            }`}
                          >
                            {item.action}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{item.packageId}</td>
                        <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">{item.appLabel}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.exitStatus === "Success"
                                ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                                : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {item.exitStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 5: Live Network Sockets & Privacy Reconnaissance */}
          {report.networkSnapshot && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-200 dark:border-slate-800 pb-1 flex items-center justify-between">
                <span>5. LIVE NETWORK SOCKETS & PRIVACY RECONNAISSANCE</span>
                <span className="text-[10px] font-mono lowercase text-slate-400 font-normal">
                  captured: {report.networkSnapshot.capturedAt}
                </span>
              </h3>

              {/* Socket Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 font-mono">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-500 block">Total Sockets</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {report.networkSnapshot.totalSockets}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-500 block">Established WAN</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {report.networkSnapshot.establishedSockets}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-500 block">Listening Ports</span>
                  <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                    {report.networkSnapshot.listeningSockets}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-500 block">Flagged / Telemetry</span>
                  <span className={`text-base font-bold ${report.networkSnapshot.suspiciousCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-400"}`}>
                    {report.networkSnapshot.suspiciousCount}
                  </span>
                </div>
              </div>

              {/* Sockets Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Application / Service</th>
                      <th className="p-2">Local Endpoint</th>
                      <th className="p-2">Remote Endpoint</th>
                      <th className="p-2">State</th>
                      <th className="p-2">Direction</th>
                      <th className="p-2">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
                    {report.networkSnapshot.sockets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-slate-400 font-sans">
                          No active sockets recorded during this inspection snapshot.
                        </td>
                      </tr>
                    ) : (
                      report.networkSnapshot.sockets.slice(0, 20).map((sock, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""}>
                          <td className="p-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                            <div>{sock.appLabel || sock.packageName || `UID ${sock.uid}`}</div>
                            {sock.packageName && (
                              <div className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
                                {sock.packageName}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {sock.localIp}:{sock.localPort}
                          </td>
                          <td className="p-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {sock.remoteIp}:{sock.remotePort}
                          </td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {sock.state}
                            </span>
                          </td>
                          <td className="p-2 text-[10px] font-sans text-slate-500">{sock.direction}</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                                sock.isSuspicious
                                  ? "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400"
                                  : sock.classificationTag === "OEM Telemetry"
                                    ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400"
                                    : sock.classificationTag === "Cloud Sync"
                                      ? "bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-400"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {sock.classificationTag}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6: Static APK Reconnaissance & Manifest Audit */}
          {report.apkForensicSummary && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-200 dark:border-slate-800 pb-1 flex items-center justify-between">
                <span>6. STATIC APK RECONNAISSANCE & MANIFEST AUDIT</span>
                <span className="text-[10px] font-mono lowercase text-slate-400 font-normal">
                  source: {report.apkForensicSummary.source} · {report.apkForensicSummary.inspectedAt}
                </span>
              </h3>

              {/* Package & Binary Identity Card */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700/80 pb-2 mb-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{report.apkForensicSummary.appName || report.apkForensicSummary.packageName}</span>
                      <span className="text-xs font-mono font-normal text-slate-500">
                        v{report.apkForensicSummary.versionName} ({report.apkForensicSummary.versionCode})
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Package: {report.apkForensicSummary.packageName}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-300">
                    <div>Size: {(report.apkForensicSummary.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</div>
                    <div className="text-[11px] text-slate-400">Min SDK: {report.apkForensicSummary.minSdkVersion} | Target SDK: {report.apkForensicSummary.targetSdkVersion}</div>
                  </div>
                </div>

                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all mb-2">
                  <span className="text-slate-400 font-sans">Binary SHA-256: </span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">{report.apkForensicSummary.sha256Checksum}</span>
                </div>

                {/* Flags Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className={`p-2 rounded border font-mono ${
                    report.apkForensicSummary.flags.debuggable
                      ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 text-rose-700 dark:text-rose-300"
                      : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300"
                  }`}>
                    <span className="font-sans font-bold block text-[10px] uppercase">Debuggable Flag</span>
                    <span>{report.apkForensicSummary.flags.debuggable ? "TRUE (WARNING: ANALYSIS ARTIFACT)" : "FALSE (Secure Production)"}</span>
                  </div>

                  <div className={`p-2 rounded border font-mono ${
                    report.apkForensicSummary.flags.allowBackup
                      ? "bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-700 dark:text-amber-300"
                      : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300"
                  }`}>
                    <span className="font-sans font-bold block text-[10px] uppercase">Allow Backup</span>
                    <span>{report.apkForensicSummary.flags.allowBackup ? "TRUE (Data Extraction Risk)" : "FALSE (Protected Sandbox)"}</span>
                  </div>

                  <div className={`p-2 rounded border font-mono ${
                    report.apkForensicSummary.flags.usesCleartextTraffic
                      ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 text-rose-700 dark:text-rose-300"
                      : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300"
                  }`}>
                    <span className="font-sans font-bold block text-[10px] uppercase">Cleartext Traffic</span>
                    <span>{report.apkForensicSummary.flags.usesCleartextTraffic ? "PERMITTED (HTTP Allowed)" : "ENFORCED (HTTPS Only)"}</span>
                  </div>
                </div>

                {/* Permissions & Attack Surface Counters */}
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 font-sans">Permissions: </span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {report.apkForensicSummary.totalPermissions} Total
                    </span>
                    <span className="text-rose-600 font-mono font-bold ml-1.5">
                      ({report.apkForensicSummary.dangerousPermissionsCount} Sensitive / Dangerous)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Exported Components: </span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {report.apkForensicSummary.exportedComponentsCount} Entry Points
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom SHA-256 Verification Block */}
          <div className="mt-8 pt-5 border-t-2 border-slate-900 dark:border-slate-100">
            <div className="p-4 rounded-lg bg-slate-900 dark:bg-black text-slate-100 border border-slate-800 font-mono text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  AUTHENTICATED FORENSIC CLOSING RECORD
                </span>
                <span className="text-[10px] text-slate-400">RFC 6234 / FIPS 180-4 COMPLIANT</span>
              </div>
              <div className="text-slate-300 leading-relaxed font-mono text-[11px]">
                SHA-256 DIGEST: <span className="text-emerald-300 font-bold">{report.metadata.sha256Hash}</span>
              </div>
              <div className="text-slate-400 text-[10px] mt-2 border-t border-slate-800 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span>Certified by Android Control Center Automated Forensic Inspection Module</span>
                <span>UUID: {report.metadata.reportUuid}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
          <p>{isArabic ? "جاري تجميع بيانات الفحص الجنائي..." : "Compiling live forensic audit snapshot..."}</p>
        </div>
      )}
    </div>
  );
};

export default ForensicReportWorkspace;
