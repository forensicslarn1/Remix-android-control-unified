/** Field Service Ledger style: inspect locally, make signing evidence and permission risk legible before install. */
import { Button } from "@/components/ui/button";
import { inspectApk, type ApkInspection } from "@/lib/apkInspector";
import { AppCategoryBadge } from "./AppCategoryBadge";
import { classifyPackage } from "@/lib/packageCategories";
import { AlertTriangle, BadgeCheck, FileArchive, Fingerprint, Loader2, LockKeyhole, ShieldAlert, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TrustedFingerprint = { id: string; label: string; fingerprint: string; addedAt: string };
const TRUSTED_FINGERPRINT_KEY = "acc-trusted-apk-fingerprints-v1";

function normalizedFingerprint(value: string) { return value.replace(/[^a-f0-9]/gi, "").toLowerCase(); }

function permissionExplanation(permission: string, ar: boolean) {
  const suffix = permission.split(".").pop() || permission;
  const copy: Record<string, [string, string]> = {
    CAMERA: ["Allows the app to use the camera.", "يسمح للتطبيق باستخدام الكاميرا."],
    RECORD_AUDIO: ["Allows the app to record audio with the microphone.", "يسمح للتطبيق بتسجيل الصوت عبر الميكروفون."],
    READ_CONTACTS: ["Allows the app to read saved contacts.", "يسمح للتطبيق بقراءة جهات الاتصال المحفوظة."],
    WRITE_CONTACTS: ["Allows the app to add, edit, or remove contacts.", "يسمح للتطبيق بإضافة جهات الاتصال أو تعديلها أو حذفها."],
    READ_CALL_LOG: ["Allows the app to read call history.", "يسمح للتطبيق بقراءة سجل المكالمات."],
    WRITE_CALL_LOG: ["Allows the app to change call history.", "يسمح للتطبيق بتغيير سجل المكالمات."],
    READ_SMS: ["Allows the app to read text messages.", "يسمح للتطبيق بقراءة الرسائل النصية."],
    RECEIVE_SMS: ["Allows the app to receive incoming text messages.", "يسمح للتطبيق باستقبال الرسائل النصية الواردة."],
    SEND_SMS: ["Allows the app to send text messages.", "يسمح للتطبيق بإرسال رسائل نصية."],
    ACCESS_FINE_LOCATION: ["Allows precise location access, usually via GPS.", "يسمح بالوصول إلى الموقع الدقيق، عادةً عبر GPS."],
    ACCESS_COARSE_LOCATION: ["Allows approximate location access.", "يسمح بالوصول إلى الموقع التقريبي."],
    ACCESS_BACKGROUND_LOCATION: ["Allows location access while the app is not open.", "يسمح بالوصول إلى الموقع حتى عند عدم فتح التطبيق."],
    READ_MEDIA_IMAGES: ["Allows access to photos stored on the device.", "يسمح بالوصول إلى الصور المحفوظة على الجهاز."],
    READ_MEDIA_VIDEO: ["Allows access to videos stored on the device.", "يسمح بالوصول إلى مقاطع الفيديو المحفوظة على الجهاز."],
    READ_EXTERNAL_STORAGE: ["Allows access to older shared storage files.", "يسمح بالوصول إلى ملفات التخزين المشترك القديمة."],
    WRITE_EXTERNAL_STORAGE: ["Allows changes to older shared storage files.", "يسمح بتغيير ملفات التخزين المشترك القديمة."],
    MANAGE_EXTERNAL_STORAGE: ["Allows broad access to files across shared storage.", "يسمح بالوصول الواسع إلى الملفات ضمن التخزين المشترك."],
    QUERY_ALL_PACKAGES: ["Allows the app to see most installed apps.", "يسمح للتطبيق برؤية معظم التطبيقات المثبتة."],
    REQUEST_INSTALL_PACKAGES: ["Allows the app to request installation of other APK files.", "يسمح للتطبيق بطلب تثبيت ملفات APK أخرى."],
    BIND_ACCESSIBILITY_SERVICE: ["Allows an accessibility service that can observe or act on screen content when enabled by you.", "يسمح بخدمة إمكانية وصول يمكنها مراقبة محتوى الشاشة أو التفاعل معه عند تفعيلها منك."],
    PACKAGE_USAGE_STATS: ["Allows access to app-usage statistics after separate system approval.", "يسمح بالوصول إلى إحصاءات استخدام التطبيقات بعد موافقة منفصلة من النظام."],
    SYSTEM_ALERT_WINDOW: ["Allows drawing over other apps after separate system approval.", "يسمح بالرسم فوق التطبيقات الأخرى بعد موافقة منفصلة من النظام."],
    POST_NOTIFICATIONS: ["Allows the app to send notifications.", "يسمح للتطبيق بإرسال الإشعارات."],
  };
  return copy[suffix]?.[ar ? 1 : 0] || (ar ? "طلب معلن في بيان التطبيق؛ راجع سبب الحاجة إليه." : "A permission declared in the app manifest; review why the app needs it.");
}

function statusStyle(status: string) {
  if (status === "verified") return "border-[#b9da71] bg-[#eef8cd] text-[#35501c]";
  if (status === "invalid") return "border-[#dba193] bg-[#fbe5df] text-[#934639]";
  if (status === "unsupported") return "border-[#e6c473] bg-[#fff0ce] text-[#8b5c1c]";
  return "border-[#d8d1c4] bg-[#f3efe6] text-[#526273]";
}

export function ApkInspectionWorkspace({ language, isLive, install }: { language: "en" | "ar" | "other"; isLive: boolean; install: (file?: File) => Promise<void> }) {
  const ar = language === "ar";
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ApkInspection | null>(null);
  const [error, setError] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [trusted, setTrusted] = useState<TrustedFingerprint[]>(() => {
    try { return JSON.parse(localStorage.getItem(TRUSTED_FINGERPRINT_KEY) || "[]") as TrustedFingerprint[]; } catch { return []; }
  });
  const [trustCandidate, setTrustCandidate] = useState("");
  const [trustLabel, setTrustLabel] = useState("");
  const choose = async (candidate?: File) => {
    setFile(candidate || null); setInspection(null); setError(""); setTrustCandidate("");
    if (!candidate) return;
    setInspecting(true);
    try { setInspection(await inspectApk(candidate)); } catch (reason) { setError(reason instanceof Error ? reason.message : "APK inspection failed."); } finally { setInspecting(false); }
  };
  const continueInstall = async () => { setInstalling(true); try { await install(file || undefined); } finally { setInstalling(false); } };
  const signerReferences = useMemo(() => {
    if (!inspection) return [] as Array<{ id: string; scheme: string; fingerprint: string; subject?: string }>;
    const seen = new Set<string>();
    const all: Array<{ scheme: string; fingerprint: string; subject?: string }> = [];
    if (inspection.certificate.fingerprintSha256) all.push({ scheme: "v1", fingerprint: inspection.certificate.fingerprintSha256, subject: inspection.certificate.subject });
    inspection.signingSchemes.forEach((scheme) => scheme.signers.forEach((signer) => {
      if (signer.fingerprintSha256) all.push({ scheme: scheme.scheme, fingerprint: signer.fingerprintSha256, subject: signer.subject });
    }));
    return all.filter((item) => { const key = normalizedFingerprint(item.fingerprint); if (seen.has(key)) return false; seen.add(key); return true; }).map((item) => ({ ...item, id: `${item.scheme}-${normalizedFingerprint(item.fingerprint)}` }));
  }, [inspection]);
  useEffect(() => { if (!trustCandidate && signerReferences[0]) setTrustCandidate(signerReferences[0].fingerprint); }, [signerReferences, trustCandidate]);
  const trustedMatch = (fingerprint?: string) => trusted.find((item) => normalizedFingerprint(item.fingerprint) === normalizedFingerprint(fingerprint || ""));
  const persistTrusted = (next: TrustedFingerprint[]) => { setTrusted(next); localStorage.setItem(TRUSTED_FINGERPRINT_KEY, JSON.stringify(next)); };
  const addTrusted = () => {
    const candidate = signerReferences.find((signer) => normalizedFingerprint(signer.fingerprint) === normalizedFingerprint(trustCandidate));
    const label = trustLabel.trim().replace(/\s+/g, " ").slice(0, 64);
    if (!candidate || !label || trustedMatch(candidate.fingerprint)) return;
    persistTrusted([{ id: `${Date.now()}-${candidate.id}`, label, fingerprint: candidate.fingerprint, addedAt: new Date().toISOString() }, ...trusted].slice(0, 80));
    setTrustLabel("");
  };
  const removeTrusted = (id: string) => persistTrusted(trusted.filter((item) => item.id !== id));
  const cert = inspection?.certificate;
  return <section className="space-y-5">
    <div className="service-card p-6"><p className="kicker text-[#687584]">{ar ? "فحص محلي قبل التثبيت" : "Local pre-install inspection"}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">{ar ? "افحص ملف APK قبل أن يصل إلى الجهاز." : "Inspect an APK before it reaches the device."}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#526273]">{ar ? "تُقرأ بيانات الحزمة والأذونات وشهادات التوقيع وفحوصات APK v2/v3 داخل هذا المتصفح. لا يُرفع ملف APK. لا يصبح التثبيت متاحاً حتى يكتمل الفحص." : "Package metadata, permissions, signing certificates, and APK v2/v3 verification run inside this browser. The APK is not uploaded. Installation stays unavailable until inspection completes."}</p><label className="action-button mt-6 inline-flex items-center border border-[#14253a] bg-[#14253a] px-4 py-3 text-sm font-semibold text-[#f6f2ea]"><Upload className="mr-2" size={16} />{ar ? "اختيار وفحص APK" : "Choose & inspect APK"}<input type="file" accept=".apk,application/vnd.android.package-archive" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} /></label>{file && <p className="mono mt-4 text-[0.68rem] text-[#687584]">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}</div>
    {inspecting && <div className="service-card flex items-center gap-3 p-5"><Loader2 className="animate-spin text-[#59869c]" size={20} /><p className="text-sm">{ar ? "يتم فحص الحزمة والأذونات والتوقيع محلياً…" : "Inspecting package, permissions, and signatures locally…"}</p></div>}
    {error && <div className="border-l-2 border-[#d39152] bg-[#fff2e1] p-5 text-sm leading-6 text-[#6d5133]"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><p>{error}</p></div></div>}
    {inspection && <>
      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="service-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="kicker text-[#687584]">{ar ? "هوية الحزمة" : "Package identity"}</p>
              <h3 className="mt-1 text-xl font-bold">{inspection.packageName || (ar ? "غير متاح" : "Unavailable")}</h3>
              {inspection.packageName && (
                <div className="mt-2">
                  <AppCategoryBadge category={classifyPackage(inspection.packageName)} language={ar ? "ar" : "en"} />
                </div>
              )}
            </div>
            <FileArchive className="text-[#59869c]" size={21} />
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="kicker text-[#687584]">{ar ? "الإصدار" : "Version"}</dt><dd className="mt-1 mono text-xs">{inspection.versionName || "—"}</dd></div><div><dt className="kicker text-[#687584]">{ar ? "رمز الإصدار" : "Version code"}</dt><dd className="mt-1 mono text-xs">{inspection.versionCode ?? "—"}</dd></div><div><dt className="kicker text-[#687584]">{ar ? "الأذونات المعلنة" : "Declared permissions"}</dt><dd className="mt-1 text-lg font-bold">{inspection.permissions.length}</dd></div><div><dt className="kicker text-[#934639]">{ar ? "أذونات حساسة" : "Sensitive permissions"}</dt><dd className={`mt-1 text-lg font-bold ${inspection.sensitivePermissions.length ? "text-[#934639]" : "text-[#527321]"}`}>{inspection.sensitivePermissions.length}</dd></div></dl></div><div className="service-card p-6"><div className="flex items-center justify-between"><div><p className="kicker text-[#687584]">{ar ? "شهادة JAR v1" : "v1 JAR certificate"}</p><h3 className="mt-1 text-xl font-bold">{cert?.status === "available" ? (ar ? "تم تحليل الشهادة" : "Certificate parsed") : (ar ? "غير متاحة أو محدودة" : "Unavailable or limited")}</h3></div><LockKeyhole className="text-[#59869c]" size={21} /></div><p className="mt-4 text-xs leading-5 text-[#526273]">{cert?.note}</p>{cert?.subject && <dl className="mono mt-4 space-y-2 break-all text-[0.68rem]"><div><dt className="text-[#687584]">{ar ? "الموضوع" : "Subject"}</dt><dd>{cert.subject}</dd></div><div><dt className="text-[#687584]">{ar ? "الجهة المُصدرة" : "Issuer"}</dt><dd>{cert.issuer}</dd></div><div><dt className="text-[#687584]">SHA-256</dt><dd>{cert.fingerprintSha256}</dd></div></dl>}</div></div>
      <div className="service-card p-6"><div className="flex items-center gap-2"><ShieldCheck className="text-[#59869c]" size={18} /><div><p className="kicker text-[#687584]">{ar ? "تحقق توقيع APK الحديث" : "Modern APK signature verification"}</p><h3 className="mt-1 font-bold">{ar ? "نتائج v2 وv3 تُفحص محلياً." : "v2 and v3 evidence is checked locally."}</h3></div></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{inspection.signingSchemes.map((scheme) => <article key={scheme.scheme} className={`border p-4 ${statusStyle(scheme.status)}`}><div className="flex items-center justify-between gap-3"><div><p className="kicker">APK Signature Scheme {scheme.scheme.toUpperCase()}</p><p className="mt-1 text-sm font-bold">{scheme.status === "verified" ? (ar ? "تم التحقق محلياً" : "Locally verified") : scheme.status === "invalid" ? (ar ? "فشل التحقق" : "Verification failed") : scheme.status === "unsupported" ? (ar ? "خوارزمية غير مدعومة" : "Unsupported algorithm") : scheme.status === "not-found" ? (ar ? "غير موجود" : "Not present") : (ar ? "تم اكتشافه" : "Detected")}</p></div><span className="mono text-xs">{scheme.verifiedSignerCount}/{scheme.signerCount}</span></div><p className="mt-3 text-xs leading-5">{scheme.note}</p>{scheme.signers.map((signer) => <div key={signer.index} className="mono mt-3 border-t border-current/20 pt-3 text-[0.67rem] leading-5"><p>{signer.signatureAlgorithm || (ar ? "خوارزمية غير مدعومة" : "Unsupported algorithm")}</p>{signer.fingerprintSha256 && <p className="mt-1 break-all">SHA-256: {signer.fingerprintSha256}</p>}<p className="mt-1">{signer.note}</p>{scheme.scheme === "v3" && signer.proofOfRotation && <p className="mt-1 font-semibold">{ar ? "تم اكتشاف إثبات تدوير المفتاح." : "Proof-of-rotation detected."}</p>}</div>)}</article>)}</div></div>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="service-card p-6"><div className="flex items-center gap-2"><ShieldAlert className="text-[#934639]" size={18} /><div><p className="kicker text-[#934639]">{ar ? "الأذونات" : "Permissions"}</p><h3 className="mt-1 font-bold">{ar ? "راجع كل طلب قبل التثبيت." : "Review every request before installing."}</h3></div></div><div className="mt-5 space-y-2">{inspection.permissions.length ? inspection.permissions.map((permission) => { const sensitive = inspection.sensitivePermissions.includes(permission); return <article key={permission} className={`border-l-2 p-3 ${sensitive ? "border-[#c95a4b] bg-[#fbe5df] text-[#7d3028]" : "border-[#59869c] bg-[#f3efe6] text-[#526273]"}`}><div className="flex flex-wrap items-center gap-2"><span className="mono break-all text-[0.68rem] font-semibold">{permission}</span>{sensitive && <span className="status-stamp border-[#c95a4b] text-[#934639]">{ar ? "حساس" : "Sensitive"}</span>}</div><p className="mt-2 text-xs leading-5">{permissionExplanation(permission, ar)}</p></article>; }) : <p className="text-sm text-[#687584]">{ar ? "لم تُستخرج أذونات من البيان." : "No permissions were extracted from the manifest."}</p>}</div></div>
        <div className="service-card p-6"><div className="flex items-center gap-2"><Fingerprint className="text-[#59869c]" size={18} /><div><p className="kicker text-[#687584]">{ar ? "سجل الناشر الموثوق محلياً" : "Local trusted publisher registry"}</p><h3 className="mt-1 font-bold">{ar ? "قارن بصمة التوقيع قبل التثبيت." : "Compare a signing fingerprint before install."}</h3></div></div><p className="mt-3 text-xs leading-5 text-[#526273]">{ar ? "هذه قائمة محلية في هذا المتصفح فقط. إضافة بصمة تعني أنك تثق بها بنفسك؛ لا تثبت أمان التطبيق أو مصدره وحدها." : "This is a browser-local list only. Adding a fingerprint records your own trust decision; it does not by itself prove an app is safe or authentic."}</p>{signerReferences.length ? <><div className="mt-4 space-y-2">{signerReferences.map((signer) => { const match = trustedMatch(signer.fingerprint); return <div key={signer.id} className={`border p-3 text-xs ${match ? "border-[#b9da71] bg-[#eef8cd] text-[#35501c]" : "border-[#d8d1c4] bg-[#fffdf8] text-[#526273]"}`}><p className="font-semibold">{signer.scheme.toUpperCase()} · {match ? (ar ? `موثوق: ${match.label}` : `Trusted: ${match.label}`) : (ar ? "غير موجود في القائمة المحلية" : "Not in local registry")}</p><p className="mono mt-1 break-all text-[0.64rem]">{signer.fingerprint}</p>{signer.subject && <p className="mt-1 break-all">{signer.subject}</p>}</div>; })}</div><div className="mt-4 grid gap-2"><select value={trustCandidate} onChange={(event) => setTrustCandidate(event.target.value)} className="h-10 border border-[#d8d1c4] bg-[#fffdf8] px-3 text-xs"><option value="">{ar ? "اختر بصمة" : "Choose a fingerprint"}</option>{signerReferences.map((signer) => <option key={signer.id} value={signer.fingerprint}>{signer.scheme.toUpperCase()} · {signer.fingerprint.slice(0, 23)}…</option>)}</select><div className="flex gap-2"><input value={trustLabel} onChange={(event) => setTrustLabel(event.target.value)} placeholder={ar ? "اسم الناشر الموثوق" : "Trusted publisher name"} className="h-10 min-w-0 flex-1 border border-[#d8d1c4] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#59869c]" /><Button onClick={addTrusted} disabled={!trustCandidate || !trustLabel.trim() || Boolean(trustedMatch(trustCandidate))} variant="outline" className="action-button border-[#59869c] text-[#35501c]"><Fingerprint className="mr-2" size={15} />{ar ? "حفظ" : "Trust"}</Button></div></div></> : <p className="mt-4 text-sm text-[#687584]">{ar ? "لا توجد بصمة شهادة قابلة للمقارنة في هذا الملف." : "No certificate fingerprint could be compared for this file."}</p>}{trusted.length > 0 && <div className="mt-5 border-t border-[#d8d1c4] pt-4"><p className="kicker text-[#687584]">{ar ? "محفوظ محلياً" : "Stored locally"}</p><div className="mt-2 space-y-2">{trusted.map((item) => <div key={item.id} className="flex gap-2 border border-[#d8d1c4] bg-[#fffdf8] p-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.label}</p><p className="mono mt-1 break-all text-[0.6rem] text-[#687584]">{item.fingerprint}</p></div><button onClick={() => removeTrusted(item.id)} className="action-button self-start p-1 text-[#934639]" aria-label={ar ? "حذف البصمة الموثوقة" : "Remove trusted fingerprint"}><Trash2 size={15} /></button></div>)}</div></div>}</div></div>
      {inspection.warnings.length > 0 && <div className="service-card p-5"><p className="kicker text-[#934639]">{ar ? "ملاحظات الفحص" : "Inspection notes"}</p><ul className="mt-3 space-y-2 text-sm leading-6 text-[#6d3d35]">{inspection.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[#14253a] bg-[#14253a] p-5 text-[#f6f2ea]"><div><p className="kicker text-[#c8f04a]">{ar ? "قرار المشغّل" : "Operator decision"}</p><p className="mt-1 text-sm text-[#c7d3dc]">{ar ? "اكتمل الفحص محلياً. تأكد من الأذونات ومخططات التوقيع والبصمة قبل المتابعة." : "Local inspection is complete. Confirm the permissions, signing evidence, and fingerprint before continuing."}</p></div><Button onClick={continueInstall} disabled={!isLive || installing} className="action-button bg-[#c8f04a] text-[#14253a] hover:bg-[#d7f66c]">{installing ? <Loader2 className="mr-2 animate-spin" size={16} /> : <BadgeCheck className="mr-2" size={16} />}{ar ? "تثبيت بعد المراجعة" : "Install after review"}</Button></div>
    </>}
  </section>;
}
