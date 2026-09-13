/**
 * Case bundle packaging: generates timestamped forensic archives containing
 * verification metadata, evidence markdown reports, and JSON artifacts via fflate.
 */
import { zipSync, strToU8 } from "fflate";

export function createCaseId(prefix: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${dateStr}-${rand}`;
}

export interface CaseFile {
  name: string;
  content: string;
}

export function exportTimestampedCaseBundle(
  caseId: string,
  metadata: Record<string, unknown>,
  files: CaseFile[]
): void {
  const archiveFiles: Record<string, Uint8Array> = {};

  // Add metadata file
  const metaObject = {
    caseId,
    exportedAt: new Date().toISOString(),
    generator: "Android Control Center v1.0",
    ...metadata,
  };
  archiveFiles["case-metadata.json"] = strToU8(JSON.stringify(metaObject, null, 2));

  // Add provided case files
  for (const file of files) {
    archiveFiles[file.name] = strToU8(file.content);
  }

  // Compress to ZIP
  const zipped = zipSync(archiveFiles);
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${caseId}.zip`;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
