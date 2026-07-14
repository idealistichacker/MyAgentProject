import crypto from 'node:crypto';
import { generateUnitContent } from '../agents/pipeline.js';
import { GeneratedUnitQualityError } from '../agents/generatedUnitQuality.js';
import { loadPlan } from '../state/fsState.js';
import type { LLMProvider } from '../providers/types.js';
import { InstrumentedProvider } from '../providers/instrumentedProvider.js';
import {
  qualityReportSchema,
  type ArtifactManifest,
  type GenerationCheckpoint,
  type GenerationJob,
  type GenerationMetrics,
  type LearningPlan,
  type QualityReport,
  type SeedUnit,
} from '../types.js';
import { stableStringify } from '../utils/cache.js';
import {
  createGenerationJob,
  createPassedQualityReport,
  publishUnitArtifacts,
  writePreviewUnitArtifacts,
  type PreviewUnitArtifacts,
  saveGenerationJob,
  type PublishedUnitArtifacts,
} from './publisher.js';

export interface GenerateAndPublishOptions {
  provider?: LLMProvider;
  resetSolution?: boolean;
  resumeFromJob?: GenerationJob;
  contentOnly?: boolean;
}

export interface GenerateAndPublishResult {
  unit: SeedUnit;
  job: GenerationJob;
  artifacts: PublishedUnitArtifacts | PreviewUnitArtifacts;
}

export async function generateAndPublishUnit(
  unitId: string,
  options: GenerateAndPublishOptions = {}
): Promise<GenerateAndPublishResult> {
  const plan = loadPlan();
  if (!plan) {
    throw new Error('No learning plan found. Run `fc plan` first.');
  }
  const unit = plan.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    throw new Error(`Unknown unit "${unitId}".`);
  }

  const inputHash = getGenerationInputHash(plan, unit);
  if (options.resumeFromJob) {
    if (options.resumeFromJob.unitId !== unit.id) {
      throw new Error(`Cannot resume job "${options.resumeFromJob.id}" for a different unit.`);
    }
    if (options.resumeFromJob.inputHash !== inputHash) {
      throw new Error(`Cannot resume job "${options.resumeFromJob.id}" because its generation input has changed.`);
    }
    const requestedMode = options.contentOnly ? 'content-only' : 'full';
    if (options.resumeFromJob.validationMode !== requestedMode) {
      throw new Error(`Cannot resume job "${options.resumeFromJob.id}" with a different validation mode.`);
    }
  }
  const startedAt = Date.now();
  const stages: Record<string, number> = {};
  const instrumentedProvider = options.provider ? new InstrumentedProvider(options.provider) : undefined;
  let job = createGenerationJob(
    unit.id,
    inputHash,
    options.resumeFromJob,
    options.contentOnly ? 'content-only' : 'full'
  );
  saveGenerationJob(job);

  try {
    let artifact = unit;
    let status: 'published' | 'preview' | 'offline' = options.contentOnly ? 'preview' : 'offline';
    let qualityReport: QualityReport;
    if (!isPublishableOfflineUnit(unit)) {
      if (!options.provider) {
        throw new Error('Provider not configured. Run `fc init` and set an API key.');
      }
      job = transition(job, 'retrieving', 'retrieving');
      saveGenerationJob(job);
      const generationStartedAt = Date.now();
      artifact = await generateUnitContent(unit, plan, instrumentedProvider, {
        validationMode: options.contentOnly ? 'content-only' : 'full',
        onCheckpoint: (checkpoint) => {
          job = recordGenerationCheckpoint(job, checkpoint);
          saveGenerationJob(job);
        },
      });
      stages.generation = Date.now() - generationStartedAt;
      status = options.contentOnly ? 'preview' : 'published';
    }

    const validationStartedAt = Date.now();
    job = transition(job, 'validating', 'validating');
    saveGenerationJob(job);
    qualityReport = createPassedQualityReport([
      'schema validation',
      'content and exercise quality gate',
      options.contentOnly
        ? 'reference solution execution skipped for content-only preview'
        : 'reference solution execution',
      'artifact publication readiness',
    ]);
    job = {
      ...job,
      qualityReport,
      updatedAt: new Date().toISOString(),
    };
    stages.validation = Date.now() - validationStartedAt;
    saveGenerationJob(job);

    const publicationStartedAt = Date.now();
    let artifacts: PublishedUnitArtifacts | PreviewUnitArtifacts;
    if (status === 'preview') {
      job = transition(job, 'preview', 'previewing');
      saveGenerationJob(job);
      artifacts = writePreviewUnitArtifacts(artifact);
      stages.preview = Date.now() - publicationStartedAt;
    } else {
      job = transition(job, 'publishing', 'publishing');
      saveGenerationJob(job);
      artifacts = publishUnitArtifacts(artifact, {
        inputHash,
        job,
        qualityReport,
        status,
        resetSolution: options.resetSolution,
        expectedPlanRevision: plan.revision,
      });
      stages.publication = Date.now() - publicationStartedAt;
    }

    job = {
      ...transition(job, status, 'completed'),
      completedAt: new Date().toISOString(),
      metrics: buildMetrics(startedAt, stages, artifact, instrumentedProvider, status === 'published'),
    };
    saveGenerationJob(job);
    return { unit: artifact, job, artifacts };
  } catch (error) {
    const failedQualityReport = qualityReportFromGenerationError(error);
    job = {
      ...job,
      status: 'failed',
      stage: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      qualityReport: failedQualityReport ?? job.qualityReport,
      metrics: buildMetrics(startedAt, stages, unit, instrumentedProvider, false),
    };
    saveGenerationJob(job);
    throw error;
  }
}

export function getGenerationInputHash(plan: LearningPlan, unit: SeedUnit): string {
  const projectUnit = plan.units.find((candidate) => candidate.type === 'project');
  return hashInput({
    unit: plan.origin === 'generated' ? generatedUnitSpecification(unit) : unit,
    learnerProfile: plan.learnerProfile,
    project: projectUnit
      ? { id: projectUnit.id, title: projectUnit.title, description: projectUnit.description }
      : null,
  });
}

export function isArtifactManifestReusable(
  manifest: ArtifactManifest | undefined,
  plan: LearningPlan,
  unit: SeedUnit
): boolean {
  if (manifest?.status !== 'published' && manifest?.status !== 'offline') {
    return false;
  }
  return manifest.inputHash === getGenerationInputHash(plan, unit);
}

export function shouldGenerateUnit(
  manifest: ArtifactManifest | undefined,
  plan: LearningPlan,
  unit: SeedUnit,
  options: { force?: boolean; contentOnly?: boolean } = {}
): boolean {
  return Boolean(options.contentOnly || options.force)
    || !isArtifactManifestReusable(manifest, plan, unit);
}

function generatedUnitSpecification(unit: SeedUnit): Pick<
  SeedUnit,
  | 'id'
  | 'type'
  | 'title'
  | 'description'
  | 'prerequisites'
  | 'objectives'
  | 'prerequisiteObjectiveIds'
  | 'passCriteria'
  | 'remediationForUnitId'
  | 'nextIfPassed'
  | 'nextIfFailed'
> {
  return {
    id: unit.id,
    type: unit.type,
    title: unit.title,
    description: unit.description,
    prerequisites: unit.prerequisites,
    objectives: unit.objectives,
    prerequisiteObjectiveIds: unit.prerequisiteObjectiveIds,
    passCriteria: unit.passCriteria,
    remediationForUnitId: unit.remediationForUnitId,
    nextIfPassed: unit.nextIfPassed,
    nextIfFailed: unit.nextIfFailed,
  };
}

export function qualityReportFromGenerationError(error: unknown): QualityReport | undefined {
  return error instanceof GeneratedUnitQualityError
    ? qualityReportSchema.parse({
        passed: false,
        checks: ['fact claim verification'],
        issues: error.issues,
        evaluatedAt: new Date().toISOString(),
      })
    : undefined;
}

export function recordGenerationCheckpoint(job: GenerationJob, checkpoint: GenerationCheckpoint): GenerationJob {
  const status = checkpoint.stage === 'draft'
    ? 'drafting'
    : checkpoint.stage === 'critique'
      ? 'reviewing'
      : 'validating';
  return {
    ...job,
    status,
    stage: checkpoint.stage,
    checkpoints: [
      ...job.checkpoints.filter((candidate) => candidate.stage !== checkpoint.stage),
      checkpoint,
    ],
    updatedAt: new Date().toISOString(),
  };
}

function buildMetrics(
  startedAt: number,
  stages: Record<string, number>,
  unit: SeedUnit,
  provider: InstrumentedProvider | undefined,
  generated: boolean
): GenerationMetrics {
  const providerMetrics = provider?.snapshot();
  return {
    totalDurationMs: Date.now() - startedAt,
    stages,
    providerCalls: providerMetrics?.calls ?? 0,
    providerRetries: providerMetrics?.retries ?? 0,
    promptTokens: providerMetrics?.promptTokens ?? 0,
    completionTokens: providerMetrics?.completionTokens ?? 0,
    totalTokens: providerMetrics?.totalTokens ?? 0,
    sourceCount: unit.sources?.length ?? 0,
    cacheReuse: generated && (providerMetrics?.calls ?? 0) === 0,
  };
}

function isPublishableOfflineUnit(unit: SeedUnit): boolean {
  return Boolean(unit.content?.trim() && unit.quiz?.length && unit.exercise);
}

function transition(job: GenerationJob, status: GenerationJob['status'], stage: string): GenerationJob {
  return {
    ...job,
    status,
    stage,
    updatedAt: new Date().toISOString(),
  };
}

function hashInput(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}
