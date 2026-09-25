import React, { useState, useEffect } from 'react';
import { Key, Upload, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

interface AdbKeyImporterProps {
  onKeyLoaded?: () => void;
}

export const AdbKeyImporter: React.FC<AdbKeyImporterProps> = ({ onKeyLoaded }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const existing = localStorage.getItem('custom_adb_private_key');
      if (existing) {
        setFileName(localStorage.getItem('custom_adb_key_name') || 'Stored adbkey');
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content.includes('PRIVATE KEY')) {
          throw new Error('Invalid key format. Must be an ADB private key containing PRIVATE KEY.');
        }

        localStorage.setItem('custom_adb_private_key', content.trim());
        localStorage.setItem('custom_adb_key_name', file.name);
        setFileName(file.name);
        setError(null);
        onKeyLoaded?.();
      } catch (err: any) {
        setError(err.message || 'Error parsing key file.');
        setFileName(null);
      }
    };
    reader.readAsText(file);
  };

  const handleClearKey = () => {
    try {
      localStorage.removeItem('custom_adb_private_key');
      localStorage.removeItem('custom_adb_key_name');
    } catch {
      // Ignore
    }
    setFileName(null);
    setError(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-2">
      <div className="flex items-center gap-2 text-cyan-400 font-semibold">
        <Key className="w-4 h-4"/>
        <span>Pre-Authorized Key Import (Broken Screen Recovery)</span>
      </div>
      <p className="text-[11px] text-slate-400">
        Upload an existing <code>adbkey</code> from an authorized machine (e.g. <code>~/.android/adbkey</code>) to bypass screen confirmation prompts.
      </p>
      <div className="flex items-center flex-wrap gap-3">
        <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5 transition">
          <Upload className="w-3.5 h-3.5"/>
          <span>Upload adbkey</span>
          <input type="file" onChange={handleFileUpload} className="hidden" accept="*/*" />
        </label>
        {fileName && (
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5"/>
              Loaded: {fileName}
            </span>
            <button
              onClick={handleClearKey}
              title="Remove stored key"
              className="text-slate-400 hover:text-rose-400 transition p-1"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        {error && (
          <span className="text-rose-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5"/>
            {error}
          </span>
        )}
      </div>
    </div>
  );
};

export default AdbKeyImporter;
