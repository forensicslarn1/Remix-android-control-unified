/**
 * Agenta LLMOps client integration
 * Prioritizes Agenta service variants over direct model calls for managed prompt lifecycle,
 * evaluation, and enterprise observability.
 */

export interface AgentaChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export interface AskAgentaParams {
  endpoint?: string;
  apiKey?: string;
  query: string;
  messages?: AgentaChatMessage[];
  systemInstruction?: string;
  model?: string;
  signal?: AbortSignal;
}

/**
 * Checks whether Agenta credentials and endpoint are present in client environment
 */
export function isAgentaConfigured(): boolean {
  const endpoint = ((import.meta.env.VITE_AGENTA_ENDPOINT as string | undefined) || "").trim();
  const apiKey = ((import.meta.env.VITE_AGENTA_API_KEY as string | undefined) || "").trim();
  return Boolean(endpoint && apiKey);
}

/**
 * Retrieves normalized Agenta configuration
 */
export function getAgentaConfig(): { endpoint: string; apiKey: string } {
  const endpoint = ((import.meta.env.VITE_AGENTA_ENDPOINT as string | undefined) || "").trim();
  const apiKey = ((import.meta.env.VITE_AGENTA_API_KEY as string | undefined) || "").trim();
  return { endpoint, apiKey };
}

/**
 * Calls the Agenta LLMOps service endpoint with user query and conversation context.
 * Throws an error on non-OK responses or network failures so caller can fall back to direct Gemini.
 */
export async function askAgenta(params: AskAgentaParams): Promise<string> {
  const envConfig = getAgentaConfig();
  const endpoint = (params.endpoint || envConfig.endpoint || "").trim();
  const apiKey = (params.apiKey || envConfig.apiKey || "").trim();

  if (!endpoint) {
    throw new Error("Agenta endpoint is missing (VITE_AGENTA_ENDPOINT).");
  }

  // Build headers conforming to Agenta variant / invoke conventions
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    // Agenta uses 'Authorization: ApiKey <KEY>' for authenticated variant invocations
    if (apiKey.startsWith("ApiKey ") || apiKey.startsWith("Bearer ")) {
      headers["Authorization"] = apiKey;
    } else {
      headers["Authorization"] = `ApiKey ${apiKey}`;
    }
    // Also provide standard x-api-key for custom reverse proxies
    headers["x-api-key"] = apiKey.replace(/^(ApiKey|Bearer)\s+/i, "");
  }

  const formattedMessages = (params.messages || []).map((m) => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.content,
  }));

  // Build payload compatible with both Agenta variants (inputs/parameters) and unified /invoke endpoints
  const payload = {
    // Agenta variant input dictionary
    inputs: {
      query: params.query,
      prompt: params.query,
      message: params.query,
      input: params.query,
      messages: formattedMessages,
      system_instruction: params.systemInstruction || "",
    },
    // Agenta unified /v0/invoke format
    data: {
      inputs: {
        query: params.query,
        prompt: params.query,
        message: params.query,
        input: params.query,
        messages: formattedMessages,
      },
    },
    // Direct chat parameters
    prompt: params.query,
    message: params.query,
    messages: formattedMessages,
    systemInstruction: params.systemInstruction || undefined,
    model: params.model || undefined,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: params.signal,
  });

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `Agenta service request failed with HTTP ${response.status}: ${errBody || response.statusText}`
    );
  }

  // Parse response
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();

    // Handle common Agenta and LLM output structures
    if (typeof json === "string") {
      return json;
    }
    if (typeof json.response === "string" && json.response) {
      return json.response;
    }
    if (typeof json.output === "string" && json.output) {
      return json.output;
    }
    if (typeof json.message === "string" && json.message) {
      return json.message;
    }
    if (json.message && typeof json.message.content === "string") {
      return json.message.content;
    }
    if (Array.isArray(json.choices) && json.choices.length > 0) {
      const choice = json.choices[0];
      if (typeof choice.text === "string") return choice.text;
      if (choice.message && typeof choice.message.content === "string") {
        return choice.message.content;
      }
    }
    if (typeof json.data === "string" && json.data) {
      return json.data;
    }
    if (json.data && typeof json.data.output === "string") {
      return json.data.output;
    }
    if (json.data && typeof json.data.response === "string") {
      return json.data.response;
    }
    if (typeof json.result === "string" && json.result) {
      return json.result;
    }
    if (typeof json.text === "string" && json.text) {
      return json.text;
    }
    if (typeof json.content === "string" && json.content) {
      return json.content;
    }

    return JSON.stringify(json, null, 2);
  } else {
    // Plain text response
    return await response.text();
  }
}
