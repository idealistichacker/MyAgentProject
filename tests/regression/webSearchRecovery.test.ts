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
    if (key.startsWith('source-pack:v4:')) cache.values.delete(key);
  }
  const recovered = await search.searchSources('recursion base case');

  assert.equal(recovered[0]?.url, fresh[0]?.url);
  assert.equal(recovered[0]?.hash, fresh[0]?.hash);
  assert.equal(recovered[0]?.trust, 'background');
  assert.equal(recovered[0]?.freshness, 'stale');
});

test('supplements a secondary-only Tavily result with official documentation', async () => {
  const cache = new MemoryCache();
  const requestedBodies: Array<Record<string, unknown>> = [];
  const fetchImplementation: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requestedBodies.push(body);
    const official = Array.isArray(body.include_domains);
    return new Response(JSON.stringify({
      results: official
        ? [{
            url: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',
            title: 'What Is Ownership?',
            content: 'Ownership is a set of rules that govern how a Rust program manages memory.',
          }]
        : [{
            url: 'https://example.com/rust-ownership',
            title: 'Rust ownership tutorial',
            content: 'A community tutorial explaining ownership, moves, borrowing, and scope.',
          }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const search = new WebSearchTool('tavily', 'test-key', { cache, fetch: fetchImplementation });

  const sources = await search.searchSources('Rust ownership rules and move semantics');

  assert.equal(requestedBodies.length, 2);
  assert.deepEqual(requestedBodies[1]?.include_domains, ['doc.rust-lang.org']);
  assert.equal(sources[0]?.publisher, 'doc.rust-lang.org');
  assert.equal(sources[0]?.trust, 'primary');
});

test('retries transient Tavily network failures before failing source retrieval', async () => {
  const cache = new MemoryCache();
  let attempts = 0;
  const fetchImplementation: typeof fetch = async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({
      results: [{
        url: 'https://doc.rust-lang.org/book/',
        title: 'The Rust Programming Language',
        content: 'Official Rust documentation explains how structs define named fields and how impl blocks add associated functions and methods.',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const search = new WebSearchTool('tavily', 'test-key', { cache, fetch: fetchImplementation });

  const sources = await search.searchSources('Rust structs and impl blocks');

  assert.equal(attempts, 3);
  assert.equal(sources[0]?.trust, 'primary');
});
