import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadPlan,
  readJson,
  withFileLock,
  writeJson,
  writeTextFile,
} from '../state/fsState.js';
import { commitPreparedPlan, PlanConflictError, preparePlanUpdate } from '../state/planStore.js';
import {
  artifactManifestSchema,
  generationJobSchema,
  qualityReportSchema,
  type ArtifactFile,
  type ArtifactManifest,
  type GenerationJob,
  type GenerationStatus,
  type QualityReport,
  type PublicationRecovery,
  type SeedUnit,
} from '../types.js';
import {
  getArtifactManifestPath,
  getExtensionForLanguage,
  getFcDir,
  getGenerationJobPath,
  getJobsDir,
  getLessonPath,
  getManifestsDir,
  getPlanPath,
  getPreviewArtifactPath,
  getPreviewLessonPath,
  getPreviewProjectSpecPath,
  getPreviewStarterPath,
  getProjectSpecPath,
  getPublicationLockPath,
  getPublicationRecoveryDir,
  getSolutionPath,
  getStarterPath,
} from '../utils/paths.js';

export interface PublishUnitOptions {
  inputHash: string;
  job?: GenerationJob;
  qualityReport?: QualityReport;
  status: Extract<GenerationStatus, 'published' | 'offline'>;
  resetSolution?: boolean;
  expectedPlanRevision?: number;
}

export interface PublishedUnitArtifacts {
  lessonPath: string;
  starterPath?: string;
  solutionPath?: string;
  projectSpecPath?: string;
  solutionPreserved: boolean;
  manifest: ArtifactManifest;
}

export interface PreviewUnitArtifacts {
  lessonPath: string;
  starterPath?: string;
  projectSpecPath?: string;
  artifactPath: string;
  solutionPreserved: true;
}

export interface PublicationRecoveryResult {
  unitId: string;
  action: 'finalized' | 'rolled-back' | 'manual-required' | 'recovery-failed';
  message: string;
}

export interface PublicationRecoveryInspection {
  unitId: string;
  state: 'ready-to-finalize' | 'safe-to-rollback' | 'manual-required';
  message: string;
}

export function createGenerationJob(
  unitId: string,
  inputHash: string,
  parentJob?: GenerationJob,
  validationMode: 'full' | 'content-only' = parentJob?.validationMode ?? 'full'
): GenerationJob {
  const now = new Date().toISOString();
  return generationJobSchema.parse({
    id: `${unitId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    unitId,
    status: 'planned',
    stage: 'planned',
    attempt: parentJob ? parentJob.attempt + 1 : 1,
    parentJobId: parentJob?.id,
    validationMode,
    inputHash,
    startedAt: now,
    updatedAt: now,
    checkpoints: parentJob?.checkpoints ?? [],
  });
}

export function saveGenerationJob(job: GenerationJob): void {
  writeJson(getGenerationJobPath(job.id), generationJobSchema.parse(job));
}

export function loadGenerationJob(jobId: string): GenerationJob | undefined {
  const jobPath = getGenerationJobPath(jobId);
  if (!fs.existsSync(jobPath)) {
    return undefined;
  }
  return generationJobSchema.parse(readJson<unknown>(jobPath, {}));
}

export function listGenerationJobs(): GenerationJob[] {
  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) {
    return [];
  }
  return fs.readdirSync(jobsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .flatMap((fileName) => {
      try {
        return [generationJobSchema.parse(readJson<unknown>(path.join(jobsDir, fileName), {}))];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function loadArtifactManifest(unitId: string): ArtifactManifest | undefined {
  const manifestPath = getArtifactManifestPath(unitId);
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }
  return artifactManifestSchema.parse(readJson<unknown>(manifestPath, {}));
}

export function saveArtifactManifest(manifest: ArtifactManifest): void {
  writeJson(getArtifactManifestPath(manifest.unitId), artifactManifestSchema.parse(manifest));
}

export function inspectInterruptedPublications(): PublicationRecoveryInspection[] {
  return listPublishingManifests().map(inspectPublishingManifest);
}

export function recoverInterruptedPublications(): PublicationRecoveryResult[] {
  return withFileLock(getPublicationLockPath(), () => {
    const results: PublicationRecoveryResult[] = [];
    for (const manifest of listPublishingManifests()) {
      const inspection = inspectPublishingManifest(manifest);
      if (inspection.state === 'ready-to-finalize' && manifest.recovery && manifest.targetStatus) {
        const now = new Date().toISOString();
        const message = 'Interrupted publication already contained every expected hash and plan revision; final manifest was completed safely.';
        saveArtifactManifest(artifactManifestSchema.parse({
          ...manifest,
          status: manifest.targetStatus,
          targetStatus: undefined,
          publishedAt: now,
          updatedAt: now,
          recoveredAt: now,
          recovery: undefined,
          error: undefined,
        }));
        removeRecoveryDirectory(manifest.recovery);
        markGenerationJobCompleted(manifest.jobId, manifest.targetStatus);
        results.push({ unitId: manifest.unitId, action: 'finalized', message });
        continue;
      }

      if (inspection.state === 'manual-required' || !manifest.recovery) {
        const message = inspection.message;
        saveArtifactManifest(artifactManifestSchema.parse({
          ...manifest,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          recoveredAt: new Date().toISOString(),
          error: message,
        }));
        markGenerationJobFailed(manifest.jobId, message);
        results.push({ unitId: manifest.unitId, action: 'manual-required', message });
        continue;
      }

      try {
        rollbackPublication(manifest.recovery);
        const message = 'Interrupted publication was rolled back from its recovery journal. Retry generation to publish again.';
        saveArtifactManifest(artifactManifestSchema.parse({
          ...manifest,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          recoveredAt: new Date().toISOString(),
          recovery: undefined,
          error: message,
        }));
        markGenerationJobFailed(manifest.jobId, message);
        results.push({ unitId: manifest.unitId, action: 'rolled-back', message });
      } catch (error) {
        results.push({
          unitId: manifest.unitId,
          action: 'recovery-failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  });
}

function listPublishingManifests(): ArtifactManifest[] {
  const manifestsDir = getManifestsDir();
  if (!fs.existsSync(manifestsDir)) return [];
  return fs.readdirSync(manifestsDir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((fileName) => {
      try {
        const manifest = artifactManifestSchema.parse(readJson<unknown>(path.join(manifestsDir, fileName), {}));
        return manifest.status === 'publishing' ? [manifest] : [];
      } catch {
        return [];
      }
    });
}

function inspectPublishingManifest(manifest: ArtifactManifest): PublicationRecoveryInspection {
  const recovery = manifest.recovery;
  if (!recovery || recovery.basePlanRevision === undefined || recovery.targetPlanRevision === undefined || !manifest.targetStatus) {
    return {
      unitId: manifest.unitId,
      state: 'manual-required',
      message: 'Interrupted legacy publication lacks hashes, plan revisions, or target status; generated files require manual inspection.',
    };
  }
  const planRevision = loadPlan()?.revision;
  const journalStates = recovery.files.map((item) => {
    const targetPath = resolveFcRelativePath(item.path);
    const currentHash = fs.existsSync(targetPath) ? hashContent(fs.readFileSync(targetPath)) : undefined;
    return {
      expected: Boolean(item.expectedHash && currentHash === item.expectedHash),
      known: currentHash === item.expectedHash || (item.existed ? currentHash === item.backupHash : currentHash === undefined),
    };
  });
  const allExpected = journalStates.every((state) => state.expected) && manifestFilesMatch(manifest.files);
  if (allExpected && planRevision === recovery.targetPlanRevision) {
    return {
      unitId: manifest.unitId,
      state: 'ready-to-finalize',
      message: 'All expected file hashes and the target plan revision are present.',
    };
  }
  const knownPartialState = journalStates.every((state) => state.known)
    && (planRevision === recovery.basePlanRevision || planRevision === recovery.targetPlanRevision);
  if (knownPartialState) {
    return {
      unitId: manifest.unitId,
      state: 'safe-to-rollback',
      message: 'Only journaled old/new hashes are present and the plan revision is recoverable.',
    };
  }
  return {
    unitId: manifest.unitId,
    state: 'manual-required',
    message: `Recovery found an unknown file hash or plan revision (${String(planRevision)}); automatic rollback was not attempted.`,
  };
}

function manifestFilesMatch(files: ArtifactFile[]): boolean {
  return files.every((file) => {
    const filePath = resolveFcRelativePath(file.path);
    return fs.existsSync(filePath) && hashContent(fs.readFileSync(filePath)) === file.hash;
  });
}

export function publishUnitArtifacts(
  unit: SeedUnit,
  options: PublishUnitOptions
): PublishedUnitArtifacts {
  return withFileLock(getPublicationLockPath(), () => {
    const plan = loadPlan();
    if (!plan) {
      throw new Error('Cannot publish artifacts without a learning plan.');
    }
    if (options.expectedPlanRevision !== undefined && plan.revision !== options.expectedPlanRevision) {
      throw new PlanConflictError(options.expectedPlanRevision, plan.revision);
    }

    const unitIndex = plan.units.findIndex((candidate) => candidate.id === unit.id);
    if (unitIndex === -1) {
      throw new Error(`Cannot publish unknown unit "${unit.id}".`);
    }

    const now = new Date().toISOString();
    const lessonPath = getLessonPath(unit.id);
    const lessonContent = renderLessonMarkdown(unit);
    const extension = unit.exercise ? getExtensionForLanguage(unit.exercise.language) : undefined;
    const starterPath = extension ? getStarterPath(unit.id, extension) : undefined;
    const solutionPath = extension ? getSolutionPath(unit.id, extension) : undefined;
    const solutionWillBeWritten = Boolean(solutionPath && (options.resetSolution || !fs.existsSync(solutionPath)));
    const projectSpecPath = unit.type === 'project' && unit.project ? getProjectSpecPath(unit.id) : undefined;
    const projectSpecContent = projectSpecPath ? renderProjectSpecMarkdown(unit) : undefined;
    const nextPlan = preparePlanUpdate(plan, (draft) => {
      draft.units[unitIndex] = unit;
    }, now);
    const expectedFiles: ArtifactFile[] = [toArtifactFileContent(lessonPath, lessonContent, 'lesson', false)];
    if (unit.exercise && starterPath && solutionPath) {
      expectedFiles.push(toArtifactFileContent(starterPath, unit.exercise.starterCode, 'starter', false));
      expectedFiles.push(solutionWillBeWritten
        ? toArtifactFileContent(solutionPath, unit.exercise.starterCode, 'solution', false)
        : toArtifactFile(solutionPath, 'solution', true));
    }
    if (projectSpecPath && projectSpecContent !== undefined) {
      expectedFiles.push(toArtifactFileContent(projectSpecPath, projectSpecContent, 'project', false));
    }
    const transactionId = options.job?.id ?? `pub-${crypto.randomBytes(12).toString('hex')}`;
    const recovery = createPublicationRecovery(
      transactionId,
      plan.revision,
      nextPlan.revision,
      [
        { path: getPlanPath(), content: serializeJson(nextPlan) },
        { path: lessonPath, content: lessonContent },
        ...(unit.exercise && starterPath ? [{ path: starterPath, content: unit.exercise.starterCode }] : []),
        ...(solutionWillBeWritten && solutionPath && unit.exercise ? [{ path: solutionPath, content: unit.exercise.starterCode }] : []),
        ...(projectSpecPath && projectSpecContent !== undefined ? [{ path: projectSpecPath, content: projectSpecContent }] : []),
      ]
    );
    const pendingManifest = artifactManifestSchema.parse({
      schemaVersion: 1,
      unitId: unit.id,
      jobId: options.job?.id,
      status: 'publishing',
      targetStatus: options.status,
      inputHash: options.inputHash,
      updatedAt: now,
      qualityReport: options.qualityReport,
      sourcePolicyVersion: 'source-pack-v2',
      sources: (unit.sources ?? []).map((source) => ({
        id: source.id,
        url: source.url,
        publisher: source.publisher,
        retrievedAt: source.retrievedAt,
        hash: source.hash,
        trust: source.trust,
        freshness: source.freshness,
      })),
      recovery,
      files: expectedFiles,
    });
    try {
      saveArtifactManifest(pendingManifest);
    } catch (error) {
      removeRecoveryDirectory(recovery);
      throw error;
    }

    try {
      writeTextFile(lessonPath, lessonContent);

      let solutionPreserved = false;
      if (unit.exercise && starterPath && solutionPath) {
        writeTextFile(starterPath, unit.exercise.starterCode);

        if (solutionWillBeWritten) {
          writeTextFile(solutionPath, unit.exercise.starterCode);
        } else {
          solutionPreserved = true;
        }
      }

      if (projectSpecPath && projectSpecContent !== undefined) {
        writeTextFile(projectSpecPath, projectSpecContent);
      }

      commitPreparedPlan(plan, nextPlan);

      const manifest = artifactManifestSchema.parse({
        ...pendingManifest,
        status: options.status,
        publishedAt: now,
        updatedAt: now,
        targetStatus: undefined,
        recovery: undefined,
        files: expectedFiles,
      });
      saveArtifactManifest(manifest);
      removeRecoveryDirectory(recovery);

      return {
        lessonPath,
        starterPath,
        solutionPath,
        projectSpecPath,
        solutionPreserved,
        manifest,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        rollbackPublication(recovery);
        saveArtifactManifest(artifactManifestSchema.parse({
          ...pendingManifest,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          recoveredAt: new Date().toISOString(),
          recovery: undefined,
          error: `Publication rolled back after failure: ${message}`,
        }));
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Publication failed and rollback could not complete for unit "${unit.id}".`);
      }
      throw error;
    }
  });
}

export function writePreviewUnitArtifacts(unit: SeedUnit): PreviewUnitArtifacts {
  const lessonPath = getPreviewLessonPath(unit.id);
  const artifactPath = getPreviewArtifactPath(unit.id);
  const extension = unit.exercise ? getExtensionForLanguage(unit.exercise.language) : undefined;
  const starterPath = extension ? getPreviewStarterPath(unit.id, extension) : undefined;
  const projectSpecPath = unit.type === 'project' && unit.project
    ? getPreviewProjectSpecPath(unit.id)
    : undefined;

  writeTextFile(lessonPath, renderLessonMarkdown(unit));
  writeJson(artifactPath, unit);
  if (starterPath && unit.exercise) {
    writeTextFile(starterPath, unit.exercise.starterCode);
  }
  if (projectSpecPath) {
    writeTextFile(projectSpecPath, renderProjectSpecMarkdown(unit));
  }

  return {
    lessonPath,
    starterPath,
    projectSpecPath,
    artifactPath,
    solutionPreserved: true,
  };
}

export function createPassedQualityReport(checks: string[]): QualityReport {
  return qualityReportSchema.parse({
    passed: true,
    checks,
    issues: [],
    evaluatedAt: new Date().toISOString(),
  });
}

interface PublicationTarget {
  path: string;
  content: string;
}

function createPublicationRecovery(
  transactionId: string,
  basePlanRevision: number,
  targetPlanRevision: number,
  targets: PublicationTarget[]
): PublicationRecovery {
  const recoveryDir = getPublicationRecoveryDir(transactionId);
  fs.mkdirSync(recoveryDir, { recursive: true });
  try {
    const uniqueTargets = [...new Map(targets.map((target) => [path.resolve(target.path), target])).values()];
    const files = uniqueTargets.map((target, index) => {
      const targetPath = path.resolve(target.path);
      const relativeTarget = toFcRelativePath(targetPath);
      if (!fs.existsSync(targetPath)) {
        return { path: relativeTarget, existed: false, expectedHash: hashContent(target.content) };
      }
      const backupPath = path.join(recoveryDir, `${index}.bak`);
      const previousContent = fs.readFileSync(targetPath, 'utf8');
      writeTextFile(backupPath, previousContent);
      return {
        path: relativeTarget,
        existed: true,
        backupPath: toFcRelativePath(backupPath),
        backupHash: hashContent(previousContent),
        expectedHash: hashContent(target.content),
      };
    });
    return {
      transactionId,
      createdAt: new Date().toISOString(),
      basePlanRevision,
      targetPlanRevision,
      files,
    };
  } catch (error) {
    fs.rmSync(recoveryDir, { recursive: true, force: true });
    throw error;
  }
}

function rollbackPublication(recovery: PublicationRecovery): void {
  for (const item of [...recovery.files].reverse()) {
    const targetPath = resolveFcRelativePath(item.path);
    if (!item.existed) {
      fs.rmSync(targetPath, { force: true });
      continue;
    }
    if (!item.backupPath) {
      throw new Error(`Recovery journal has no backup for existing file "${item.path}".`);
    }
    const backupPath = resolveFcRelativePath(item.backupPath);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Recovery backup is missing: ${item.backupPath}`);
    }
    writeTextFile(targetPath, fs.readFileSync(backupPath, 'utf8'));
  }
  removeRecoveryDirectory(recovery);
}

function removeRecoveryDirectory(recovery: PublicationRecovery): void {
  fs.rmSync(getPublicationRecoveryDir(recovery.transactionId), { recursive: true, force: true });
}

function markGenerationJobFailed(jobId: string | undefined, message: string): void {
  if (!jobId) return;
  const job = loadGenerationJob(jobId);
  if (!job) return;
  const now = new Date().toISOString();
  saveGenerationJob({
    ...job,
    status: 'failed',
    stage: 'recovery',
    error: message,
    updatedAt: now,
    completedAt: now,
  });
}

function markGenerationJobCompleted(
  jobId: string | undefined,
  status: Extract<GenerationStatus, 'published' | 'offline'>
): void {
  if (!jobId) return;
  const job = loadGenerationJob(jobId);
  if (!job) return;
  const now = new Date().toISOString();
  saveGenerationJob({
    ...job,
    status,
    stage: 'completed',
    error: undefined,
    updatedAt: now,
    completedAt: now,
  });
}

function toFcRelativePath(targetPath: string): string {
  const basePath = path.resolve(getFcDir());
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== basePath && !resolvedTarget.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Publication recovery target is outside the project state directory: ${targetPath}`);
  }
  return path.relative(basePath, resolvedTarget);
}

function resolveFcRelativePath(relativePath: string): string {
  const basePath = path.resolve(getFcDir());
  const resolvedTarget = path.resolve(basePath, relativePath);
  if (resolvedTarget !== basePath && !resolvedTarget.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Unsafe publication recovery path: ${relativePath}`);
  }
  return resolvedTarget;
}

function toArtifactFile(
  filePath: string,
  role: ArtifactFile['role'],
  protectedFile: boolean
): ArtifactFile {
  return {
    path: path.relative(getFcDir(), filePath),
    hash: hashContent(fs.readFileSync(filePath)),
    role,
    protected: protectedFile,
  };
}

function toArtifactFileContent(
  filePath: string,
  content: string,
  role: ArtifactFile['role'],
  protectedFile: boolean
): ArtifactFile {
  return {
    path: path.relative(getFcDir(), filePath),
    hash: hashContent(content),
    role,
    protected: protectedFile,
  };
}

function hashContent(content: string | NodeJS.ArrayBufferView): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderProjectSpecMarkdown(unit: SeedUnit): string {
  const project = unit.project;
  if (!project) {
    return `# ${unit.title}\n\n${unit.description}\n`;
  }

  const milestones = project.milestones.map((milestone, index) => [
    `### ${index + 1}. ${milestone.title}`,
    '',
    milestone.goal,
    '',
    '**Learner Tasks**',
    formatMarkdownList(milestone.learnerTasks, '补全这一阶段的核心实现。'),
    '',
    '**Acceptance Criteria**',
    formatMarkdownList(milestone.acceptanceCriteria, '这一阶段可以被本地测试或人工检查验证。'),
  ].join('\n')).join('\n\n');

  const files = project.files.map((file) =>
    `- \`${file.path}\` - ${file.purpose}${file.required === false ? ' (optional)' : ''}`
  ).join('\n');
  const rubric = project.rubric.map((item) =>
    `- **${item.criterion} (${item.points} pts)**: ${item.evidence}`
  ).join('\n');

  return [
    `# ${project.title}`,
    '',
    `> ${project.narrative}`,
    '',
    '## Driving Question',
    '',
    project.drivingQuestion,
    '',
    '## Deliverables',
    '',
    formatMarkdownList(project.deliverables, '完成 starter code 并通过本地测试。'),
    '',
    '## Milestones',
    '',
    milestones || '项目阶段待生成。',
    '',
    '## Files',
    '',
    files || '- `solution.ts` - Main implementation file.',
    '',
    '## Local Check',
    '',
    unit.exercise
      ? `Run \`fc submit ${unit.id}\` to execute the generated tests for \`${unit.exercise.entrypoint}\`.`
      : `Run \`fc submit ${unit.id}\` after the exercise metadata is generated.`,
    '',
    '## Rubric',
    '',
    rubric || '- **Correctness**: pass the generated tests.',
    '',
    '## Extension Ideas',
    '',
    formatMarkdownList(project.extensionIdeas, 'Add your own hidden tests after passing the official checks.'),
    '',
  ].join('\n');
}

function renderLessonMarkdown(unit: SeedUnit): string {
  const sources = unit.sources ?? [];
  if (sources.length === 0) {
    return unit.content ?? '';
  }

  const references = sources.map((source) =>
    `- [${source.title}](${source.url}) — ${source.publisher} (${source.trust}, ${source.freshness ?? 'fresh'}, retrieved ${source.retrievedAt.slice(0, 10)})`
  );
  return [
    unit.content?.trim() ?? '',
    '',
    '## 参考来源',
    '',
    ...references,
    '',
  ].join('\n');
}

function formatMarkdownList(items: string[], fallback: string): string {
  const list = items.length > 0 ? items : [fallback];
  return list.map((item) => `- ${item}`).join('\n');
}
