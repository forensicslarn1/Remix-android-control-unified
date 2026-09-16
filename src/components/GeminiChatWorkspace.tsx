import { useState, useEffect, useRef } from "react";
// WARNING: Client-side Gemini fallback requested explicitly for zero-downtime offline environments.
import { GoogleGenAI } from "@google/genai";
import {
  Bot,
  Send,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Sliders,
  Terminal,
  ShieldCheck,
  Zap,
  Info,
  ChevronDown,
  Download,
  Square,
  AlertCircle,
  MessageSquareCode,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Markdown from "react-markdown";
import { askAgenta, isAgentaConfigured, getAgentaConfig } from "@/lib/agentaClient";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: number;
  modelUsed?: string;
}

export type GeminiModelId =
  | "gemini-2.5-flash"
  | "gemini-3.8-flash"
  | "gemini-3.5-flash"
  | "gemini-3.1-flash-lite"
  | "gemini-3.1-pro-preview";

export interface ChatRolePreset {
  id: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  icon: typeof Bot;
  systemInstruction: string;
  recommendedModel: GeminiModelId;
}

export const CHAT_ROLES: ChatRolePreset[] = [
  {
    id: "android_specialist",
    name: {
      en: "Android & ADB Specialist",
      ar: "خبير Android و ADB",
    },
    description: {
      en: "Shell commands, debloating safety, logcat diagnosis & device policies",
      ar: "أوامر الطرفية، إزالة التطبيقات بأمان، تشخيص السجلات وسياسات النظام",
    },
    icon: Terminal,
    recommendedModel: "gemini-2.5-flash",
    systemInstruction:
      "You are an expert Android system engineer and ADB diagnostic specialist inside the Android Control Center workbench. You provide precise, safe, step-by-step guidance on ADB commands, package debloating (e.g. pm uninstall -k --user 0, pm disable-user), logcat filtering, Fastboot, permissions, and device forensics. Always warn users if an action could soft-brick a device or cause boot loops, and provide restore commands when applicable.",
  },
  {
    id: "security_auditor",
    name: {
      en: "Security & Forensics Auditor",
      ar: "مدقق الأمان والأدلة الجنائية",
    },
    description: {
      en: "APK certificates, v1-v3 signing schemes, sensitive permissions & audit trails",
      ar: "شهادات APK، مخططات التوقيع، الأذونات الحساسة وتتبع الأدلة",
    },
    icon: ShieldCheck,
    recommendedModel: "gemini-2.5-flash",
    systemInstruction:
      "You are an Android security auditor and forensic investigator. You analyze APK security architectures, signature schemes (v1, v2, v3), sensitive permissions (SMS, Camera, Accessibility, Overlay), malware persistence mechanisms, and verifiable audit evidence trails. Provide analytical, highly structured technical reviews.",
  },
  {
    id: "fast_copilot",
    name: {
      en: "Fast Command Copilot",
      ar: "مساعد الأوامر السريع",
    },
    description: {
      en: "Ultra-fast direct answers and copy-pasteable ADB snippets",
      ar: "إجابات فورية وأوامر ADB جاهزة للنسخ بأقل تفاصيل زائدة",
    },
    icon: Zap,
    recommendedModel: "gemini-2.5-flash",
    systemInstruction:
      "You are an ultra-fast, concise terminal copilot. Provide direct, succinct answers and copy-pasteable ADB shell commands with minimal preamble. Prioritize speed and clarity.",
  },
  {
    id: "complex_reasoner",
    name: {
      en: "Deep Forensics & Architecture",
      ar: "التحليل العميق وهندسة النظام",
    },
    description: {
      en: "Complex troubleshooting, stack trace deconstruction and root cause analysis",
      ar: "حل المشكلات المعقدة وتفكيك تتبعات الأخطاء والتحليل المعمق",
    },
    icon: Sparkles,
    recommendedModel: "gemini-3.1-pro-preview",
    systemInstruction:
      "You are a senior Android core architecture specialist. Provide exhaustive, logically rigorous analyses of complex system errors, kernel panics, native crash dumps, SELinux policies, and Android framework internals.",
  },
];

const AVAILABLE_MODELS: Array<{
  id: GeminiModelId;
  name: string;
  badge: { en: string; ar: string };
  desc: { en: string; ar: string };
}> = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    badge: { en: "Default / Stable", ar: "الافتراضي / مستقر" },
    desc: {
      en: "Highly stable and resilient production model (prevents 503 unavailable errors)",
      ar: "نموذج إنتاج مستقر وموثوق وسريع (يتجنب أخطاء 503)",
    },
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    badge: { en: "Advanced", ar: "متقدم" },
    desc: {
      en: "High intelligence and fast response for general tasks",
      ar: "ذكاء متقدم وسرعة عالية للمهام العامة",
    },
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    badge: { en: "General", ar: "عام" },
    desc: {
      en: "Solid, reliable model for everyday assistant needs",
      ar: "نموذج موثوق للمحادثات اليومية والإرشادات",
    },
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    badge: { en: "Fast", ar: "فائق السرعة" },
    desc: {
      en: "Ultra-low latency for instant syntax lookup and quick answers",
      ar: "زمن استجابة فائق للأوامر والاستفسارات الفورية",
    },
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    badge: { en: "Deep Reasoning", ar: "استدلال معقد" },
    desc: {
      en: "Complex problem solving and deep code analysis",
      ar: "أداء فائق للمهام الحسابية والبرمجية المعقدة",
    },
  },
];

const SUGGESTED_PROMPTS = {
  en: [
    "How do I safely debloat Samsung One UI bloatware without bootloop?",
    "Explain the difference between `pm uninstall -k --user 0` and `pm disable-user`",
    "What are the most dangerous Android permissions to look for in unknown APKs?",
    "How can I filter Logcat to capture only FATAL exceptions and crashes?",
  ],
  ar: [
    "كيف أقوم بإزالة تطبيقات سامسونج غير الضرورية بأمان دون التسبب في عطل؟",
    "ما الفرق بين أمر pm uninstall وأمر pm disable-user عبر ADB؟",
    "ما هي أخطر أذونات أندرويد التي يجب فحصها في ملفات APK غير الموثوقة؟",
    "كيف أقوم بتصفية سجل Logcat لعرض الاستثناءات القاتلة والأعطال فقط؟",
  ],
};

interface GeminiChatWorkspaceProps {
  language?: "en" | "ar" | "other";
  connectedDeviceSerial?: string;
  connectedDeviceModel?: string;
}

const STORAGE_KEY = "gemini_chat_messages_v1";
const ROLE_STORAGE_KEY = "gemini_chat_role_v1";
const MODEL_STORAGE_KEY = "gemini_chat_model_v1";
const CUSTOM_INSTRUCTION_KEY = "gemini_chat_custom_system_v1";

export function GeminiChatWorkspace({
  language = "en",
  connectedDeviceSerial,
  connectedDeviceModel,
}: GeminiChatWorkspaceProps) {
  const isAr = language === "ar";

  // State
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load chat history:", e);
    }
    return [];
  });

  const [selectedRole, setSelectedRole] = useState<string>(() => {
    return localStorage.getItem(ROLE_STORAGE_KEY) || "android_specialist";
  });

  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModelId | null;
    // Set default fallback model in selector to gemini-2.5-flash instead of experimental 3.x models to prevent 503 errors
    if (
      saved &&
      saved !== "gemini-3.8-flash" &&
      ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"].includes(saved)
    ) {
      return saved;
    }
    return "gemini-2.5-flash";
  });

  // Agenta LLMOps service status & configuration
  const [isAgentaActive, setIsAgentaActive] = useState<boolean>(() => isAgentaConfigured());
  const agentaConfig = getAgentaConfig();

  const [customInstruction, setCustomInstruction] = useState<string>(() => {
    return (
      localStorage.getItem(CUSTOM_INSTRUCTION_KEY) ||
      CHAT_ROLES[0].systemInstruction
    );
  });

  const [showRoleConfig, setShowRoleConfig] = useState(false);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Gemini API key server status & client-side fallback
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(false);
  const [useClientFallback, setUseClientFallback] = useState<boolean>(false);
  const clientFallbackKey = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || "").trim();

  const checkApiKeyStatus = async () => {
    try {
      setIsCheckingKey(true);
      const res = await fetch("/api/gemini/status");
      if (res.ok) {
        const data = await res.json();
        if (data.configured === true) {
          setApiKeyConfigured(true);
          setUseClientFallback(false);
          return;
        }
      }
    } catch {
      // Server unreachable or offline
    } finally {
      setIsCheckingKey(false);
    }

    // Check client-side fallback key
    if (clientFallbackKey) {
      setApiKeyConfigured(true);
      setUseClientFallback(true);
    } else {
      setApiKeyConfigured(false);
      setUseClientFallback(false);
    }
  };

  useEffect(() => {
    checkApiKeyStatus();
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to save chat messages:", e);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(ROLE_STORAGE_KEY, selectedRole);
  }, [selectedRole]);

  useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_INSTRUCTION_KEY, customInstruction);
  }, [customInstruction]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Handle Role selection
  const handleSelectRole = (roleId: string) => {
    setSelectedRole(roleId);
    const roleObj = CHAT_ROLES.find((r) => r.id === roleId);
    if (roleObj) {
      setCustomInstruction(roleObj.systemInstruction);
      setSelectedModel(roleObj.recommendedModel);
    }
  };

  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setErrorStatus(null);
  };

  const handleExportHistory = () => {
    if (messages.length === 0) return;
    const formatted = messages
      .map(
        (m) =>
          `### ${m.role === "user" ? "User" : `Gemini (${m.modelUsed || selectedModel})`} - ${new Date(
            m.timestamp
          ).toLocaleString()}\n\n${m.content}\n\n---\n`
      )
      .join("\n");

    const blob = new Blob([formatted], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gemini-chat-history-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend !== undefined ? textToSend : inputPrompt).trim();
    if (!query || isGenerating) return;

    setInputPrompt("");
    setErrorStatus(null);

    // Build context with connected device if any
    let enrichedSystemInstruction = customInstruction;
    if (connectedDeviceSerial) {
      enrichedSystemInstruction += `\n\nConnected Target Device: ${connectedDeviceModel || "Android Device"} (Serial: ${connectedDeviceSerial}). Provide commands customized for this device.`;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: query,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // Placeholder model message
    const botMessageId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const botMessage: ChatMessage = {
      id: botMessageId,
      role: "model",
      content: "",
      timestamp: Date.now(),
      modelUsed: isAgentaActive ? "Agenta LLMOps" : selectedModel,
    };

    setMessages((prev) => [...prev, botMessage]);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 1. Check if VITE_AGENTA_ENDPOINT and VITE_AGENTA_API_KEY are available
    const agentaEndpoint = ((import.meta.env.VITE_AGENTA_ENDPOINT as string | undefined) || "").trim();
    const agentaApiKey = ((import.meta.env.VITE_AGENTA_API_KEY as string | undefined) || "").trim();
    const hasAgentaCredentials = Boolean(agentaEndpoint && agentaApiKey);

    // Prioritize Agenta service over the direct Gemini API
    if (hasAgentaCredentials) {
      // Update top status badge to show: "Agenta LLMOps Active"
      setIsAgentaActive(true);

      try {
        const agentaResponse = await askAgenta({
          endpoint: agentaEndpoint,
          apiKey: agentaApiKey,
          query,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemInstruction: enrichedSystemInstruction,
          model: selectedModel,
          signal: controller.signal,
        });

        if (agentaResponse && agentaResponse.trim().length > 0) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    content: agentaResponse.trim(),
                    modelUsed: "Agenta LLMOps",
                  }
                : msg
            )
          );
          setIsGenerating(false);
          abortControllerRef.current = null;
          return;
        }
      } catch (agentaError: any) {
        if (agentaError.name === "AbortError" || controller.signal.aborted) {
          setIsGenerating(false);
          abortControllerRef.current = null;
          return;
        }
        console.warn("Agenta LLMOps service request failed; falling back to direct Gemini API:", agentaError);
        // Only fall back to direct Gemini API if Agenta fails or credentials are missing
      }
    }

    // Fallback: If known that API key is not configured and no client key fallback exists, provide setup guidance
    if (apiKeyConfigured === false && !clientFallbackKey) {
      setIsGenerating(false);
      abortControllerRef.current = null;
      const guidance = isAr
        ? `⚠️ **مفتاح GEMINI_API_KEY غير معين حالياً**

لتفعيل ردود نموذج Gemini الذكي مباشرة:
1. افتح قائمة **Settings** (أيقونة الترس في أعلى نافذة AI Studio).
2. اختر قسم **Secrets**.
3. أضف متغير باسم \`GEMINI_API_KEY\` (أو \`VITE_GEMINI_API_KEY\`) والصق قيمة مفتاح Gemini الخاص بك.
4. بعد الحفظ، اضغط على زر **«إعادة فحص الاتصال»** في الشريط العلوي وسيبدأ المساعد بالعمل فوراً.

*ملاحظة: يمكنك استخدام جميع وظائف مركز التحكم الأخرى (WebUSB ADB، تدفق وتصدير Logcat، إدارة التطبيقات) بشكل طبيعي دون الحاجة للمفتاح.*`
        : `⚠️ **GEMINI_API_KEY is not configured in Settings > Secrets**

To enable live Gemini AI responses:
1. Open the **Settings** menu (gear icon in the top AI Studio toolbar).
2. Go to the **Secrets** section.
3. Add a secret named \`GEMINI_API_KEY\` (or \`VITE_GEMINI_API_KEY\`) with your Google Gemini API key.
4. Click **Re-check Status** in the banner above to immediately enable live AI responses.

*Note: All core Android Control features (WebUSB ADB shell, Logcat streaming & .txt exports, and debloating) operate locally without needing an API key.*`;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                content: guidance,
                modelUsed: selectedModel,
              }
            : msg
        )
      );
      return;
    }

    // Direct client fallback execution
    if (useClientFallback && clientFallbackKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: clientFallbackKey });
        const contents = newMessages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }));

        const responseStream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: enrichedSystemInstruction,
          },
        });

        let accumulatedText = "";
        for await (const chunk of responseStream) {
          if (controller.signal.aborted) break;
          if (chunk.text) {
            accumulatedText += chunk.text;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? { ...msg, content: accumulatedText }
                  : msg
              )
            );
          }
        }
      } catch (clientErr: any) {
        if (clientErr.name === "AbortError" || controller.signal.aborted) {
          // Handled
        } else {
          setErrorStatus(clientErr?.message || "Client-side Gemini error");
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    content: `⚠️ Error: ${clientErr?.message || "Direct client generation failed"}`,
                  }
                : msg
            )
          );
        }
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            text: m.content,
          })),
          model: selectedModel,
          systemInstruction: enrichedSystemInstruction,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // If server failed and client fallback key is available, attempt client fallback seamlessly
        if (clientFallbackKey) {
          setUseClientFallback(true);
          const ai = new GoogleGenAI({ apiKey: clientFallbackKey });
          const contents = newMessages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          }));

          const responseStream = await ai.models.generateContentStream({
            model: selectedModel,
            contents,
            config: {
              systemInstruction: enrichedSystemInstruction,
            },
          });

          let accumulatedText = "";
          for await (const chunk of responseStream) {
            if (controller.signal.aborted) break;
            if (chunk.text) {
              accumulatedText += chunk.text;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMessageId
                    ? { ...msg, content: accumulatedText }
                    : msg
                )
              );
            }
          }
          return;
        }

        // Non-stream or error response
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Server responded with status ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("No response body received from chat stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const dataContent = trimmed.slice(6);
          if (dataContent === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulatedText += parsed.text;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMessageId
                    ? { ...msg, content: accumulatedText }
                    : msg
                )
              );
            }
          } catch (err: any) {
            if (err.message && !err.message.includes("JSON.parse")) {
              throw err;
            }
          }
        }
      }

      if (!accumulatedText) {
        // Fallback to standard chat call if stream delivered empty payload
        const fallbackRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              text: m.content,
            })),
            model: selectedModel,
            systemInstruction: enrichedSystemInstruction,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackData.text) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? { ...msg, content: fallbackData.text }
                : msg
            )
          );
        } else if (fallbackData.error) {
          throw new Error(fallbackData.error);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Chat generation stopped by user.");
      } else {
        const errorMessage = err?.message || "Failed to communicate with Gemini.";
        setErrorStatus(errorMessage);

        if (errorMessage.includes("GEMINI_API_KEY")) {
          setApiKeyConfigured(false);
        }

        const formattedFallback = errorMessage.includes("GEMINI_API_KEY")
          ? isAr
            ? `⚠️ **مفتاح GEMINI_API_KEY غير متوفر في الخادم**\n\nيرجى تعيين المفتاح من خلال قائمة **Settings > Secrets** في AI Studio لتفعيل المحادثة، ثم الضغط على **إعادة فحص الاتصال**.`
            : `⚠️ **GEMINI_API_KEY is not configured**\n\nPlease add your \`GEMINI_API_KEY\` in **Settings > Secrets** to enable Gemini chatbot responses, then click **Re-check Status**.`
          : isAr
          ? `⚠️ تعذر الحصول على رد من النموذج: ${errorMessage}`
          : `⚠️ Failed to receive response: ${errorMessage}`;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? {
                  ...msg,
                  content: msg.content || formattedFallback,
                }
              : msg
          )
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const activeRoleObj = CHAT_ROLES.find((r) => r.id === selectedRole);

  return (
    <div
      className="flex flex-col h-full bg-[#f6f2ea] dark:bg-[#0c1622] text-[#14253a] dark:text-[#f6f2ea] border border-[#d8d3c5] dark:border-[#1d2d3d] rounded-lg overflow-hidden"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#ebe6dc] dark:bg-[#121f2d] border-b border-[#d8d3c5] dark:border-[#1d2d3d]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#b4d642]/20 border border-[#b4d642]/40 text-[#54730f] dark:text-[#b4d642]">
            <Bot size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
                {isAr ? "روبوت محادثة Gemini" : "Gemini AI Chat Assistant"}
                {isAgentaActive ? (
                  <span
                    id="agenta-status-badge"
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.68rem] font-bold bg-[#0284c7]/20 text-[#0284c7] dark:bg-[#0284c7]/30 dark:text-[#38bdf8] border border-[#0ea5e9]/40 shadow-xs"
                    title={isAr ? "خدمة Agenta LLMOps نشطة وتملك الأولوية" : "Agenta LLMOps Active"}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#38bdf8] animate-pulse" />
                    Agenta LLMOps Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.65rem] font-medium bg-[#b4d642]/30 text-[#435e07] dark:text-[#d3f462]">
                    v3
                  </span>
                )}
              </h2>
            </div>
            <p className="text-xs text-[#5c6e7e] dark:text-[#8e9ca8]">
              {isAr
                ? "محادثات متعددة الأدوار مع سجل محفوظ وأدوار مخصصة"
                : "Multi-turn assistant with persistent history & custom system roles"}
            </p>
          </div>
        </div>

        {/* Model and Role Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Model Selector */}
          <div className="flex items-center bg-[#f6f2ea] dark:bg-slate-900 border border-[#d8d3c5] dark:border-slate-700 rounded-md px-2 py-1 text-xs focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500">
            <Sparkles size={13} className="text-[#b4d642] dark:text-cyan-400 mr-1.5 ml-1.5" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as GeminiModelId)}
              className="bg-transparent text-xs font-mono font-medium focus:outline-none cursor-pointer text-[#14253a] dark:text-slate-100"
              title={isAr ? "اختر نموذج Gemini" : "Select Gemini Model"}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  className="bg-[#f6f2ea] dark:bg-slate-900 text-[#14253a] dark:text-slate-100"
                >
                  {m.name} ({isAr ? m.badge.ar : m.badge.en})
                </option>
              ))}
            </select>
          </div>

          {/* Role Config Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRoleConfig(!showRoleConfig)}
            className="h-8 text-xs border-[#d8d3c5] dark:border-slate-700 flex items-center gap-1.5 bg-[#f6f2ea] dark:bg-slate-900 dark:text-slate-200"
          >
            <Sliders size={13} />
            <span>{activeRoleObj ? (isAr ? activeRoleObj.name.ar : activeRoleObj.name.en) : (isAr ? "الدور والنظام" : "Role & Instruction")}</span>
            <ChevronDown size={12} className={`transition-transform ${showRoleConfig ? "rotate-180" : ""}`} />
          </Button>

          {/* Action buttons */}
          <div className="flex items-center gap-1 border-s border-[#d8d3c5] dark:border-slate-700 ps-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportHistory}
              disabled={messages.length === 0}
              className="h-8 px-2 text-xs text-[#5c6e7e] dark:text-[#8e9ca8] hover:text-[#14253a] dark:hover:text-[#f6f2ea]"
              title={isAr ? "تصدير المحادثة كملف Markdown" : "Export chat as Markdown"}
            >
              <Download size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              disabled={messages.length === 0}
              className="h-8 px-2 text-xs text-[#5c6e7e] dark:text-[#8e9ca8] hover:text-[#c95a4b]"
              title={isAr ? "مسح سجل المحادثة" : "Clear chat history"}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Agenta LLMOps Active Banner */}
      {isAgentaActive && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#f0f9ff] dark:bg-[#082f49]/30 border-b border-[#bae6fd] dark:border-[#0369a1]/40 text-[#0369a1] dark:text-[#7dd3fc] text-xs">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-[#0284c7] dark:text-[#38bdf8] shrink-0" />
            <span className="font-semibold text-[0.78rem]">
              Agenta LLMOps Active
            </span>
            <span className="text-[0.7rem] text-[#0369a1]/80 dark:text-[#7dd3fc]/80 hidden sm:inline">
              ({isAr ? "طلبات المحادثة موجهة عبر Agenta مع الاحتياطي التلقائي لـ Gemini" : "Chat requests routed through Agenta LLMOps with automatic Gemini API fallback"})
            </span>
          </div>
          <span className="text-[0.68rem] px-2 py-0.5 rounded bg-[#0284c7]/10 dark:bg-[#0284c7]/30 text-[#0284c7] dark:text-[#38bdf8] font-mono border border-[#0284c7]/20">
            Fallback: {selectedModel}
          </span>
        </div>
      )}

      {/* API Key Status Notice */}
      {useClientFallback && clientFallbackKey && !isAgentaActive && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#f4fae8] dark:bg-[#142310] border-b border-[#cce89c] dark:border-[#2f4b23] text-[#345c16] dark:text-[#b0ea77] text-xs">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#598c25] dark:text-[#a8e869] shrink-0" />
            <span className="font-semibold text-[0.78rem]">
              {isAr
                ? "وضع الاتصال المباشر بالواجهة نشط (VITE_GEMINI_API_KEY)"
                : "Direct Client-Side Mode Active (VITE_GEMINI_API_KEY)"}
            </span>
          </div>
          <button
            type="button"
            onClick={checkApiKeyStatus}
            disabled={isCheckingKey}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#a2d861] bg-[#ffffff] text-[#345c16] hover:bg-[#e4f4cf] dark:border-[#406828] dark:bg-[#101c0b] dark:text-[#b0ea77] text-[0.7rem] font-medium shrink-0"
          >
            <RefreshCw size={10} className={isCheckingKey ? "animate-spin" : ""} />
            <span>{isAr ? "فحص الخادم" : "Check Server"}</span>
          </button>
        </div>
      )}

      {apiKeyConfigured === false && !clientFallbackKey && !isAgentaActive && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-2.5 bg-[#fdf3e7] dark:bg-[#281c10] border-b border-[#f1d0aa] dark:border-[#4d361c] text-[#854508] dark:text-[#f8b878] text-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="text-[#c46914] dark:text-[#f8b878] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[0.78rem]">
                {isAr
                  ? "مفتاح GEMINI_API_KEY غير معين حالياً"
                  : "GEMINI_API_KEY is not configured"}
              </p>
              <p className="text-[0.72rem] text-[#9b5b18] dark:text-[#d4995f] mt-0.5">
                {isAr
                  ? "لتشغيل ردود الذكاء الاصطناعي، يرجى إضافة المفتاح GEMINI_API_KEY في Settings > Secrets أو VITE_GEMINI_API_KEY في البيئة. بقية أدوات ADB و Logcat تعمل بالكامل محلياً."
                  : "To activate live Gemini AI responses, add GEMINI_API_KEY under Settings > Secrets or VITE_GEMINI_API_KEY in environment. Core WebUSB ADB & Logcat features operate locally."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={checkApiKeyStatus}
            disabled={isCheckingKey}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#df9d5b] bg-[#fffaf4] text-[#854508] hover:bg-[#f6dfca] dark:border-[#73512b] dark:bg-[#1a1209] dark:text-[#f8b878] dark:hover:bg-[#2d2114] text-xs font-semibold shrink-0"
          >
            <RefreshCw size={11} className={isCheckingKey ? "animate-spin" : ""} />
            <span>{isAr ? "إعادة فحص الاتصال" : "Re-check Status"}</span>
          </button>
        </div>
      )}

      {/* Role & System Instruction Drawer */}
      {showRoleConfig && (
        <div className="p-4 bg-[#f1ede3] dark:bg-[#0f1a26] border-b border-[#d8d3c5] dark:border-[#1d2d3d] transition-all">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5c6e7e] dark:text-[#8e9ca8]">
                {isAr ? "تحديد دور الروبوت والتعليمات البرمجية (System Instruction)" : "Select Chatbot Role & System Instruction"}
              </span>
              <span className="text-[0.7rem] text-[#8e9ca8]">
                {isAr ? "تحدد هذه التعليمات طريقة تفكير ونبرة ردود المساعد" : "Governs chatbot persona, safety thresholds, and answer tone"}
              </span>
            </div>

            {/* Role preset chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {CHAT_ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => handleSelectRole(role.id)}
                    className={`text-start p-2.5 rounded-lg border transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-[#b4d642]/15 border-[#b4d642] text-[#14253a] dark:text-[#f6f2ea] shadow-xs"
                        : "bg-[#f6f2ea] dark:bg-[#121f2d] border-[#d8d3c5] dark:border-[#1d2d3d] text-[#5c6e7e] dark:text-[#8e9ca8] hover:border-[#a3b899]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={15} className={isSelected ? "text-[#54730f] dark:text-[#b4d642]" : ""} />
                      <span className="text-xs font-medium text-[#14253a] dark:text-[#f6f2ea]">
                        {isAr ? role.name.ar : role.name.en}
                      </span>
                    </div>
                    <p className="text-[0.7rem] line-clamp-2 text-[#5c6e7e] dark:text-[#8e9ca8]">
                      {isAr ? role.description.ar : role.description.en}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Editable System Instruction */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-[#14253a] dark:text-[#f6f2ea] flex items-center gap-1.5">
                  <Terminal size={13} className="text-[#b4d642]" />
                  {isAr ? "نص تعليمات النظام المخصصة (System Instruction)" : "Custom System Instruction"}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const r = CHAT_ROLES.find((c) => c.id === selectedRole);
                    if (r) setCustomInstruction(r.systemInstruction);
                  }}
                  className="text-[0.7rem] text-[#54730f] dark:text-[#b4d642] hover:underline"
                >
                  {isAr ? "إعادة التعيين إلى الافتراضي" : "Reset to Role Default"}
                </button>
              </div>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                rows={2}
                className="w-full text-xs font-mono p-2.5 rounded-md bg-[#f6f2ea] dark:bg-slate-900 border border-[#d8d3c5] dark:border-slate-700 text-[#14253a] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder={isAr ? "اكتب تعليمات النظام هنا..." : "Type custom system instructions here..."}
              />
            </div>
          </div>
        </div>
      )}

      {/* Connected device hint banner */}
      {connectedDeviceSerial && (
        <div className="px-4 py-1.5 bg-[#b4d642]/10 border-b border-[#b4d642]/20 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#435e07] dark:text-[#b4d642]">
            <Terminal size={13} />
            <span>
              {isAr ? "الجهاز المتصل حالياً:" : "Connected Target Device:"}{" "}
              <strong>{connectedDeviceModel || "Android Device"}</strong> ({connectedDeviceSerial})
            </span>
          </div>
          <span className="text-[0.65rem] text-[#5c6e7e] dark:text-[#8e9ca8]">
            {isAr ? "يتم تمرير سياق الجهاز تلقائياً للروبوت" : "Device context automatically provided to Gemini"}
          </span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-[#b4d642]/15 border border-[#b4d642]/30 flex items-center justify-center text-[#54730f] dark:text-[#b4d642] mb-3">
              <Bot size={28} />
            </div>
            <h3 className="text-base font-semibold text-[#14253a] dark:text-[#f6f2ea] mb-1">
              {isAr ? "مساعد Gemini الذكي لأندرويد" : "Gemini Android Intelligence"}
            </h3>
            <p className="text-xs text-[#5c6e7e] dark:text-[#8e9ca8] mb-6">
              {isAr
                ? "اطرح أي سؤال حول أوامر ADB، فحص حزم APK، تحليل سجلات Logcat، أو استكشاف أخطاء الجهاز وحلها."
                : "Ask any question about ADB commands, debloating safety, APK analysis, Logcat troubleshooting, or device diagnostics."}
            </p>

            {/* Quick Prompts */}
            <div className="w-full space-y-2">
              <span className="text-[0.7rem] uppercase font-semibold text-[#8e9ca8] block text-start">
                {isAr ? "اقتراحات سريعة للبدء:" : "Suggested inquiries:"}
              </span>
              <div className="grid grid-cols-1 gap-2 text-start">
                {(isAr ? SUGGESTED_PROMPTS.ar : SUGGESTED_PROMPTS.en).map(
                  (promptText, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(promptText)}
                      className="p-2.5 text-xs rounded-lg bg-[#ebe6dc] dark:bg-[#121f2d] hover:bg-[#e2ddd1] dark:hover:bg-[#182a3d] border border-[#d8d3c5] dark:border-[#1d2d3d] text-[#14253a] dark:text-[#f6f2ea] transition-all flex items-center justify-between group"
                    >
                      <span>{promptText}</span>
                      <Send size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#54730f] dark:text-[#b4d642]" />
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  isUser ? "ms-auto flex-row-reverse" : "me-auto"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                    isUser
                      ? "bg-[#14253a] text-[#f6f2ea] dark:bg-[#20364f]"
                      : "bg-[#b4d642] text-[#14253a] font-bold shadow-xs"
                  }`}
                >
                  {isUser ? <User size={14} /> : <Bot size={15} />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`flex flex-col space-y-1 ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-xl px-4 py-3 text-xs leading-relaxed max-w-2xl border shadow-xs ${
                      isUser
                        ? "bg-[#14253a] text-[#f6f2ea] border-[#14253a] dark:bg-[#182c40] dark:border-[#243e5a]"
                        : "bg-[#ffffff] dark:bg-[#121f2d] text-[#14253a] dark:text-[#f6f2ea] border-[#d8d3c5] dark:border-[#1d2d3d]"
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : msg.content ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs space-y-2 [&_pre]:bg-[#0c1622] [&_pre]:text-[#f6f2ea] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:font-mono [&_pre]:text-[0.75rem] [&_code]:bg-[#0c1622]/10 dark:[&_code]:bg-[#ffffff]/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_ul]:list-disc [&_ul]:ms-4 [&_ol]:list-decimal [&_ol]:ms-4">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-[#5c6e7e] dark:text-[#8e9ca8]">
                        <RefreshCw size={13} className="animate-spin text-[#b4d642]" />
                        <span>{isAr ? "جارٍ التفكير وإنشاء الرد..." : "Gemini is thinking and drafting response..."}</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata and Actions footer */}
                  <div className="flex items-center gap-2 px-1 text-[0.65rem] text-[#8e9ca8]">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {!isUser && msg.modelUsed && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{msg.modelUsed}</span>
                      </>
                    )}
                    {msg.content && (
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="hover:text-[#14253a] dark:hover:text-[#f6f2ea] transition-colors p-0.5"
                        title={isAr ? "نسخ النص" : "Copy text"}
                      >
                        {copiedId === msg.id ? (
                          <Check size={11} className="text-emerald-500" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error notification banner if any */}
      {errorStatus && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorStatus}</span>
          </div>
          <button
            onClick={() => setErrorStatus(null)}
            className="text-xs underline hover:no-underline"
          >
            {isAr ? "إغلاق" : "Dismiss"}
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 bg-[#ebe6dc] dark:bg-[#121f2d] border-t border-[#d8d3c5] dark:border-[#1d2d3d]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex flex-col gap-2 max-w-4xl mx-auto"
        >
          <div className="relative flex items-end gap-2 bg-[#f6f2ea] dark:bg-slate-900 border border-[#d8d3c5] dark:border-slate-700 rounded-xl p-2 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500">
            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                isAr
                  ? "اسأل Gemini أي شيء عن أوامر أندرويد، فحص الحزم أو استكشاف الأخطاء... (Shift+Enter لسطر جديد)"
                  : "Ask Gemini about ADB commands, package audits, or system logs... (Shift+Enter for newline)"
              }
              rows={2}
              className="flex-1 bg-transparent text-xs resize-none focus:outline-none text-[#14253a] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-relaxed"
            />

            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              {isGenerating ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStopGeneration}
                  className="h-8 px-2.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5"
                >
                  <Square size={12} />
                  <span>{isAr ? "إيقاف" : "Stop"}</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!inputPrompt.trim()}
                  size="sm"
                  className="h-8 px-3 text-xs bg-[#b4d642] hover:bg-[#a2c433] text-[#14253a] font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Send size={13} />
                  <span>{isAr ? "إرسال" : "Send"}</span>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[0.68rem] text-[#8e9ca8] px-1">
            <span className="flex items-center gap-1">
              <MessageSquareCode size={11} />
              {isAr
                ? "يتم الاحتفاظ بسياق المحادثة عبر الأدوار لدعم الاستفسارات المتتالية"
                : "Multi-turn context retained for continuous back-and-forth debugging"}
            </span>
            <span>
              {isAr
                ? `النموذج النشط: ${selectedModel}`
                : `Active: ${selectedModel}`}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
export default GeminiChatWorkspace;
