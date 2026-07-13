export type ProviderErrorCategory =
  | 'configuration'
  | 'authentication'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'provider-5xx'
  | 'invalid-request'
  | 'invalid-response'
  | 'unknown';

export class ProviderRequestError extends Error {
  readonly category: ProviderErrorCategory;
  readonly status?: number;
  readonly retryAfterMs?: number;
  attempts?: number;
  durationMs?: number;

  constructor(
    message: string,
    options: {
      category: ProviderErrorCategory;
      status?: number;
      retryAfterMs?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderRequestError';
    this.category = options.category;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function normalizeProviderError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  const candidate = error as { name?: string; message?: string; code?: string };
  const message = candidate?.message ?? String(error);
  if (candidate?.name === 'TimeoutError' || candidate?.code === 'ETIMEDOUT') {
    return new ProviderRequestError(message, { category: 'timeout', cause: error });
  }
  if (error instanceof TypeError || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(candidate?.code ?? '')) {
    return new ProviderRequestError(message, { category: 'network', cause: error });
  }
  return new ProviderRequestError(message, { category: 'unknown', cause: error });
}

export function categoryForStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'provider-5xx';
  if (status === 408) return 'timeout';
  return 'invalid-request';
}

export function isRetryableProviderError(error: unknown): boolean {
  const category = error instanceof ProviderRequestError
    ? error.category
    : normalizeProviderError(error).category;
  return ['rate-limit', 'timeout', 'network', 'provider-5xx', 'invalid-response'].includes(category);
}
