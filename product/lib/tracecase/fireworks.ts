const DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1";
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export type FireworksContent = string | Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
>;

export type FireworksMessage = {
  role: "system" | "user" | "assistant";
  content: FireworksContent;
};

export type FireworksSettings = {
  apiKey?: string;
  baseUrl: string;
  model?: string;
  visionModel?: string;
  configured: boolean;
  visionConfigured: boolean;
};

export class FireworksRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "FireworksRequestError";
  }
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === "(Sensitive)" || /^\*+$/.test(normalized)) return undefined;
  return normalized;
}

export function getFireworksSettings(env: NodeJS.ProcessEnv = process.env): FireworksSettings {
  const candidateApiKey = clean(env.FIREWORKS_API_KEY);
  const apiKey = candidateApiKey?.startsWith("fw_") ? candidateApiKey : undefined;
  const model = clean(env.FIREWORKS_MODEL);
  const visionModel = clean(env.FIREWORKS_VISION_MODEL) ?? model;
  return {
    apiKey,
    baseUrl: (clean(env.FIREWORKS_BASE_URL) ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model,
    visionModel,
    configured: Boolean(apiKey && model),
    visionConfigured: Boolean(apiKey && visionModel),
  };
}

export async function requestFireworksChat(options: {
  messages: FireworksMessage[];
  vision?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: Record<string, unknown>;
  timeoutMs?: number;
  retries?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}): Promise<string> {
  const settings = getFireworksSettings(options.env);
  const model = options.model ?? (options.vision ? settings.visionModel : settings.model);
  if (!settings.apiKey || !model) throw new FireworksRequestError("Fireworks is not configured");
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = Math.max(0, Math.min(2, options.retries ?? 1));
  let lastError: FireworksRequestError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(`${settings.baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0,
          max_tokens: options.maxTokens ?? 512,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
      });
      if (!response.ok) {
        const retryable = RETRYABLE_STATUSES.has(response.status);
        lastError = new FireworksRequestError(`Fireworks returned HTTP ${response.status}`, response.status, retryable);
        if (!retryable || attempt === retries) throw lastError;
      } else {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content?.trim();
        if (!content) throw new FireworksRequestError("Fireworks returned an empty response", response.status, false);
        return content;
      }
    } catch (error) {
      if (error instanceof FireworksRequestError) {
        lastError = error;
        if (!error.retryable || attempt === retries) throw error;
      } else {
        lastError = new FireworksRequestError("Fireworks request timed out or could not connect", undefined, true);
        if (attempt === retries) throw lastError;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, options.retryDelayMs ?? 250) * 2 ** attempt));
  }

  throw lastError ?? new FireworksRequestError("Fireworks request failed");
}

export function safeFireworksError(error: unknown): { message: string; status?: number; retryable: boolean } {
  if (error instanceof FireworksRequestError) {
    return { message: error.message, ...(error.status ? { status: error.status } : {}), retryable: error.retryable };
  }
  return { message: "Fireworks request failed", retryable: false };
}
