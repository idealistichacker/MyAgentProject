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
import {
  artifactManifestSchema,
  generationJobSchema,
  qualityReportSchema,
  type ArtifactFile,
  type ArtifactManifest,
  type GenerationJob,
  type GenerationStatus,
  type QualityReport,
  type SeedUnit,
} from '../types.js';
import {
  getArtifactManifestPath,
  getExtensionForLanguage,
  getFcDir,
  getGenerationJobPath,
  getLessonPath,
  getProjectSpecPath,
  getPublicationLockPath,
  getSolutionPath,
  getStarterPath,
} from '../utils/paths.js';

export interface PublishUnitOptions {
  inputHash: string;
  job?: GenerationJob;
  qualityReport?: QualityReport;
  status: Extract<GenerationStatus, 'published' | 'offline'>;
  resetSolution?: boolean;
}

export interface PublishedUnitArtifacts {
  lessonPath: string;
  starterPath?: string;
  solutionPath?: string;
  projectSpecPath?: string;
  solutionPreserved: boolean;
  manifest: ArtifactManifest;
}

export function createGenerationJob(unitId: string, inputHash: string): GenerationJob {
  const now = new Date().toISOString();
  return generationJobSchema.parse({
    id: `${unitId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    unitId,
    status: 'planned',
    stage: 'planned',
    attempt: 1,
    inputHash,
    startedAt: now,
    updatedAt: now,
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

export function publishUnitArtifacts(
  unit: SeedUnit,
  options: PublishUnitOptions
): PublishedUnitArtifacts {
  return withFileLock(getPublicationLockPath(), () => {
    const plan = loadPlan();
    if (!plan) {
      throw new Error('Cannot publish artifacts without a learning plan.');
    }

    const unitIndex = plan.units.findIndex((candidate) => candidate.id === unit.id);
    if (unitIndex === -1) {
      throw new Error(`Cannot publish unknown unit "${unit.id}".`);
    }

    const now = new Date().toISOString();
    const pendingManifest = artifactManifestSchema.parse({
      schemaVersion: 1,
      unitId: unit.id,
      jobId: options.job?.id,
      status: 'publishing',
      inputHash: options.inputHash,
      updatedAt: now,
      qualityReport: options.qualityReport,
      files: [],
    });
    saveArtifactManifest(pendingManifest);

    const files: ArtifactFile[] = [];
    const lessonPath = getLessonPath(unit.id);
    writeTextFile(lessonPath, renderLessonMarkdown(unit));
    files.push(toArtifactFile(lessonPath, 'lesson', false));

    let starterPath: string | undefined;
    let solutionPath: string | undefined;
    let solutionPreserved = false;
    if (unit.exercise) {
      const extension = getExtensionForLanguage(unit.exercise.language);
      starterPath = getStarterPath(unit.id, extension);
      solutionPath = getSolutionPath(unit.id, extension);
      writeTextFile(starterPath, unit.exercise.starterCode);
      files.push(toArtifactFile(starterPath, 'starter', false));

      if (options.resetSolution || !fs.existsSync(solutionPath)) {
        writeTextFile(solutionPath, unit.exercise.starterCode);
      } else {
        solutionPreserved = true;
      }
      files.push(toArtifactFile(solutionPath, 'solution', solutionPreserved));
    }

    let projectSpecPath: string | undefined;
    if (unit.type === 'project' && unit.project) {
      projectSpecPath = getProjectSpecPath(unit.id);
      writeTextFile(projectSpecPath, renderProjectSpecMarkdown(unit));
      files.push(toArtifactFile(projectSpecPath, 'project', false));
    }

    plan.units[unitIndex] = unit;
    plan.updatedAt = now;
    writeJson(path.join(getFcDir(), 'plan.json'), plan);

    const manifest = artifactManifestSchema.parse({
      ...pendingManifest,
      status: options.status,
      publishedAt: now,
      updatedAt: now,
      files,
    });
    saveArtifactManifest(manifest);

    return {
      lessonPath,
      starterPath,
      solutionPath,
      projectSpecPath,
      solutionPreserved,
      manifest,
    };
  });
}

export function createPassedQualityReport(checks: string[]): QualityReport {
  return qualityReportSchema.parse({
    passed: true,
    checks,
    issues: [],
    evaluatedAt: new Date().toISOString(),
  });
}

function toArtifactFile(
  filePath: string,
  role: ArtifactFile['role'],
  protectedFile: boolean
): ArtifactFile {
  return {
    path: path.relative(getFcDir(), filePath),
    hash: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    role,
    protected: protectedFile,
  };
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
    `- [${source.title}](${source.url}) — ${source.publisher} (${source.trust}, retrieved ${source.retrievedAt.slice(0, 10)})`
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
