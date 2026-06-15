import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CacheOptions {
  ttlMs?: number; // Time to live in milliseconds
}

export class CacheManager {
  private memoryCache: Map<string, { data: any; expiry: number }> = new Map();
  private cacheDir: string;
  private defaultTtlMs: number;

  constructor(namespace = 'default', defaultTtlMs = 24 * 60 * 60 * 1000) {
    this.cacheDir = path.join(process.cwd(), '.fuckcolloge', 'cache', namespace);
    this.defaultTtlMs = defaultTtlMs;
  }

  private async ensureDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  private getHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private getFilePath(keyHash: string): string {
    return path.join(this.cacheDir, `${keyHash}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    const keyHash = this.getHash(key);
    
    // 1. Check L1 Memory Cache
    const memEntry = this.memoryCache.get(keyHash);
    if (memEntry) {
      if (Date.now() < memEntry.expiry) {
        return memEntry.data as T;
      } else {
        this.memoryCache.delete(keyHash); // Expired
      }
    }

    // 2. Check L2 Disk Cache
    const filePath = this.getFilePath(keyHash);
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      
      if (Date.now() < parsed.expiry) {
        // Restore to L1
        this.memoryCache.set(keyHash, { data: parsed.data, expiry: parsed.expiry });
        return parsed.data as T;
      } else {
        // Expired, delete file
        await fs.unlink(filePath).catch(() => {});
      }
    } catch (err: any) {
      // File not found or invalid JSON
    }
    
    return null;
  }

  async set<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    const keyHash = this.getHash(key);
    const expiry = Date.now() + (options?.ttlMs ?? this.defaultTtlMs);

    // 1. Update L1 Memory Cache
    this.memoryCache.set(keyHash, { data, expiry });

    // 2. Update L2 Disk Cache
    await this.ensureDir();
    const filePath = this.getFilePath(keyHash);
    await fs.writeFile(
      filePath,
      JSON.stringify({ data, expiry }, null, 2),
      'utf-8'
    );
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore if doesn't exist
    }
  }
}

export const searchCache = new CacheManager('search');
export const llmCache = new CacheManager('llm');
