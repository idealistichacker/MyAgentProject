import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CacheManager, createCacheKey } from '../../src/utils/cache.js';

test('coalesces identical cache misses into one producer call', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-cache-test-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    const cache = new CacheManager('test');
    let producerCalls = 0;
    const key = createCacheKey('unit', { model: 'example', input: { title: 'same' } });
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      cache.getOrSet(key, async () => {
        producerCalls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 'generated' };
      })
    ));

    assert.equal(producerCalls, 1);
    assert.deepEqual(results.map((result) => result.value), Array(8).fill({ value: 'generated' }));
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
