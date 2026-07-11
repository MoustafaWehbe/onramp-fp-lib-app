// Native client for the self-hosted Ollama server on the LAN.
//
// There is deliberately NO cloud fallback: if OLLAMA_BASE_URL is unset or the
// host is unreachable, calls throw loudly. The project's data must not leave the
// network, so a silent failover to a hosted API is not acceptable. The literal
// LAN address lives only in the gitignored .env. See docs/ai-provider.md.

/** A single chat message in Ollama's /api/chat format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Overrides OLLAMA_GENERATION_MODEL for this call (used by the C2 bake-off). */
  model?: string;
  /** Sampling temperature, forwarded as Ollama `options.temperature`. */
  temperature?: number;
  /** Request timeout in ms. Defaults to 120s — local generation models are large. */
  timeoutMs?: number;
  /** Additional raw Ollama `options` (e.g. num_ctx, seed). */
  options?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Base URL of the self-hosted Ollama server, with any trailing slash stripped. */
export function ollamaBaseUrl(): string {
  const url = process.env.OLLAMA_BASE_URL;
  if (!url) {
    throw new Error(
      "OLLAMA_BASE_URL is not configured. Point it at the self-hosted Ollama " +
        "server (see .env.example). There is no cloud fallback.",
    );
  }
  return url.replace(/\/+$/, "");
}

/**
 * POST JSON to an Ollama endpoint and parse the JSON response.
 *
 * Throws a clear, actionable error when the host is unreachable, times out, or
 * returns a non-2xx status — it never silently degrades to another provider.
 */
export async function ollamaPost<T>(
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const url = `${ollamaBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new Error(
      `Ollama request to ${url} failed — the host is unreachable or timed out. ` +
        "No cloud fallback is configured.",
      { cause },
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Ollama request to ${url} returned ${res.status} ${res.statusText}` +
        (detail ? `: ${detail}` : ""),
    );
  }
  return (await res.json()) as T;
}

/** Resolve the generation model: explicit arg first, then OLLAMA_GENERATION_MODEL. */
export function resolveGenerationModel(explicit?: string): string {
  const model = explicit ?? process.env.OLLAMA_GENERATION_MODEL;
  if (!model) {
    throw new Error(
      "No generation model configured. Set OLLAMA_GENERATION_MODEL (pending the " +
        "generation bake-off) or pass `model` explicitly.",
    );
  }
  return model;
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
}

/**
 * Non-streaming chat completion against the self-hosted Ollama server.
 * Returns the assistant message content ("" if the model produced none).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const model = resolveGenerationModel(options.model);

  const ollamaOptions: Record<string, unknown> = { ...options.options };
  if (options.temperature !== undefined) {
    ollamaOptions.temperature = options.temperature;
  }

  const body = {
    model,
    messages,
    stream: false,
    ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
  };

  const data = await ollamaPost<OllamaChatResponse>(
    "/api/chat",
    body,
    options.timeoutMs,
  );
  return data.message?.content ?? "";
}
