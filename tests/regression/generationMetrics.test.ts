import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationMetricsReport } from '../../src/generation/metrics.js';
import type { GenerationJob } from '../../src/types.js';

const timestamp = '2026-07-13T00:00:00.000Z';

function job(id: string, status: GenerationJob['status'], durationMs: number): GenerationJob {
  return {
    id,
    unitId: id,
    status,
    stage: 'completed',
    attempt: 1,
    inputHash: id,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    checkpoints: id === 'cached' ? [{
      stage: 'critique',
      cacheKeyHash: 'skip-key',
      completedAt: timestamp,
      cacheHit: true,
      outcome: 'skipped',
      qualityScore: 90,
    }] : [],
    metrics: {
      totalDurationMs: durationMs,
      stages: { generation: durationMs - 10, publication: 10 },
      providerCalls: 3,
      providerRetries: 1,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      sourceCount: 2,
      cacheReuse: id === 'cached',
    },
  };
}

test('aggregates durable generation metrics and percentiles', () => {
  const report = buildGenerationMetricsReport([
    job('fast', 'published', 100),
    job('cached', 'published', 200),
    job('failed', 'failed', 400),
  ]);

  assert.equal(report.jobs, 3);
  assert.equal(report.completed, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.p50DurationMs, 200);
  assert.equal(report.p95DurationMs, 400);
  assert.equal(report.totalTokens, 450);
  assert.equal(report.providerRetries, 3);
  assert.equal(report.cacheReusedJobs, 1);
  assert.equal(report.critiqueSkippedJobs, 1);
});
