import { OpenAICompatibleProvider } from './openaiCompatible.js';
import type { ProviderConfig } from '../types.js';

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: ChatMessageRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface ChatOptions {
  temperature?: number;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleProvider(config);
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
