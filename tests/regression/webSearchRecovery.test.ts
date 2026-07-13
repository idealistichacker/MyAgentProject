import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSearchTool } from '../../src/agents/tools.js';

class MemoryCache {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, data: T): Promise<void> {
    this.values.set(key, data);
  }

  async getOrSet<T>(key: string, producer: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const existing = await this.get<T>(key);
    if (existing !== null) return { value: existing, hit: true };
    const value = await producer();
    await this.set(key, value);
    return { value, hit: false };
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test('falls back to a validated stale source pack after a provider outage', async () => {
  const cache = new MemoryCache();
  let providerAvailable = true;
  const fetchImplementation: typeof fetch = async () => {
    if (!providerAvailable) throw new Error('simulated provider outage');
    return new Response(JSON.stringify({
      query: {
        search: [{
          title: 'Recursion',
          snippet: 'Recursion solves a problem through smaller instances and requires a well-defined base case.',
        }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const search = new WebSearchTool('wikipedia', undefined, { cache, fetch: fetchImplementation });

  const fresh = await search.searchSources('recursion base case');
  providerAvailable = false;
  for (const key of cache.values.keys()) {
    if (key.startsWith('source-pack:v2:')) cache.values.delete(key);
  }
  const recovered = await search.searchSources('recursion base case');

  assert.equal(recovered[0]?.url, fresh[0]?.url);
  assert.equal(recovered[0]?.hash, fresh[0]?.hash);
  assert.equal(recovered[0]?.trust, 'background');
  assert.equal(recovered[0]?.freshness, 'stale');
});
