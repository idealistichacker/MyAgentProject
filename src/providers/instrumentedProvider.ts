import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from './types.js';

export interface ProviderMetricsSnapshot {
  calls: number;
  retries: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class InstrumentedProvider implements LLMProvider {
  private readonly metrics: ProviderMetricsSnapshot = {
    calls: 0,
    retries: 0,
    durationMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(private readonly provider: LLMProvider) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.provider.chat(messages, options);
      this.metrics.calls++;
      this.metrics.retries += Math.max(0, (response.meta?.attempts ?? 1) - 1);
      this.metrics.durationMs += response.meta?.durationMs ?? (Date.now() - startedAt);
      this.metrics.promptTokens += response.usage?.promptTokens ?? 0;
      this.metrics.completionTokens += response.usage?.completionTokens ?? 0;
      this.metrics.totalTokens += response.usage?.totalTokens ?? 0;
      return response;
    } catch (error) {
      this.metrics.calls++;
      const providerError = error as { attempts?: number; durationMs?: number };
      this.metrics.retries += Math.max(0, (providerError.attempts ?? 1) - 1);
      this.metrics.durationMs += providerError.durationMs ?? (Date.now() - startedAt);
      throw error;
    }
  }

  snapshot(): ProviderMetricsSnapshot {
    return { ...this.metrics };
  }
}
