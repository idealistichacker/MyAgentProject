import { OpenAICompatibleProvider } from './openaiCompatible.js';
import type { ProviderConfig } from '../types.js';

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatOptions {
  temperature?: number;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleProvider(config);
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
