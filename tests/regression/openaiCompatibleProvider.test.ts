import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleProvider } from '../../src/providers/openaiCompatible.js';
import type { ProviderConfig } from '../../src/types.js';

test('maps bounded non-thinking requests for SiliconFlow', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  let calls = 0;

  globalThis.fetch = async (_input, init) => {
    calls += 1;
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const provider = new OpenAICompatibleProvider(config('https://api.siliconflow.cn/v1'));
    await provider.chat([{ role: 'user', content: 'format this artifact' }], {
      maxTokens: 12_000,
      maxAttempts: 2,
      thinkingMode: 'disabled',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 1);
  assert.equal(requestBody?.max_tokens, 12_000);
  assert.equal(requestBody?.enable_thinking, false);
});

test('does not send SiliconFlow thinking controls to other compatible providers', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const provider = new OpenAICompatibleProvider(config('https://example.com/v1'));
    await provider.chat([{ role: 'user', content: 'format this artifact' }], {
      thinkingMode: 'disabled',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal('enable_thinking' in (requestBody ?? {}), false);
});

function config(baseUrl: string): ProviderConfig {
  return {
    provider: 'openai-compatible',
    apiKey: 'test-key',
    baseUrl,
    model: 'test-model',
    temperature: 0.2,
    searchProvider: 'wikipedia',
  };
}
