import type { ProviderConfig } from '../types.js';
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider, ToolCall } from './types.js';
import {
  categoryForStatus,
  isRetryableProviderError,
  normalizeProviderError,
  ProviderRequestError,
} from './errors.js';

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.config.apiKey) {
      throw new ProviderRequestError(
        'FC_API_KEY is not configured. Set it in .fuckcolloge/config.json or via FC_API_KEY.',
        { category: 'configuration' }
      );
    }

    const endpoint = this.config.baseUrl.replace(/\/$/, '');
    const body: any = {
      model: this.config.model,
      temperature: options?.temperature ?? this.config.temperature,
      messages,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }

    let lastError: any = null;
    const maxAttempts = 5;
    const requestStartedAt = Date.now();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options?.timeoutMs ?? 180_000),
        });

        if (!response.ok) {
          const text = await response.text();
          let retryAfterMs: number | undefined;
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const retryAfterSeconds = Number.parseFloat(retryAfter);
            if (!Number.isNaN(retryAfterSeconds)) {
              retryAfterMs = retryAfterSeconds * 1000;
            }
          }
          throw new ProviderRequestError(
            `OpenAI-compatible provider request failed: ${response.status} ${response.statusText}\n${text}`,
            {
              category: categoryForStatus(response.status),
              status: response.status,
              retryAfterMs,
            }
          );
        }

        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          error?: unknown;
        };

        const message = json.choices?.[0]?.message;
        if (!message) {
          throw new ProviderRequestError(
            `Provider returned no message: ${JSON.stringify(json.error ?? json)}`,
            { category: 'invalid-response' }
          );
        }

        return {
          content: message.content ?? null,
          tool_calls: message.tool_calls,
          usage: json.usage ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          } : undefined,
          meta: {
            attempts: attempt,
            durationMs: Date.now() - requestStartedAt,
          },
        };
      } catch (error: unknown) {
        const err = normalizeProviderError(error);
        lastError = err;
        const shouldRetry = isRetryableProviderError(err);
        if (!shouldRetry) {
          err.attempts = attempt;
          err.durationMs = Date.now() - requestStartedAt;
          throw err;
        }

        if (attempt < maxAttempts) {
          const baseDelay = Math.pow(2, attempt - 1) * 2000;
          const jitter = Math.floor(Math.random() * 500);
          const delay = Math.min(err.retryAfterMs ?? (baseDelay + jitter), 30000);
          console.warn(`⚠️ API attempt ${attempt} failed [${err.category}]: ${err.message}. Retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.warn(`⚠️ API attempt ${attempt} failed: ${err.message}. Max attempts reached.`);
        }
      }
    }
    if (lastError && typeof lastError === 'object') {
      lastError.attempts = maxAttempts;
      lastError.durationMs = Date.now() - requestStartedAt;
    }
    throw lastError;
  }
}
