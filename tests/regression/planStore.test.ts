import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';
import { ensureProjectDirs, loadPlan } from '../../src/state/fsState.js';
import { PlanConflictError, replacePlan, updatePlan } from '../../src/state/planStore.js';
import type { LearningPlan } from '../../src/types.js';

test('rejects stale plan revisions without overwriting the latest plan', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-plan-store-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const timestamp = new Date().toISOString();
    const initial: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: structuredClone(SEED_CURRICULUM.slice(0, 2)),
      currentIndex: 0,
      revision: 0,
      origin: 'offline',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const stored = replacePlan(initial);
    const updated = updatePlan(stored.revision, (draft) => {
      draft.currentIndex = 1;
    });

    assert.equal(updated.revision, stored.revision + 1);
    assert.throws(
      () => updatePlan(stored.revision, (draft) => { draft.currentIndex = 0; }),
      PlanConflictError
    );
    assert.equal(loadPlan()?.currentIndex, 1);
    assert.equal(loadPlan()?.revision, updated.revision);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
