import crypto from 'node:crypto';
import { sourceSchema, type Source } from '../types.js';

const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source']);
const PRIMARY_HOSTS = new Set([
  'developer.mozilla.org', 'docs.python.org', 'nodejs.org', 'typescriptlang.org',
  'www.typescriptlang.org', 'doc.rust-lang.org', 'go.dev', 'openjdk.org',
  'www.openjdk.org', 'tc39.es', 'w3.org', 'www.w3.org', 'ietf.org',
  'www.ietf.org', 'rfc-editor.org', 'www.rfc-editor.org',
]);

export function normalizeSourcePack(values: unknown, query: string, maximumSources = 3): Source[] {
  if (!Array.isArray(values)) return [];
  const normalized = values.flatMap((value) => {
    const parsed = sourceSchema.safeParse(value);
    if (!parsed.success) return [];
    const url = canonicalizeUrl(parsed.data.url);
    const excerpt = sanitizeSourceExcerpt(parsed.data.excerpt);
    const title = sanitizeText(parsed.data.title, 240);
    if (!url || excerpt.length < 40 || !title) return [];
    const source: Source = {
      ...parsed.data,
      url,
      title,
      publisher: publisherFromUrl(url),
      trust: classifySourceTrust(url),
      freshness: parsed.data.freshness ?? 'fresh',
      excerpt,
      hash: crypto.createHash('sha256').update(`${url}\n${excerpt}`).digest('hex'),
    };
    return [{ source, score: scoreSource(source, query) }];
  });

  const byUrl = new Map<string, { source: Source; score: number }>();
  for (const candidate of normalized) {
    const existing = byUrl.get(candidate.source.url);
    if (!existing || candidate.score > existing.score) byUrl.set(candidate.source.url, candidate);
  }
  return [...byUrl.values()]
    .sort((left, right) => right.score - left.score || left.source.url.localeCompare(right.source.url))
    .slice(0, maximumSources)
    .map(({ source }, index) => ({ ...source, id: `src-${index + 1}` }));
}

export function sanitizeSourceExcerpt(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|system|assistant|developer)\s+(?:instructions?|messages?|prompts?)[^.\n]*/gi, '[removed untrusted instruction]')
    .replace(/(?:system|assistant|developer)\s*:\s*[^.\n]*/gi, '[removed role-like instruction]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

export function classifySourceTrust(url: string): Source['trust'] {
  const hostname = hostnameFromUrl(url);
  if (hostname === 'wikipedia.org' || hostname.endsWith('.wikipedia.org')) return 'background';
  if (PRIMARY_HOSTS.has(hostname) || hostname.startsWith('docs.') || hostname.endsWith('.gov') || hostname.endsWith('.edu')) {
    return 'primary';
  }
  return 'secondary';
}

function scoreSource(source: Source, query: string): number {
  const trustScore = source.trust === 'primary' ? 40 : source.trust === 'secondary' ? 25 : 15;
  const queryTokens = tokenize(query);
  const searchable = `${source.title} ${source.excerpt}`.toLowerCase();
  const matchedTokens = queryTokens.filter((token) => searchable.includes(token)).length;
  const relevanceScore = queryTokens.length === 0 ? 0 : Math.round((matchedTokens / queryTokens.length) * 40);
  return trustScore + relevanceScore + Math.min(20, Math.floor(source.excerpt.length / 90));
}

function tokenize(value: string): string[] {
  const normalized = value.toLowerCase();
  const tokens = new Set(normalized.match(/[a-z0-9][a-z0-9+#.-]{1,}|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const sequence of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    for (let index = 0; index < sequence.length - 1; index += 1) tokens.add(sequence.slice(index, index + 2));
  }
  return [...tokens];
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return '';
  }
}

function publisherFromUrl(value: string): string {
  return hostnameFromUrl(value).replace(/^www\./, '') || 'unknown publisher';
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function sanitizeText(value: string, maximumLength: number): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximumLength);
}
