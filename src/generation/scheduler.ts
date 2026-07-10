export interface GenerationSchedulerOptions {
  concurrency: number;
  minStartIntervalMs: number;
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

  constructor(private readonly options: GenerationSchedulerOptions) {}

  schedule<T>(id: string, task: () => Promise<T>): Promise<T> {
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

  snapshot(): { metrics: GenerationScheduleMetric[]; p50Ms: number; p95Ms: number } {
    const metrics = [...this.metrics.values()].map((metric) => ({ ...metric }));
    const durations = metrics
      .map((metric) => metric.durationMs)
      .filter((duration): duration is number => duration !== undefined)
      .sort((left, right) => left - right);
    return {
      metrics,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
    };
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
    this.nextStartAt = startAt + this.options.minStartIntervalMs;
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
      queued.resolve(result);
    } catch (error) {
      if (metric) {
        metric.status = 'failed';
        metric.completedAt = Date.now();
        metric.durationMs = metric.completedAt - (metric.startedAt ?? metric.completedAt);
        metric.error = error instanceof Error ? error.message : String(error);
      }
      queued.reject(error);
    } finally {
      this.activeCount--;
      this.pump();
    }
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] ?? 0;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
