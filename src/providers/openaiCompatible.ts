import type { ProviderConfig } from '../types.js';
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider, ToolCall } from './types.js';

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.config.apiKey) {
      throw new Error('FC_API_KEY is not configured. Set it in .fuckcolloge/config.json or via FC_API_KEY.');
    }

    const endpoint = this.config.baseUrl.replace(/\/$/, '');
    const body: any = {
      model: this.config.model,
      temperature: options?.temperature ?? this.config.temperature,
      messages,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    let lastError: any = null;
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(300000), // 300s timeout to allow slow models to generate large content
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenAI-compatible provider request failed: ${response.status} ${response.statusText}\n${text}`);
        }

        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
          error?: unknown;
        };

        const message = json.choices?.[0]?.message;
        if (!message) {
          throw new Error(`Provider returned no message: ${JSON.stringify(json.error ?? json)}`);
        }

        return {
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        };
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt - 1) * 3000; // 3s, 6s, 12s, 24s
          console.warn(`⚠️ API attempt ${attempt} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.warn(`⚠️ API attempt ${attempt} failed: ${err.message}. Max attempts reached.`);
        }
      }
    }
    throw lastError;
  }
}
