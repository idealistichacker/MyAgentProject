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
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180000), // 180s timeout to allow slow models to generate large content
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
        console.warn(`⚠️ API attempt ${attempt} failed: ${err.message}. ${attempt < 3 ? 'Retrying in 1.5s...' : ''}`);
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
    throw lastError;
  }
}
