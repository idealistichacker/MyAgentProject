import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';
import { generateAndPublishUnit } from '../../src/generation/orchestrator.js';
import {
  createGenerationJob,
  createPassedQualityReport,
  inspectInterruptedPublications,
  loadArtifactManifest,
  loadGenerationJob,
  publishUnitArtifacts,
  recoverInterruptedPublications,
  saveArtifactManifest,
  saveGenerationJob,
  writePreviewUnitArtifacts,
} from '../../src/generation/publisher.js';
import { ensureProjectDirs, loadPlan, writeTextFile } from '../../src/state/fsState.js';
import { preparePlanUpdate, replacePlan } from '../../src/state/planStore.js';
import { artifactManifestSchema, type LearningPlan, type SeedUnit } from '../../src/types.js';
import { getFcDir, getLessonPath, getPlanPath, getPublicationRecoveryDir, getRecoveryDir, getSolutionPath } from '../../src/utils/paths.js';

test('content preview stays isolated from plans, manifests, and learner solutions', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-preview-test-'));
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
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    ensureProjectDirs();
    const storedPlan = replacePlan(plan);
    const solutionPath = getSolutionPath(unit.id, '.ts', unit.title);
    writeTextFile(solutionPath, 'export const learnerAnswer = true;\n');

    const artifacts = writePreviewUnitArtifacts(unit);

    assert.match(artifacts.lessonPath, /[\\/]previews[\\/]/);
    assert.match(artifacts.artifactPath, /[\\/]previews[\\/]/);
    assert.equal(await fs.readFile(solutionPath, 'utf8'), 'export const learnerAnswer = true;\n');
    assert.equal(loadArtifactManifest(unit.id), undefined);
    assert.deepEqual(loadPlan(), storedPlan);
    assert.equal(JSON.parse(await fs.readFile(artifacts.artifactPath, 'utf8')).id, unit.id);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('content-only orchestration previews offline units instead of formally publishing them', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-offline-preview-test-'));
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
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    ensureProjectDirs();
    const storedPlan = replacePlan(plan);

    const result = await generateAndPublishUnit(unit.id, { contentOnly: true });

    assert.equal(result.job.status, 'preview');
    assert.equal(result.job.validationMode, 'content-only');
    assert.ok('artifactPath' in result.artifacts);
    assert.equal(loadArtifactManifest(unit.id), undefined);
    assert.deepEqual(loadPlan(), storedPlan);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('publishing preserves existing learner solutions and writes a manifest', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-publisher-test-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    const unit = structuredClone(SEED_CURRICULUM[0]) as SeedUnit;
    const timestamp = new Date().toISOString();
    unit.sources = [{
      id: 'src-1',
      url: 'https://docs.python.org/3/',
      title: 'Python documentation',
      publisher: 'docs.python.org',
      retrievedAt: timestamp,
      hash: 'source-hash',
      trust: 'primary',
      freshness: 'fresh',
      excerpt: 'Official Python documentation used as a publication traceability fixture.',
    }];
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    ensureProjectDirs();
    replacePlan(plan);
    const solutionPath = getSolutionPath(unit.id, '.ts', unit.title);
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
    const manifest = loadArtifactManifest(unit.id);
    assert.equal(manifest?.status, 'offline');
    assert.equal(manifest?.sourcePolicyVersion, 'source-pack-v2');
    assert.deepEqual(manifest?.sources.map((source) => source.hash), ['source-hash']);
    assert.equal(await fs.stat(artifacts.starterPath ?? '').then(() => true), true);
    assert.deepEqual(await fs.readdir(getRecoveryDir()), []);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('reads manifests created before source traceability fields existed', () => {
  const timestamp = new Date().toISOString();
  const manifest = artifactManifestSchema.parse({
    schemaVersion: 1,
    unitId: 'legacy-unit',
    status: 'published',
    inputHash: 'legacy-input',
    updatedAt: timestamp,
    files: [],
  });

  assert.deepEqual(manifest.sources, []);
  assert.equal(manifest.sourcePolicyVersion, undefined);
});

test('rolls back files and plan from an interrupted publication journal', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-publisher-recovery-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const unit = structuredClone(SEED_CURRICULUM[0]) as SeedUnit;
    const timestamp = new Date().toISOString();
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    const storedPlan = replacePlan(plan);
    const lessonPath = getLessonPath(unit.id);
    writeTextFile(lessonPath, 'old lesson\n');

    const transactionId = 'recovery-fixture';
    const recoveryDir = getPublicationRecoveryDir(transactionId);
    await fs.mkdir(recoveryDir, { recursive: true });
    const planBackupPath = path.join(recoveryDir, 'plan.bak');
    const lessonBackupPath = path.join(recoveryDir, 'lesson.bak');
    const oldPlanContent = await fs.readFile(getPlanPath(), 'utf8');
    const targetPlan = preparePlanUpdate(storedPlan, (draft) => {
      draft.units[0].title = 'partially published title';
    }, timestamp);
    const targetPlanContent = `${JSON.stringify(targetPlan, null, 2)}\n`;
    writeTextFile(planBackupPath, oldPlanContent);
    writeTextFile(lessonBackupPath, 'old lesson\n');

    writeTextFile(lessonPath, 'partially published lesson\n');
    const job = { ...createGenerationJob(unit.id, 'input-hash'), status: 'publishing' as const, stage: 'publishing' };
    saveGenerationJob(job);
    saveArtifactManifest(artifactManifestSchema.parse({
      schemaVersion: 1,
      unitId: unit.id,
      jobId: job.id,
      status: 'publishing',
      targetStatus: 'published',
      inputHash: 'input-hash',
      updatedAt: timestamp,
      recovery: {
        transactionId,
        createdAt: timestamp,
        basePlanRevision: storedPlan.revision,
        targetPlanRevision: targetPlan.revision,
        files: [
          {
            path: path.relative(getFcDir(), getPlanPath()), existed: true,
            backupPath: path.relative(getFcDir(), planBackupPath), backupHash: hash(oldPlanContent), expectedHash: hash(targetPlanContent),
          },
          {
            path: path.relative(getFcDir(), lessonPath), existed: true,
            backupPath: path.relative(getFcDir(), lessonBackupPath), backupHash: hash('old lesson\n'), expectedHash: hash('partially published lesson\n'),
          },
        ],
      },
      files: [{ path: path.relative(getFcDir(), lessonPath), hash: hash('partially published lesson\n'), role: 'lesson', protected: false }],
    }));

    assert.deepEqual(inspectInterruptedPublications().map((item) => item.state), ['safe-to-rollback']);
    const results = recoverInterruptedPublications();

    assert.deepEqual(results.map((result) => result.action), ['rolled-back']);
    assert.equal(await fs.readFile(lessonPath, 'utf8'), 'old lesson\n');
    assert.equal(loadPlan()?.units[0].title, unit.title);
    assert.equal(loadArtifactManifest(unit.id)?.status, 'failed');
    assert.equal(loadArtifactManifest(unit.id)?.recovery, undefined);
    assert.equal(loadGenerationJob(job.id)?.stage, 'recovery');
    assert.equal(await fs.stat(recoveryDir).then(() => true).catch(() => false), false);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('finalizes an interrupted publication when every hash and plan revision match', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-publisher-finalize-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const unit = structuredClone(SEED_CURRICULUM[0]) as SeedUnit;
    const timestamp = new Date().toISOString();
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    const storedPlan = replacePlan(plan);
    const oldPlanContent = await fs.readFile(getPlanPath(), 'utf8');
    const targetPlan = preparePlanUpdate(storedPlan, (draft) => {
      draft.units[0].title = 'fully published title';
    }, timestamp);
    const targetPlanContent = `${JSON.stringify(targetPlan, null, 2)}\n`;
    const lessonPath = getLessonPath(unit.id);
    const lessonContent = 'fully published lesson\n';
    const transactionId = 'finalize-fixture';
    const recoveryDir = getPublicationRecoveryDir(transactionId);
    await fs.mkdir(recoveryDir, { recursive: true });
    const planBackupPath = path.join(recoveryDir, 'plan.bak');
    writeTextFile(planBackupPath, oldPlanContent);
    writeTextFile(getPlanPath(), targetPlanContent);
    writeTextFile(lessonPath, lessonContent);
    const job = { ...createGenerationJob(unit.id, 'input-hash'), status: 'publishing' as const, stage: 'publishing' };
    saveGenerationJob(job);
    saveArtifactManifest(artifactManifestSchema.parse({
      schemaVersion: 1,
      unitId: unit.id,
      jobId: job.id,
      status: 'publishing',
      targetStatus: 'published',
      inputHash: 'input-hash',
      updatedAt: timestamp,
      recovery: {
        transactionId,
        createdAt: timestamp,
        basePlanRevision: storedPlan.revision,
        targetPlanRevision: targetPlan.revision,
        files: [{
          path: path.relative(getFcDir(), getPlanPath()), existed: true,
          backupPath: path.relative(getFcDir(), planBackupPath), backupHash: hash(oldPlanContent), expectedHash: hash(targetPlanContent),
        }, {
          path: path.relative(getFcDir(), lessonPath), existed: false, expectedHash: hash(lessonContent),
        }],
      },
      files: [{ path: path.relative(getFcDir(), lessonPath), hash: hash(lessonContent), role: 'lesson', protected: false }],
    }));

    assert.deepEqual(inspectInterruptedPublications().map((item) => item.state), ['ready-to-finalize']);
    assert.deepEqual(recoverInterruptedPublications().map((item) => item.action), ['finalized']);
    assert.equal(loadArtifactManifest(unit.id)?.status, 'published');
    assert.equal(loadArtifactManifest(unit.id)?.recovery, undefined);
    assert.equal(loadGenerationJob(job.id)?.status, 'published');
    assert.equal(await fs.readFile(lessonPath, 'utf8'), lessonContent);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('refuses automatic rollback when an interrupted file has an unknown hash', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-publisher-manual-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const unit = structuredClone(SEED_CURRICULUM[0]) as SeedUnit;
    const timestamp = new Date().toISOString();
    const plan: LearningPlan = {
      learnerProfile: {
        target: 'test', programmingLevel: 'basic', dsaLevel: 'none', weeklyHours: '2-5', totalWeeks: '1-4',
        learningStyle: 'example-first', codePractice: 'yes', pace: 'normal', nearTermGoal: '', rawAnswers: {}, summary: '',
      },
      units: [unit], currentIndex: 0, revision: 0, origin: 'offline', createdAt: timestamp, updatedAt: timestamp,
    };
    const storedPlan = replacePlan(plan);
    const lessonPath = getLessonPath(unit.id);
    const transactionId = 'manual-fixture';
    const recoveryDir = getPublicationRecoveryDir(transactionId);
    await fs.mkdir(recoveryDir, { recursive: true });
    const lessonBackupPath = path.join(recoveryDir, 'lesson.bak');
    writeTextFile(lessonBackupPath, 'old lesson\n');
    writeTextFile(lessonPath, 'user-edited unknown content\n');
    saveArtifactManifest(artifactManifestSchema.parse({
      schemaVersion: 1,
      unitId: unit.id,
      status: 'publishing',
      targetStatus: 'published',
      inputHash: 'input-hash',
      updatedAt: timestamp,
      recovery: {
        transactionId,
        createdAt: timestamp,
        basePlanRevision: storedPlan.revision,
        targetPlanRevision: storedPlan.revision + 1,
        files: [{
          path: path.relative(getFcDir(), lessonPath), existed: true,
          backupPath: path.relative(getFcDir(), lessonBackupPath), backupHash: hash('old lesson\n'), expectedHash: hash('generated lesson\n'),
        }],
      },
      files: [{ path: path.relative(getFcDir(), lessonPath), hash: hash('generated lesson\n'), role: 'lesson', protected: false }],
    }));

    assert.deepEqual(inspectInterruptedPublications().map((item) => item.state), ['manual-required']);
    assert.deepEqual(recoverInterruptedPublications().map((item) => item.action), ['manual-required']);
    assert.equal(await fs.readFile(lessonPath, 'utf8'), 'user-edited unknown content\n');
    assert.equal(loadArtifactManifest(unit.id)?.status, 'failed');
    assert.ok(loadArtifactManifest(unit.id)?.recovery);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

function hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
