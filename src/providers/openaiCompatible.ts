import type { ProviderConfig } from '../types.js';
import type { ChatMessage, ChatOptions, LLMProvider } from './types.js';

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('FC_API_KEY is not configured. Set it in .fuckcolloge/config.json or via FC_API_KEY.');
    }

    const endpoint = this.config.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: options?.temperature ?? this.config.temperature,
        messages,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI-compatible provider request failed: ${response.status} ${response.statusText}\n${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: unknown;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Provider returned no message content: ${JSON.stringify(json.error ?? json)}`);
    }

    return content;
  }
}
