import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';
import {
  createGenerationJob,
  createPassedQualityReport,
  loadArtifactManifest,
  publishUnitArtifacts,
} from '../../src/generation/publisher.js';
import { ensureProjectDirs, savePlan, writeTextFile } from '../../src/state/fsState.js';
import type { LearningPlan, SeedUnit } from '../../src/types.js';
import { getSolutionPath } from '../../src/utils/paths.js';

test('publishing preserves existing learner solutions and writes a manifest', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-publisher-test-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    const unit = structuredClone(SEED_CURRICULUM[0]) as SeedUnit;
    const timestamp = new Date().toISOString();
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, createdAt: timestamp, updatedAt: timestamp,
    };
    ensureProjectDirs();
    savePlan(plan);
    const solutionPath = getSolutionPath(unit.id, '.ts');
    writeTextFile(solutionPath, 'export const learnerAnswer = true;\n');

    const job = createGenerationJob(unit.id, 'input-hash');
    const artifacts = publishUnitArtifacts(unit, {
      inputHash: 'input-hash',
      job,
      status: 'offline',
      qualityReport: createPassedQualityReport(['fixture']),
    });

    assert.equal(await fs.readFile(solutionPath, 'utf8'), 'export const learnerAnswer = true;\n');
    assert.equal(artifacts.solutionPreserved, true);
    assert.equal(loadArtifactManifest(unit.id)?.status, 'offline');
    assert.equal(await fs.stat(artifacts.starterPath ?? '').then(() => true), true);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
