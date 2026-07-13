import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CacheOptions {
  ttlMs?: number;
}

interface CacheEntry<T> {
  version: 1;
  createdAt: number;
  expiry: number;
  data: T;
}

export class CacheManager {
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly cacheDir: string;
  private readonly defaultTtlMs: number;
  private readonly maxMemoryEntries: number;

  constructor(
    namespace = 'default',
    defaultTtlMs = 24 * 60 * 60 * 1000,
    maxMemoryEntries = 200
  ) {
    this.cacheDir = path.join(process.cwd(), '.fuckcolloge', 'cache', namespace);
    this.defaultTtlMs = defaultTtlMs;
    this.maxMemoryEntries = maxMemoryEntries;
  }

  async get<T>(key: string): Promise<T | null> {
    const keyHash = this.getHash(key);
    const memoryEntry = this.memoryCache.get(keyHash);
    if (memoryEntry) {
      if (Date.now() < memoryEntry.expiry) {
        this.touchMemory(keyHash, memoryEntry);
        return memoryEntry.data as T;
      }
      this.memoryCache.delete(keyHash);
    }

    const filePath = this.getFilePath(keyHash);
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as CacheEntry<T>;
      if (!isValidEntry(parsed)) {
        await this.quarantine(filePath);
        return null;
      }
      if (Date.now() >= parsed.expiry) {
        await fs.unlink(filePath).catch(() => undefined);
        return null;
      }
      this.touchMemory(keyHash, parsed);
      return parsed.data;
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        await this.quarantine(filePath);
      }
      return null;
    }
  }

  async set<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    const keyHash = this.getHash(key);
    const entry: CacheEntry<T> = {
      version: 1,
      createdAt: Date.now(),
      expiry: Date.now() + (options?.ttlMs ?? this.defaultTtlMs),
      data,
    };
    this.touchMemory(keyHash, entry);
    await fs.mkdir(this.cacheDir, { recursive: true });
    await writeAtomic(this.getFilePath(keyHash), JSON.stringify(entry, null, 2));
  }

  async getOrSet<T>(
    key: string,
    producer: () => Promise<T>,
    options?: CacheOptions
  ): Promise<{ value: T; hit: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return { value: cached, hit: true };
    }

    const keyHash = this.getHash(key);
    const existing = this.inFlight.get(keyHash) as Promise<T> | undefined;
    if (existing) {
      return { value: await existing, hit: true };
    }

    const request = (async () => {
      const latest = await this.get<T>(key);
      if (latest !== null) {
        return latest;
      }
      const value = await producer();
      await this.set(key, value, options);
      return value;
    })();
    this.inFlight.set(keyHash, request);
    try {
      return { value: await request, hit: false };
    } finally {
      this.inFlight.delete(keyHash);
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.inFlight.clear();
    await fs.rm(this.cacheDir, { recursive: true, force: true });
  }

  async delete(key: string): Promise<void> {
    const keyHash = this.getHash(key);
    this.memoryCache.delete(keyHash);
    await fs.unlink(this.getFilePath(keyHash)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private touchMemory(keyHash: string, entry: CacheEntry<unknown>): void {
    this.memoryCache.delete(keyHash);
    this.memoryCache.set(keyHash, entry);
    while (this.memoryCache.size > this.maxMemoryEntries) {
      const oldest = this.memoryCache.keys().next().value;
      if (!oldest) break;
      this.memoryCache.delete(oldest);
    }
  }

  private getHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private getFilePath(keyHash: string): string {
    return path.join(this.cacheDir, `${keyHash}.json`);
  }

  private async quarantine(filePath: string): Promise<void> {
    if (!(await fileExists(filePath))) return;
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    await fs.rename(filePath, corruptPath).catch(() => undefined);
  }
}

export function createCacheKey(kind: string, input: unknown): string {
  return `${kind}:v1:${stableStringify(input)}`;
}

export function hashCacheKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  const handle = await fs.open(tempPath, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isValidEntry(value: unknown): value is CacheEntry<unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as CacheEntry<unknown>).version === 1 &&
    typeof (value as CacheEntry<unknown>).createdAt === 'number' &&
    typeof (value as CacheEntry<unknown>).expiry === 'number' &&
    'data' in value
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const searchCache = new CacheManager('search');
export const llmCache = new CacheManager('llm');
