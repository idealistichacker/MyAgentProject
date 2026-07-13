import assert from 'node:assert/strict';
import test from 'node:test';
import { GenerationScheduler } from '../../src/generation/scheduler.js';
import { ProviderRequestError } from '../../src/providers/errors.js';

test('opens the circuit and cancels queued tasks after repeated transient failures', async () => {
  const scheduler = new GenerationScheduler({
    concurrency: 1,
    minStartIntervalMs: 0,
    transientFailureThreshold: 2,
    circuitCooldownMs: 60_000,
  });
  let calls = 0;
  const failingTask = async () => {
    calls++;
    throw new ProviderRequestError('temporary outage', { category: 'provider-5xx', status: 503 });
  };

  const results = await Promise.allSettled([
    scheduler.schedule('one', failingTask),
    scheduler.schedule('two', failingTask),
    scheduler.schedule('three', failingTask),
    scheduler.schedule('four', failingTask),
  ]);

  assert.equal(calls, 2);
  assert.equal(results.every((result) => result.status === 'rejected'), true);
  assert.equal(scheduler.snapshot().circuitOpen, true);
});

test('does not open the circuit for permanent validation failures', async () => {
  const scheduler = new GenerationScheduler({
    concurrency: 1,
    minStartIntervalMs: 0,
    transientFailureThreshold: 1,
  });
  await assert.rejects(() => scheduler.schedule('invalid', async () => {
    throw new Error('quality validation failed');
  }));
  assert.equal(scheduler.snapshot().circuitOpen, false);
});
