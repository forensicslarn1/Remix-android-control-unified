import React, { useState } from "react";
import { History, Download, ShieldCheck, Lock, Unlock, Trash2, FolderPlus, Tag, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommandResult } from "@/lib/adbClient";

export type HistoryReceipt = CommandResult & {
  label: string;
  authority: "USB" | "Root" | "Browser";
  restore?: string;
  tags?: string[];
};

export interface ArchiveSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  receiptCount: number;
}

interface ReceiptHistoryWorkspaceProps {
  language: "en" | "ar" | "other";
  history: HistoryReceipt[];
  archives: ArchiveSummary[];
  activeArchiveId: string;
  selectArchive: (id: string) => void;
  createArchive: (name: string) => void;
  renameArchive: (id: string, name: string) => void;
  deleteArchive: (id: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  updateTags: (key: string, tags: string[]) => void;
  exportHistory: (format: "json" | "md") => void;
  protectHistory: (password: string) => Promise<void>;
  importHistory: (file: File, password: string) => Promise<void>;
}

export function ReceiptHistoryWorkspace({
  language,
  history,
  archives,
  activeArchiveId,
  selectArchive,
  createArchive,
  renameArchive,
  deleteArchive,
  remove,
  clear,
  updateTags,
  exportHistory,
  protectHistory,
  importHistory,
}: ReceiptHistoryWorkspaceProps) {
  const isArabic = language === "ar";
  const [newArchiveName, setNewArchiveName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState("");
  const [showEncrypt, setShowEncrypt] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showImport, setShowImport] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArchiveName.trim()) return;
    createArchive(newArchiveName.trim());
    setNewArchiveName("");
    setShowCreate(false);
  };

  const handleProtect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (encryptPassword.length < 10) return;
    await protectHistory(encryptPassword);
    setEncryptPassword("");
    setShowEncrypt(false);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || decryptPassword.length < 10) return;
    await importHistory(importFile, decryptPassword);
    setDecryptPassword("");
    setImportFile(null);
    setShowImport(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker text-[#59869c]">
              {isArabic ? "سجل العمليات التاريخي" : "Persistent Command Ledger"}
            </span>
            <span className="status-stamp text-[#59869c]">
              {history.length} {isArabic ? "سجل" : "receipts"}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14253a] dark:text-[#f6f2ea]">
            {isArabic ? "أرشيف الإيصالات والأوامر" : "Receipt Archives & History"}
          </h2>
          <p className="mt-1 text-xs text-[#526273] dark:text-[#9bb2ca]">
            {isArabic
              ? "سجل محلي غير متطاير لجميع الأوامر المنفذة ضد الأجهزة، مع إمكانية التشفير بكلمة مرور وتصدير Markdown/JSON."
              : "Locally archived immutable log of commands executed against connected devices with PBKDF2 AES-256 encryption support."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportHistory("md")}
            className="text-xs h-8"
          >
            <Download size={13} className="mr-1" />
            Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportHistory("json")}
            className="text-xs h-8"
          >
            <Download size={13} className="mr-1" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEncrypt(!showEncrypt)}
            className="text-xs h-8"
          >
            <Lock size={13} className="mr-1" />
            {isArabic ? "تشفير" : "Encrypt"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImport(!showImport)}
            className="text-xs h-8"
          >
            <Unlock size={13} className="mr-1" />
            {isArabic ? "استيراد" : "Import"}
          </Button>
        </div>
      </div>

      {showEncrypt && (
        <form onSubmit={handleProtect} className="service-card p-4 rounded-md flex flex-wrap gap-2 items-center bg-[#f8f5ee] dark:bg-slate-900/90 dark:border-slate-800">
          <input
            type="password"
            placeholder={isArabic ? "كلمة المرور (10 أحرف على الأقل)" : "Password (min 10 characters)"}
            value={encryptPassword}
            onChange={(e) => setEncryptPassword(e.target.value)}
            className="h-8 px-3 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none flex-1 min-w-[200px]"
          />
          <Button type="submit" size="sm" className="bg-[#c8f04a] text-[#14253a] h-8 text-xs font-semibold">
            {isArabic ? "تصدير مشفر AES-256" : "Export Encrypted AES-256"}
          </Button>
        </form>
      )}

      {showImport && (
        <form onSubmit={handleImport} className="service-card p-4 rounded-md flex flex-wrap gap-2 items-center bg-[#f8f5ee] dark:bg-slate-900/90 dark:border-slate-800">
          <input
            type="file"
            accept=".json"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="text-xs flex-1 dark:text-slate-300"
          />
          <input
            type="password"
            placeholder={isArabic ? "كلمة المرور" : "Archive password"}
            value={decryptPassword}
            onChange={(e) => setDecryptPassword(e.target.value)}
            className="h-8 px-3 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          />
          <Button type="submit" size="sm" className="bg-[#14253a] text-white h-8 text-xs dark:bg-slate-800 dark:border dark:border-slate-700 dark:hover:bg-slate-700">
            {isArabic ? "فك التشفير واستيراد" : "Decrypt & Import"}
          </Button>
        </form>
      )}

      <div className="service-card rounded-md p-4">
        <div className="flex items-center justify-between border-b border-[#e5dfd3] dark:border-[#223952] pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold">{isArabic ? "سجلات الإيصالات" : "Command Receipts"}</span>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear} className="h-6 text-[0.68rem] text-[#934639]">
                {isArabic ? "مسح السجل" : "Clear list"}
              </Button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#687584]">
            {isArabic ? "لا توجد إيصالات أوامر محفوظة في هذا الأرشيف." : "No command receipts in this archive yet."}
          </div>
        ) : (
          <div className="divide-y divide-[#e5dfd3] dark:divide-[#223952] max-h-[500px] overflow-y-auto">
            {history.map((receipt, idx) => (
              <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#14253a] dark:text-[#f6f2ea]">
                      {receipt.label}
                    </span>
                    <span className={`status-stamp text-[0.6rem] ${receipt.exitCode === 0 ? "border-[#527321] text-[#527321]" : "border-[#c95a4b] text-[#c95a4b]"}`}>
                      exit {receipt.exitCode}
                    </span>
                    <span className="status-stamp text-[0.6rem] border-[#8e9ca8] text-[#687584]">
                      {receipt.authority}
                    </span>
                  </div>
                  <p className="mono mt-1 text-[0.68rem] text-[#687584] break-all">
                    $ {receipt.command}
                  </p>
                  {receipt.restore && (
                    <p className="mono mt-0.5 text-[0.65rem] text-[#59869c] break-all">
                      restore: {receipt.restore}
                    </p>
                  )}
                  {receipt.stdout && (
                    <p className="mono mt-1 text-[0.65rem] text-[#384858] dark:text-[#cad3dc] line-clamp-2">
                      {receipt.stdout}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono text-[0.65rem] text-[#8e9ca8]">
                    {new Date(receipt.at).toLocaleTimeString()}
                  </span>
                  <button
                    onClick={() => remove(`${receipt.at}-${receipt.command}-${receipt.label}`)}
                    className="text-[#8e9ca8] hover:text-[#c95a4b] p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
