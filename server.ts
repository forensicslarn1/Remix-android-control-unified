import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Try loading local .env if available
try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile();
  }
} catch {
  // Ignored if .env file does not exist
}

let aiClient: GoogleGenAI | null = null;
let lastKnownApiKey: string | null = null;

function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient || lastKnownApiKey !== apiKey) {
    lastKnownApiKey = apiKey;
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Gemini status check
  app.get("/api/gemini/status", (_req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
    res.json({
      configured: hasKey,
      defaultModel: "gemini-3.8-flash",
      models: [
        {
          id: "gemini-3.8-flash",
          name: "Gemini 3.8 Flash",
          description: "Default balanced model for general inquiries and troubleshooting",
        },
        {
          id: "gemini-3.5-flash",
          name: "Gemini 3.5 Flash",
          description: "General tasks, script advice, and system documentation",
        },
        {
          id: "gemini-3.1-flash-lite",
          name: "Gemini 3.1 Flash Lite",
          description: "Ultra-fast response for quick shell syntax and lookup",
        },
        {
          id: "gemini-3.1-pro-preview",
          name: "Gemini 3.1 Pro Preview",
          description: "In-depth reasoning for complex forensics and log debugging",
          requiresPaid: true,
        },
      ],
    });
  });

  // Non-streaming chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        res.status(401).json({
          configured: false,
          error: "GEMINI_API_KEY is not configured in the server environment. Please configure it in Settings > Secrets.",
        });
        return;
      }

      const { messages, model = "gemini-3.8-flash", systemInstruction } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
        return;
      }

      const ai = getGenAI();
      if (!ai) {
        res.status(401).json({
          configured: false,
          error: "GEMINI_API_KEY is not configured in the server environment. Please configure it in Settings > Secrets.",
        });
        return;
      }

      const contents = messages.map((m: { role: string; content?: string; text?: string }) => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: m.text || m.content || "" }],
      }));

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemInstruction || undefined,
        },
      });

      const replyText = response.text || "";
      res.json({
        text: replyText,
        model,
      });
    } catch (error: any) {
      console.warn("Gemini chat non-fatal request notice:", error?.message || error);
      res.status(500).json({
        error: error?.message || "Failed to generate response from Gemini model.",
      });
    }
  });

  // Streaming chat endpoint via Server-Sent Events
  app.post("/api/chat/stream", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        res.status(401).json({
          configured: false,
          error: "GEMINI_API_KEY is not configured in the server environment. Please configure it in Settings > Secrets.",
        });
        return;
      }

      const { messages, model = "gemini-3.8-flash", systemInstruction } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "Missing or invalid 'messages' array." });
        return;
      }

      const ai = getGenAI();
      if (!ai) {
        res.status(401).json({
          configured: false,
          error: "GEMINI_API_KEY is not configured in the server environment. Please configure it in Settings > Secrets.",
        });
        return;
      }

      const contents = messages.map((m: { role: string; content?: string; text?: string }) => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: m.text || m.content || "" }],
      }));

      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: systemInstruction || undefined,
        },
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.warn("Gemini stream non-fatal request notice:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({
          error: error?.message || "Failed to stream response from Gemini model.",
        });
      } else {
        res.write(`data: ${JSON.stringify({ error: error?.message || "Stream interrupted." })}\n\n`);
        res.end();
      }
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
