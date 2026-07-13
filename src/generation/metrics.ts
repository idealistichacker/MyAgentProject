import type { GenerationJob, GenerationStatus } from '../types.js';

export interface GenerationMetricsReport {
  jobs: number;
  completed: number;
  failed: number;
  successRate: number;
  statuses: Partial<Record<GenerationStatus, number>>;
  p50DurationMs: number;
  p95DurationMs: number;
  providerCalls: number;
  providerRetries: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReusedJobs: number;
  critiqueSkippedJobs: number;
}

export function buildGenerationMetricsReport(jobs: GenerationJob[]): GenerationMetricsReport {
  const statuses: Partial<Record<GenerationStatus, number>> = {};
  for (const job of jobs) {
    statuses[job.status] = (statuses[job.status] ?? 0) + 1;
  }
  const durations = jobs
    .map((job) => job.metrics?.totalDurationMs)
    .filter((duration): duration is number => duration !== undefined)
    .sort((left, right) => left - right);
  const completed = jobs.filter((job) => job.status === 'published' || job.status === 'offline').length;
  const failed = jobs.filter((job) => job.status === 'failed').length;

  return {
    jobs: jobs.length,
    completed,
    failed,
    successRate: jobs.length === 0 ? 0 : completed / jobs.length,
    statuses,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    providerCalls: sum(jobs, (job) => job.metrics?.providerCalls ?? 0),
    providerRetries: sum(jobs, (job) => job.metrics?.providerRetries ?? 0),
    promptTokens: sum(jobs, (job) => job.metrics?.promptTokens ?? 0),
    completionTokens: sum(jobs, (job) => job.metrics?.completionTokens ?? 0),
    totalTokens: sum(jobs, (job) => job.metrics?.totalTokens ?? 0),
    cacheReusedJobs: jobs.filter((job) => job.metrics?.cacheReuse).length,
    critiqueSkippedJobs: jobs.filter((job) =>
      job.checkpoints?.some((checkpoint) => checkpoint.stage === 'critique' && checkpoint.outcome === 'skipped')
    ).length,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] ?? 0;
}

function sum(jobs: GenerationJob[], selector: (job: GenerationJob) => number): number {
  return jobs.reduce((total, job) => total + selector(job), 0);
}
