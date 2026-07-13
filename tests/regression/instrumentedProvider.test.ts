import assert from 'node:assert/strict';
import test from 'node:test';
import { InstrumentedProvider } from '../../src/providers/instrumentedProvider.js';
import type { LLMProvider } from '../../src/providers/types.js';

test('aggregates provider usage and retries across calls', async () => {
  const provider: LLMProvider = {
    async chat() {
      return {
        content: 'ok',
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        meta: { attempts: 2, durationMs: 25 },
      };
    },
  };
  const instrumented = new InstrumentedProvider(provider);
  await instrumented.chat([{ role: 'user', content: 'first' }]);
  await instrumented.chat([{ role: 'user', content: 'second' }]);

  assert.deepEqual(instrumented.snapshot(), {
    calls: 2,
    retries: 2,
    durationMs: 50,
    promptTokens: 24,
    completionTokens: 16,
    totalTokens: 40,
  });
});

test('records retry metadata from a failed provider call', async () => {
  const provider: LLMProvider = {
    async chat() {
      throw Object.assign(new Error('provider unavailable'), { attempts: 3, durationMs: 75 });
    },
  };
  const instrumented = new InstrumentedProvider(provider);
  await assert.rejects(() => instrumented.chat([{ role: 'user', content: 'fail' }]));
  assert.equal(instrumented.snapshot().calls, 1);
  assert.equal(instrumented.snapshot().retries, 2);
  assert.equal(instrumented.snapshot().durationMs, 75);
});
