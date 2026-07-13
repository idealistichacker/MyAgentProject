import { isRetryableProviderError } from '../providers/errors.js';

export interface GenerationSchedulerOptions {
  concurrency: number;
  minStartIntervalMs: number;
  requestsPerMinute?: number;
  transientFailureThreshold?: number;
  circuitCooldownMs?: number;
}

export interface GenerationScheduleMetric {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

interface QueuedTask<T> {
  id: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export class GenerationScheduler {
  private readonly queue: QueuedTask<unknown>[] = [];
  private readonly metrics = new Map<string, GenerationScheduleMetric>();
  private activeCount = 0;
  private nextStartAt = 0;
  private consecutiveTransientFailures = 0;
  private circuitOpenedAt?: number;

  constructor(private readonly options: GenerationSchedulerOptions) {}

  schedule<T>(id: string, task: () => Promise<T>): Promise<T> {
    if (this.isCircuitOpen()) {
      return Promise.reject(new GenerationCircuitOpenError());
    }
    if (this.metrics.has(id)) {
      throw new Error(`A generation task with id "${id}" is already scheduled.`);
    }
    this.metrics.set(id, { id, status: 'queued', queuedAt: Date.now() });
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({ id, task, resolve, reject } as QueuedTask<unknown>);
    });
    this.pump();
    return promise;
  }

  snapshot(): { metrics: GenerationScheduleMetric[]; p50Ms: number; p95Ms: number; circuitOpen: boolean } {
    const metrics = [...this.metrics.values()].map((metric) => ({ ...metric }));
    const durations = metrics
      .map((metric) => metric.durationMs)
      .filter((duration): duration is number => duration !== undefined)
      .sort((left, right) => left - right);
    return {
      metrics,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      circuitOpen: this.isCircuitOpen(),
    };
  }

  cancelPending(reason = 'Generation queue cancelled.'): void {
    const error = new Error(reason);
    for (const queued of this.queue.splice(0)) {
      const metric = this.metrics.get(queued.id);
      if (metric) {
        metric.status = 'failed';
        metric.completedAt = Date.now();
        metric.error = reason;
      }
      queued.reject(error);
    }
  }

  private pump(): void {
    while (this.activeCount < this.options.concurrency && this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) return;
      this.activeCount++;
      void this.run(queued);
    }
  }

  private async run(queued: QueuedTask<unknown>): Promise<void> {
    const metric = this.metrics.get(queued.id);
    const now = Date.now();
    const startAt = Math.max(now, this.nextStartAt);
    this.nextStartAt = startAt + this.effectiveStartIntervalMs();
    const delay = startAt - now;
    if (delay > 0) {
      await sleep(delay);
    }

    if (metric) {
      metric.status = 'running';
      metric.startedAt = Date.now();
    }

    try {
      const result = await queued.task();
      if (metric) {
        metric.status = 'succeeded';
        metric.completedAt = Date.now();
        metric.durationMs = metric.completedAt - (metric.startedAt ?? metric.completedAt);
      }
      this.consecutiveTransientFailures = 0;
      queued.resolve(result);
    } catch (error) {
      if (metric) {
        metric.status = 'failed';
        metric.completedAt = Date.now();
        metric.durationMs = metric.completedAt - (metric.startedAt ?? metric.completedAt);
        metric.error = error instanceof Error ? error.message : String(error);
      }
      if (isRetryableProviderError(error)) {
        this.consecutiveTransientFailures++;
        if (this.consecutiveTransientFailures >= (this.options.transientFailureThreshold ?? 3)) {
          this.circuitOpenedAt = Date.now();
          this.cancelPending('Generation circuit opened after repeated transient provider failures.');
        }
      } else {
        this.consecutiveTransientFailures = 0;
      }
      queued.reject(error);
    } finally {
      this.activeCount--;
      this.pump();
    }
  }

  private effectiveStartIntervalMs(): number {
    const requestsPerMinute = this.options.requestsPerMinute;
    const rateInterval = requestsPerMinute && requestsPerMinute > 0
      ? Math.ceil(60_000 / requestsPerMinute)
      : 0;
    return Math.max(this.options.minStartIntervalMs, rateInterval);
  }

  private isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === undefined) return false;
    if (Date.now() - this.circuitOpenedAt >= (this.options.circuitCooldownMs ?? 30_000)) {
      this.circuitOpenedAt = undefined;
      this.consecutiveTransientFailures = 0;
      return false;
    }
    return true;
  }
}

export class GenerationCircuitOpenError extends Error {
  constructor() {
    super('Generation circuit is open after repeated transient provider failures.');
    this.name = 'GenerationCircuitOpenError';
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] ?? 0;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
