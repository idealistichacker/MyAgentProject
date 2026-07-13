import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';
import { generateAndPublishUnit, recordGenerationCheckpoint } from '../../src/generation/orchestrator.js';
import { createGenerationJob } from '../../src/generation/publisher.js';
import { ensureProjectDirs } from '../../src/state/fsState.js';
import { replacePlan } from '../../src/state/planStore.js';
import type { GenerationCheckpoint, LearningPlan } from '../../src/types.js';

const timestamp = '2026-07-13T00:00:00.000Z';
const draftCheckpoint: GenerationCheckpoint = {
  stage: 'draft',
  cacheKeyHash: 'draft-cache-hash',
  completedAt: timestamp,
  cacheHit: false,
};

test('links retry jobs and carries completed checkpoints forward', () => {
  const parent = {
    ...createGenerationJob('unit-1', 'input-hash'),
    status: 'failed' as const,
    checkpoints: [draftCheckpoint],
  };
  const child = createGenerationJob('unit-1', 'input-hash', parent);
  const withFinal = recordGenerationCheckpoint(child, {
    stage: 'final',
    cacheKeyHash: 'final-cache-hash',
    completedAt: timestamp,
    cacheHit: true,
  });

  assert.equal(child.parentJobId, parent.id);
  assert.equal(child.attempt, 2);
  assert.deepEqual(withFinal.checkpoints.map((checkpoint) => checkpoint.stage), ['draft', 'final']);
});

test('refuses to resume checkpoints after generation inputs change', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-generation-recovery-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const unit = structuredClone(SEED_CURRICULUM[0]);
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    replacePlan(plan);
    const staleJob = {
      ...createGenerationJob(unit.id, 'stale-input-hash'),
      status: 'failed' as const,
      checkpoints: [draftCheckpoint],
    };

    await assert.rejects(
      () => generateAndPublishUnit(unit.id, { resumeFromJob: staleJob }),
      /generation input has changed/
    );
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
